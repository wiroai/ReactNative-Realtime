import { ViewStatus } from '../../app/viewStatus';
import {
  AudioPreparationResult,
  RealtimeAudioProfile,
  RealtimeAudioSession,
  preparationErrorMessage,
  preparationNeedsSystemSettings,
} from '../../audio/realtimeAudioSession';
import { RealtimeAudioRouteWatcher } from '../../audio/realtimeAudioRouteWatcher';
import { PcmAudioRecorder, PcmCaptureProfile } from '../../audio/capture';
import { RealtimeSessionGuard, RealtimeSessionLease, RealtimeSessionOwner } from '../../audio/sessionGuard';
import { voxtralMiniRealtime } from '../../models/catalog';
import { ModelDefinition } from '../../models/modelDefinition';
import { ModelParameterValues } from '../../models/modelParameterValues';
import { WiroRunResult } from '../../models/runResult';
import { WiroApiClient } from '../../networking/apiClient';
import { WiroFailure } from '../../networking/failure';
import { RealtimeTaskLauncher } from '../../networking/taskLauncher';
import { RealtimeEvent, RealtimeEventType, realtimeEventWireType } from '../../realtime/event';
import { RealtimeFailureMapper } from '../../realtime/failureMapper';
import { RealtimeOperationGuard } from '../../realtime/operationGuard';
import { ProtocolEventLog } from '../../realtime/protocolEventLog';
import { raceTimeout } from '../../realtime/raceTimeout';
import { RealtimeSessionClient } from '../../realtime/session';
import { SessionElapsedClock } from '../../realtime/elapsedClock';
import { RealtimeSessionState, canStart, canStop, isActive } from '../../realtime/sessionState';
import { WiroRealtimeProtocol } from '../../realtime/protocol';
import { TerminalWait } from '../terminalWait';
import { TranscriptAssembler } from './transcriptAssembler';
import { TranscriptionSessionController } from './sessionController';
import {
  TranscriptionSessionSnapshot,
  initialTranscriptionSessionSnapshot,
  transcriptionSnapshotsEqual,
} from './sessionSnapshot';

export interface SpeechToTextSessionServiceOptions {
  readonly audioSession: RealtimeAudioSession;
  readonly apiClient: WiroApiClient;
  readonly sessionFactory: (
    taskId: string,
    taskToken: string,
  ) => RealtimeSessionClient;
  readonly recorder: PcmAudioRecorder;
  readonly sessionGuard: RealtimeSessionGuard;
  readonly model?: ModelDefinition;
  readonly parameterOverrides?: Readonly<Record<string, string>>;
  readonly terminalTimeoutMs?: number;
}

const DEFAULT_TERMINAL_TIMEOUT_MS = 3_000;

const failureMapper = new RealtimeFailureMapper(
  'The transcription session could not be completed.',
);

/**
 * Runs microphone capture and the realtime transcription session.
 *
 * The service reports itself only through `subscribe`/`snapshot`
 * and never touches view state. There is no playback, barge-in, or
 * reconnect: leaving the tab ends the billed task.
 */
export class SpeechToTextSessionService implements TranscriptionSessionController {
  readonly audioSession: RealtimeAudioSession;
  readonly apiClient: WiroApiClient;
  readonly sessionFactory: (
    taskId: string,
    taskToken: string,
  ) => RealtimeSessionClient;
  readonly recorder: PcmAudioRecorder;
  readonly sessionGuard: RealtimeSessionGuard;
  readonly model: ModelDefinition;
  readonly terminalTimeoutMs: number;

  private readonly listeners: Array<
    (snapshot: TranscriptionSessionSnapshot) => void
  > = [];
  private readonly routeWatcher: RealtimeAudioRouteWatcher;
  private readonly taskLauncher: RealtimeTaskLauncher;
  private readonly operationGuard = new RealtimeOperationGuard();
  private readonly protocolLog = new ProtocolEventLog();
  private readonly elapsedClock = new SessionElapsedClock();
  private readonly transcript = new TranscriptAssembler();

  private currentSnapshot: TranscriptionSessionSnapshot =
    initialTranscriptionSessionSnapshot;
  private storedParameters: ModelParameterValues;
  private sessionLease: RealtimeSessionLease | null = null;
  private session: RealtimeSessionClient | null = null;
  private terminalWait: TerminalWait | null = null;
  private naturalCompletion: Promise<void> | null = null;
  private naturalCompletionRunning = false;
  private startJob: Promise<void> | null = null;
  private pendingStop: Promise<void> | null = null;

  constructor(options: SpeechToTextSessionServiceOptions) {
    this.audioSession = options.audioSession;
    this.apiClient = options.apiClient;
    this.sessionFactory = options.sessionFactory;
    this.recorder = options.recorder;
    this.sessionGuard = options.sessionGuard;
    this.model = options.model ?? voxtralMiniRealtime;
    this.terminalTimeoutMs = options.terminalTimeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS;

    this.taskLauncher = new RealtimeTaskLauncher(this.apiClient);
    this.storedParameters = ModelParameterValues.create({
      fields: this.model.fields,
      overrides: options.parameterOverrides,
    });
    this.routeWatcher = new RealtimeAudioRouteWatcher({
      audioSession: this.audioSession,
      onShouldStop: () => this.stopForAudioRouteSafety(),
      onRouteChanged: () => this.handleRouteChange(),
    });
  }

  get snapshot(): TranscriptionSessionSnapshot {
    return this.currentSnapshot;
  }

  get parameters(): ModelParameterValues {
    return this.storedParameters;
  }

  subscribe(
    listener: (snapshot: TranscriptionSessionSnapshot) => void,
  ): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  async start(): Promise<void> {
    if (this.operationGuard.isDisposed) {
      return;
    }
    if (this.startJob) {
      await this.startJob;
      return;
    }
    if (!canStart(this.snapshot.sessionState)) {
      return;
    }
    const job = this.acquireAndStart().finally(() => {
      if (this.startJob === job) {
        this.startJob = null;
      }
    });
    this.startJob = job;
    await job;
  }

  /**
   * Waits out another feature's teardown before starting.
   *
   * The loading state is published before the wait so a second tap
   * cannot start twice.
   */
  private async acquireAndStart(): Promise<void> {
    const operationId = this.operationGuard.begin();
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.RequestingPermission,
      errorMessage: null,
    });
    const lease = await this.sessionGuard.acquireWhenFree(
      RealtimeSessionOwner.Transcription,
    );
    if (!this.operationGuard.isCurrent(operationId)) {
      this.sessionGuard.release(lease);
      return;
    }
    if (lease === null) {
      this.publish({
        ...this.snapshot,
        status: ViewStatus.Error,
        sessionState: RealtimeSessionState.Failure,
        errorMessage: WiroFailure.SessionBusy.message,
      });
      return;
    }
    this.sessionLease = lease;
    await this.startSession();
  }

  private async startSession(): Promise<void> {
    const operationId = this.operationGuard.begin();
    this.protocolLog.clear();
    this.transcript.reset();
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.RequestingPermission,
      elapsedMs: 0,
      transcript: '',
      microphoneActive: false,
      muted: false,
      errorMessage: null,
      canOpenSystemSettings: false,
      protocolEvents: this.protocolLog.events,
      revealProtocolPanel: false,
    });
    this.recorder.setMuted(false);
    try {
      if (!(await this.prepareAudio(operationId))) {
        return;
      }
      this.publish({
        ...this.snapshot,
        sessionState: RealtimeSessionState.PreparingAudio,
      });
      this.publish({
        ...this.snapshot,
        sessionState: RealtimeSessionState.CreatingTask,
      });
      const runResult = await this.launchTask(operationId);
      if (!runResult) {
        return;
      }
      if (!(await this.openSession(runResult, operationId))) {
        return;
      }
      await this.beginStreaming(operationId);
    } catch (error) {
      if (this.operationGuard.isCurrent(operationId)) {
        await this.fail(operationId, error);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.operationGuard.isDisposed) {
      return;
    }
    if (this.pendingStop) {
      await this.pendingStop;
      return;
    }
    if (!canStop(this.snapshot.sessionState)) {
      return;
    }
    const promise = this.performStop().finally(() => {
      if (this.pendingStop === promise) {
        this.pendingStop = null;
      }
    });
    this.pendingStop = promise;
    await promise;
  }

  private async performStop(): Promise<void> {
    const operationId = this.operationGuard.begin();
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.Stopping,
      microphoneActive: false,
    });
    this.taskLauncher.cancelPendingRequest();
    this.elapsedClock.stop();
    await this.stopCapture();
    await this.naturalCompletion;
    await this.audioSession.deactivate();
    // Hardware is free; holding the lease through the terminal
    // wait would block the next feature for those seconds.
    this.releaseLease();
    const shutdownTimedOut = await this.windDownSession();
    await this.startJob;
    this.session = null;
    this.terminalWait = null;
    this.naturalCompletion = null;
    this.taskLauncher.release();
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    const event = shutdownTimedOut ? 'shutdown_timeout' : 'session_stopped';
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Success,
      sessionState: RealtimeSessionState.Completed,
      microphoneActive: false,
      errorMessage: null,
      protocolEvents: this.protocolLog.add(event),
    });
  }

  setMuted(muted: boolean): void {
    if (this.operationGuard.isDisposed) {
      return;
    }
    this.recorder.setMuted(muted);
    this.publish({
      ...this.snapshot,
      microphoneActive:
        this.snapshot.sessionState === RealtimeSessionState.Streaming && !muted,
      muted,
    });
  }

  setParameter(id: string, value: string): void {
    if (this.operationGuard.isDisposed) {
      return;
    }
    this.storedParameters = this.storedParameters.withValue(id, value);
  }

  clearTranscript(): void {
    if (this.operationGuard.isDisposed || isActive(this.snapshot.sessionState)) {
      return;
    }
    this.transcript.reset();
    this.publish({ ...this.snapshot, transcript: '' });
  }

  async openSystemSettings(): Promise<void> {
    if (this.operationGuard.isDisposed) {
      return;
    }
    if (!(await this.audioSession.openSystemSettings())) {
      this.appendProtocolEvent('system_settings_unavailable');
    }
  }

  async dispose(): Promise<void> {
    if (this.operationGuard.isDisposed) {
      return;
    }
    this.operationGuard.dispose();
    this.taskLauncher.cancelPendingRequest();
    this.elapsedClock.stop();
    await this.disposeResources();
  }

  private async launchTask(operationId: number): Promise<WiroRunResult | null> {
    return this.taskLauncher.launch(
      this.model,
      this.parameters.requestBody(),
      () => this.operationGuard.isCurrent(operationId),
    );
  }

  private async openSession(
    runResult: WiroRunResult,
    operationId: number,
  ): Promise<boolean> {
    const created = this.sessionFactory(runResult.taskId, runResult.taskToken);
    this.session = created;
    this.terminalWait = new TerminalWait();
    this.naturalCompletion = null;
    this.naturalCompletionRunning = false;
    created.addEventListener(event => this.handleEvent(event, operationId));
    created.addErrorListener(error => this.handleEventError(error, operationId));
    created.addDoneListener(() => this.handleEventStreamDone(operationId));
    this.publish({
      ...this.snapshot,
      sessionState: RealtimeSessionState.ConnectingSocket,
    });
    const connection = created.connect();
    if (this.operationGuard.isCurrent(operationId)) {
      this.publish({
        ...this.snapshot,
        sessionState: RealtimeSessionState.WaitingForStream,
      });
    }
    await connection;
    if (!this.operationGuard.isCurrent(operationId)) {
      await created.close();
      return false;
    }
    return true;
  }

  private async beginStreaming(operationId: number): Promise<void> {
    await this.recorder.start(PcmCaptureProfile.Transcription, {
      onChunk: chunk => this.sendPcm(chunk, operationId),
      onError: error => this.handleEventError(error, operationId),
      onDone: () => {},
    });
    if (!this.operationGuard.isCurrent(operationId)) {
      await this.recorder.stop();
      await this.session?.close();
      return;
    }
    this.startElapsedTimer(operationId);
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Success,
      sessionState: RealtimeSessionState.Streaming,
      microphoneActive: true,
      protocolEvents: this.protocolLog.add('microphone_stream_started'),
    });
  }

  private async prepareAudio(operationId: number): Promise<boolean> {
    const preparation = await this.audioSession.prepare(
      RealtimeAudioProfile.Transcription,
    );
    if (!this.operationGuard.isCurrent(operationId)) {
      await this.audioSession.deactivate();
      return false;
    }
    if (preparation === AudioPreparationResult.Ready) {
      return true;
    }
    await this.audioSession.deactivate();
    this.releaseLease();
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Error,
      sessionState: RealtimeSessionState.Failure,
      microphoneActive: false,
      errorMessage: preparationErrorMessage(preparation),
      canOpenSystemSettings: preparationNeedsSystemSettings(preparation),
    });
    return false;
  }

  private publish(next: TranscriptionSessionSnapshot): void {
    if (
      this.operationGuard.isDisposed ||
      transcriptionSnapshotsEqual(next, this.currentSnapshot)
    ) {
      return;
    }
    this.currentSnapshot = next;
    this.listeners.forEach(listener => listener(next));
  }

  private sendPcm(chunk: Uint8Array, operationId: number): void {
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    const sent = this.session?.sendAudio(chunk) ?? false;
    if (!sent) {
      void this.fail(operationId, WiroFailure.SocketConnection);
    }
  }

  private handleEvent(event: RealtimeEvent, operationId: number): void {
    if (
      event.kind === 'status' &&
      event.type === RealtimeEventType.PostprocessEnded
    ) {
      this.terminalWait?.complete();
    }
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    switch (event.kind) {
      case 'output':
        this.handleOutput(event.message);
        break;
      case 'status':
        this.handleStatus(event.type, operationId);
        break;
      case 'error':
        this.appendProtocolEvent(realtimeEventWireType(event));
        break;
      case 'cancel':
        this.appendProtocolEvent(realtimeEventWireType(event));
        void this.fail(operationId, WiroFailure.Cancelled);
        break;
      case 'malformed':
      case 'binary':
        this.appendProtocolEvent(realtimeEventWireType(event));
        void this.fail(operationId, WiroFailure.RealtimeProtocol);
        break;
      case 'unknown':
        this.appendProtocolEvent(realtimeEventWireType(event));
        break;
    }
  }

  private handleStatus(type: RealtimeEventType, operationId: number): void {
    this.appendProtocolEvent(type);
    if (type === RealtimeEventType.StreamEnded) {
      void this.handleStreamEnded(operationId);
    } else if (type === RealtimeEventType.PostprocessEnded) {
      if (!this.naturalCompletion) {
        this.naturalCompletion = this.completeNaturally(operationId);
      }
    }
  }

  private handleOutput(message: string): void {
    const prefix = WiroRealtimeProtocol.TRANSCRIPT_USER_PREFIX;
    if (!message.startsWith(prefix)) {
      this.appendProtocolEvent('task_output');
      return;
    }
    const joined = this.transcript.applyUserText(message.slice(prefix.length));
    if (joined === null) {
      this.appendProtocolEvent('task_output');
      return;
    }
    this.publish({
      ...this.snapshot,
      transcript: joined,
      protocolEvents: this.protocolLog.add('task_output'),
    });
  }

  private async handleStreamEnded(operationId: number): Promise<void> {
    await this.stopCapture();
    await this.audioSession.deactivate();
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    this.publish({
      ...this.snapshot,
      sessionState: RealtimeSessionState.Stopping,
      microphoneActive: false,
    });
  }

  private async completeNaturally(operationId: number): Promise<void> {
    if (!this.operationGuard.isCurrent(operationId) || this.naturalCompletionRunning) {
      return;
    }
    this.naturalCompletionRunning = true;
    await this.stopCapture();
    await this.audioSession.deactivate();
    if (!this.operationGuard.isCurrent(operationId)) {
      this.naturalCompletionRunning = false;
      return;
    }
    const completionId = this.operationGuard.begin();
    this.elapsedClock.stop();
    await this.session?.close();
    this.session = null;
    this.terminalWait = null;
    this.naturalCompletion = null;
    this.naturalCompletionRunning = false;
    this.taskLauncher.release();
    this.releaseLease();
    if (!this.operationGuard.isCurrent(completionId)) {
      return;
    }
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Success,
      sessionState: RealtimeSessionState.Completed,
      microphoneActive: false,
    });
  }

  private handleEventError(error: unknown, operationId: number): void {
    if (this.operationGuard.isCurrent(operationId)) {
      void this.fail(operationId, error);
    }
  }

  private handleEventStreamDone(operationId: number): void {
    const terminalReceived = this.terminalWait?.isCompleted ?? false;
    if (this.operationGuard.isCurrent(operationId) && !terminalReceived) {
      void this.fail(operationId, WiroFailure.SocketConnection);
    }
  }

  private async fail(operationId: number, error: unknown): Promise<void> {
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    const failureId = this.operationGuard.begin();
    this.taskLauncher.cancelPendingRequest();
    await this.taskLauncher.terminateBestEffort();
    this.elapsedClock.stop();
    await this.stopCapture();
    await this.audioSession.deactivate();
    await this.session?.close();
    this.session = null;
    this.terminalWait = null;
    this.naturalCompletion = null;
    this.naturalCompletionRunning = false;
    this.releaseLease();
    if (!this.operationGuard.isCurrent(failureId)) {
      return;
    }
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Error,
      sessionState: RealtimeSessionState.Failure,
      microphoneActive: false,
      errorMessage: failureMapper.message(error),
      protocolEvents: this.protocolLog.add(`failure:${failureMapper.code(error)}`),
      revealProtocolPanel: true,
    });
  }

  private async stopCapture(): Promise<void> {
    await this.recorder.stop();
  }

  private async disposeResources(): Promise<void> {
    this.routeWatcher.dispose();
    await this.stopCapture();
    await this.audioSession.deactivate();
    this.session?.sendSessionEnd();
    await this.taskLauncher.terminateBestEffort();
    await this.session?.close();
    await this.recorder.dispose();
    this.releaseLease();
  }

  private stopForAudioRouteSafety(): void {
    if (canStop(this.snapshot.sessionState)) {
      void this.stop();
    }
  }

  private handleRouteChange(): void {
    if (isActive(this.snapshot.sessionState)) {
      this.appendProtocolEvent('audio_route_changed');
    }
  }

  private releaseLease(): void {
    const lease = this.sessionLease;
    this.sessionLease = null;
    this.sessionGuard.release(lease);
  }

  private startElapsedTimer(operationId: number): void {
    this.elapsedClock.start(elapsed => {
      if (this.operationGuard.isCurrent(operationId)) {
        this.publish({ ...this.snapshot, elapsedMs: elapsed });
      }
    });
  }

  private appendProtocolEvent(event: string): void {
    this.publish({
      ...this.snapshot,
      protocolEvents: this.protocolLog.add(event),
    });
  }

  private async windDownSession(): Promise<boolean> {
    const current = this.session;
    if (!current || current.isClosed) {
      return false;
    }
    const shouldWait = current.isReady;
    current.sendSessionEnd();
    const wait = this.terminalWait;
    const timedOut =
      shouldWait && wait && !wait.isCompleted ? !(await this.waitForTerminal()) : false;
    await current.close();
    return timedOut;
  }

  private async waitForTerminal(): Promise<boolean> {
    const wait = this.terminalWait;
    if (!wait) {
      return true;
    }
    if (this.terminalTimeoutMs <= 0) {
      return wait.isCompleted;
    }
    const result = await raceTimeout(wait.wait(), this.terminalTimeoutMs);
    return !result.timedOut;
  }
}
