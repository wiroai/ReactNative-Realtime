import { ViewStatus } from '../../app/viewStatus';
import {
  AudioPreparationResult,
  RealtimeAudioProfile,
  RealtimeAudioSession,
  preparationErrorMessage,
} from '../../audio/realtimeAudioSession';
import { RealtimeAudioRouteWatcher } from '../../audio/realtimeAudioRouteWatcher';
import { PcmAudioPlayer } from '../../audio/playback';
import { RealtimeSessionGuard, RealtimeSessionLease, RealtimeSessionOwner } from '../../audio/sessionGuard';
import { mossTtsRealtime } from '../../models/catalog';
import { ModelDefinition, RealtimeDirection } from '../../models/modelDefinition';
import { ModelParameterValues } from '../../models/modelParameterValues';
import { WiroRunResult } from '../../models/runResult';
import { WiroApiClient } from '../../networking/apiClient';
import { WiroFailure, WiroFailureCode } from '../../networking/failure';
import { RealtimeTaskLauncher } from '../../networking/taskLauncher';
import { RealtimeEvent, RealtimeEventType, realtimeEventWireType } from '../../realtime/event';
import { RealtimeFailureMapper } from '../../realtime/failureMapper';
import { RealtimeOperationGuard } from '../../realtime/operationGuard';
import { ProtocolEventLog } from '../../realtime/protocolEventLog';
import { raceTimeout } from '../../realtime/raceTimeout';
import { RealtimeSessionClient } from '../../realtime/session';
import { SessionElapsedClock } from '../../realtime/elapsedClock';
import { RealtimeSessionState, canStart, canStop, isActive } from '../../realtime/sessionState';
import { RealtimeTrace } from '../../realtime/trace';
import { TerminalWait } from '../terminalWait';
import { SpeechFields } from './speechFields';
import { SpeechSessionController } from './sessionController';
import {
  SpeechSessionSnapshot,
  initialSpeechSessionSnapshot,
  speechSnapshotsEqual,
} from './sessionSnapshot';

export interface TextToSpeechSessionServiceOptions {
  readonly audioSession: RealtimeAudioSession;
  readonly apiClient: WiroApiClient;
  readonly sessionFactory: (
    taskId: string,
    taskToken: string,
  ) => RealtimeSessionClient;
  readonly player: PcmAudioPlayer;
  readonly sessionGuard: RealtimeSessionGuard;
  readonly model?: ModelDefinition;
  readonly terminalTimeoutMs?: number;
  readonly connectRetryDelayMs?: number;
  readonly maxConnectAttempts?: number;
}

const DEFAULT_TERMINAL_TIMEOUT_MS = 3_000;
const DEFAULT_CONNECT_RETRY_DELAY_MS = 4_000;
const DEFAULT_MAX_CONNECT_ATTEMPTS = 8;
const ENTER_TEXT = 'Enter text to synthesize.';

const failureMapper = new RealtimeFailureMapper(
  'The speech session could not be completed.',
);

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

/**
 * Owns task creation, realtime audio playback, and session
 * termination for text-to-speech.
 *
 * The service reports itself only through `subscribe`/`snapshot`.
 * A TTS model can spin up cold and drop the subscriber socket, so
 * the session resubscribes to the task it already has instead of
 * launching a second billed run.
 */
export class TextToSpeechSessionService implements SpeechSessionController {
  readonly audioSession: RealtimeAudioSession;
  readonly apiClient: WiroApiClient;
  readonly sessionFactory: (
    taskId: string,
    taskToken: string,
  ) => RealtimeSessionClient;
  readonly player: PcmAudioPlayer;
  readonly sessionGuard: RealtimeSessionGuard;
  readonly terminalTimeoutMs: number;
  readonly connectRetryDelayMs: number;
  readonly maxConnectAttempts: number;

  private readonly listeners: Array<(snapshot: SpeechSessionSnapshot) => void> = [];
  private readonly routeWatcher: RealtimeAudioRouteWatcher;
  private readonly taskLauncher: RealtimeTaskLauncher;
  private readonly operationGuard = new RealtimeOperationGuard();
  private readonly protocolLog = new ProtocolEventLog();
  private readonly elapsedClock = new SessionElapsedClock();

  private selectedModel: ModelDefinition;
  private currentSnapshot: SpeechSessionSnapshot;
  private storedParameters: ModelParameterValues;
  private sessionLease: RealtimeSessionLease | null = null;
  private session: RealtimeSessionClient | null = null;
  private terminalWait: TerminalWait | null = null;
  private playbackCompletion: Promise<void> | null = null;
  private naturalCompletion: Promise<void> | null = null;
  private startJob: Promise<void> | null = null;
  private pendingStop: Promise<void> | null = null;
  private naturalCompletionRunning = false;
  private connectingSession = false;
  private listenerGeneration = 0;

  constructor(options: TextToSpeechSessionServiceOptions) {
    this.audioSession = options.audioSession;
    this.apiClient = options.apiClient;
    this.sessionFactory = options.sessionFactory;
    this.player = options.player;
    this.sessionGuard = options.sessionGuard;
    this.terminalTimeoutMs = options.terminalTimeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS;
    this.connectRetryDelayMs =
      options.connectRetryDelayMs ?? DEFAULT_CONNECT_RETRY_DELAY_MS;
    this.maxConnectAttempts =
      options.maxConnectAttempts ?? DEFAULT_MAX_CONNECT_ATTEMPTS;

    this.taskLauncher = new RealtimeTaskLauncher(this.apiClient);
    this.selectedModel = options.model ?? mossTtsRealtime;
    this.currentSnapshot = initialSpeechSessionSnapshot(this.selectedModel);
    this.storedParameters = ModelParameterValues.create({
      fields: this.selectedModel.fields,
    });
    this.routeWatcher = new RealtimeAudioRouteWatcher({
      audioSession: this.audioSession,
      onShouldStop: () => this.stopForAudioRouteSafety(),
      onRouteChanged: () => this.handleRouteChange(),
      onPlaybackFailure: failure => this.handlePlayerFailure(failure),
      addPlaybackFailureListener: listener =>
        this.player.addFailureListener(listener),
    });
  }

  get snapshot(): SpeechSessionSnapshot {
    return this.currentSnapshot;
  }

  get parameters(): ModelParameterValues {
    return this.storedParameters;
  }

  get prompt(): string {
    return this.parameters.value(this.promptFieldId()) ?? '';
  }

  set prompt(value: string) {
    this.storedParameters = this.storedParameters.withValue(
      this.promptFieldId(),
      value,
    );
  }

  subscribe(
    listener: (snapshot: SpeechSessionSnapshot) => void,
  ): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  selectModel(model: ModelDefinition): void {
    if (
      this.operationGuard.isDisposed ||
      isActive(this.snapshot.sessionState) ||
      model.direction !== RealtimeDirection.TextToSpeech
    ) {
      return;
    }
    this.selectedModel = model;
    this.storedParameters = ModelParameterValues.create({ fields: model.fields });
    this.publish({ ...this.snapshot, selectedModel: model, errorMessage: null });
  }

  setParameter(id: string, value: string): void {
    if (this.operationGuard.isDisposed) {
      return;
    }
    this.storedParameters = this.storedParameters.withValue(id, value);
  }

  async start(): Promise<void> {
    if (this.operationGuard.isDisposed) {
      return;
    }
    const trimmed = this.prompt.trim();
    if (this.startJob) {
      await this.startJob;
      return;
    }
    if (!canStart(this.snapshot.sessionState)) {
      return;
    }
    if (trimmed.length === 0) {
      this.publish({
        ...this.snapshot,
        status: ViewStatus.Error,
        sessionState: RealtimeSessionState.Failure,
        errorMessage: ENTER_TEXT,
      });
      return;
    }
    const job = this.acquireAndStart(trimmed).finally(() => {
      if (this.startJob === job) {
        this.startJob = null;
      }
    });
    this.startJob = job;
    await job;
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

  async dispose(): Promise<void> {
    if (this.operationGuard.isDisposed) {
      return;
    }
    this.operationGuard.dispose();
    this.taskLauncher.cancelPendingRequest();
    this.elapsedClock.stop();
    await this.disposeResources();
  }

  private async acquireAndStart(text: string): Promise<void> {
    const operationId = this.operationGuard.begin();
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.PreparingAudio,
      errorMessage: null,
    });
    const lease = await this.sessionGuard.acquireWhenFree(
      RealtimeSessionOwner.Speech,
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
    RealtimeTrace.line('speech start');
    await this.startSession(text);
  }

  private async startSession(text: string): Promise<void> {
    const operationId = this.operationGuard.begin();
    this.protocolLog.clear();
    this.publish(this.clearedLoadingSnapshot());
    try {
      if (!(await this.prepareAudio(operationId))) {
        return;
      }
      this.publish({
        ...this.snapshot,
        sessionState: RealtimeSessionState.CreatingTask,
      });
      const runResult = await this.launchTask(text, operationId);
      if (!runResult) {
        if (this.operationGuard.isCurrent(operationId)) {
          this.publish({
            ...this.snapshot,
            status: ViewStatus.Initial,
            sessionState: RealtimeSessionState.Idle,
          });
        }
        return;
      }
      const connected = await this.connectToTask(runResult, operationId);
      if (!connected || !this.operationGuard.isCurrent(operationId)) {
        await this.player.stop();
        await connected?.close();
        return;
      }
      this.startElapsedTimer(operationId);
      this.publish({
        ...this.snapshot,
        status: ViewStatus.Success,
        sessionState: RealtimeSessionState.Streaming,
        protocolEvents: this.protocolLog.add('playback_stream_started'),
      });
    } catch (error) {
      if (this.operationGuard.isCurrent(operationId)) {
        await this.fail(operationId, error);
      }
    }
  }

  private async connectToTask(
    runResult: WiroRunResult,
    operationId: number,
  ): Promise<RealtimeSessionClient | null> {
    let attempt = 0;
    while (true) {
      attempt += 1;
      const created = this.attachSession(runResult, operationId);
      await this.player.start();
      RealtimeTrace.line('player listening');
      if (!this.operationGuard.isCurrent(operationId)) {
        await this.player.stop();
        await created.close();
        return null;
      }
      const error = await this.attemptConnect(created, operationId);
      if (!error) {
        RealtimeTrace.line('socket ready');
        return created;
      }
      await created.close();
      this.session = null;
      if (!this.canRetry(error, attempt, operationId)) {
        throw error;
      }
      this.appendProtocolEvent(`socket_reconnect:${attempt}`);
      if (this.connectRetryDelayMs > 0) {
        await delay(this.connectRetryDelayMs);
      }
      if (!this.operationGuard.isCurrent(operationId)) {
        return null;
      }
    }
  }

  private attachSession(
    runResult: WiroRunResult,
    operationId: number,
  ): RealtimeSessionClient {
    this.listenerGeneration += 1;
    const generation = this.listenerGeneration;
    const created = this.sessionFactory(runResult.taskId, runResult.taskToken);
    this.session = created;
    this.terminalWait = new TerminalWait();
    this.playbackCompletion = null;
    this.naturalCompletion = null;
    this.naturalCompletionRunning = false;
    this.connectingSession = true;
    created.addEventListener(event => this.handleEvent(event, operationId, generation));
    created.addErrorListener(error => this.failLater(error, operationId, generation));
    created.addDoneListener(() => this.handleEventStreamDone(operationId, generation));
    this.publish({
      ...this.snapshot,
      sessionState: RealtimeSessionState.ConnectingSocket,
    });
    return created;
  }

  private async attemptConnect(
    created: RealtimeSessionClient,
    operationId: number,
  ): Promise<WiroFailure | null> {
    if (this.operationGuard.isCurrent(operationId)) {
      this.publish({
        ...this.snapshot,
        sessionState: RealtimeSessionState.WaitingForStream,
      });
    }
    RealtimeTrace.line('socket attempt');
    this.connectingSession = true;
    try {
      await created.connect();
      return null;
    } catch (error) {
      if (error instanceof WiroFailure) {
        return error;
      }
      throw error;
    } finally {
      this.connectingSession = false;
    }
  }

  private canRetry(
    error: WiroFailure,
    attempt: number,
    operationId: number,
  ): boolean {
    const recoverable =
      error.code === WiroFailureCode.SocketConnection ||
      error.code === WiroFailureCode.SocketConnectTimeout;
    return (
      recoverable &&
      attempt < this.maxConnectAttempts &&
      this.operationGuard.isCurrent(operationId)
    );
  }

  private async performStop(): Promise<void> {
    RealtimeTrace.line('speech stop');
    const operationId = this.operationGuard.begin();
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.Stopping,
      isPlaying: false,
    });
    this.taskLauncher.cancelPendingRequest();
    this.elapsedClock.stop();
    await this.player.stop();
    await this.naturalCompletion;
    await this.audioSession.deactivate();
    this.releaseLease();
    const shutdownTimedOut = await this.windDownSession();
    await this.startJob;
    this.clearSessionReferences();
    this.taskLauncher.release();
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    const event = shutdownTimedOut ? 'shutdown_timeout' : 'session_stopped';
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Success,
      sessionState: RealtimeSessionState.Completed,
      isPlaying: false,
      errorMessage: null,
      protocolEvents: this.protocolLog.add(event),
    });
  }

  private async launchTask(
    text: string,
    operationId: number,
  ): Promise<WiroRunResult | null> {
    const body: Record<string, string | number> = {
      ...this.parameters.requestBody(),
      [this.promptFieldId()]: text,
    };
    return this.taskLauncher.launch(
      this.selectedModel,
      body,
      () => this.operationGuard.isCurrent(operationId),
    );
  }

  private async prepareAudio(operationId: number): Promise<boolean> {
    const preparation = await this.audioSession.prepare(RealtimeAudioProfile.Speech);
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
      errorMessage: preparationErrorMessage(preparation),
    });
    return false;
  }

  private handleEvent(
    event: RealtimeEvent,
    operationId: number,
    generation: number,
  ): void {
    if (generation !== this.listenerGeneration) {
      return;
    }
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
      case 'binary':
        this.queueAudio(event.bytes, operationId);
        break;
      case 'status':
        this.handleStatus(event.type, operationId);
        break;
      case 'error':
      case 'output':
      case 'unknown':
        this.appendProtocolEvent(realtimeEventWireType(event));
        break;
      case 'cancel':
        this.appendProtocolEvent(realtimeEventWireType(event));
        void this.fail(operationId, WiroFailure.Cancelled);
        break;
      case 'malformed':
        this.appendProtocolEvent(realtimeEventWireType(event));
        void this.fail(operationId, WiroFailure.RealtimeProtocol);
        break;
    }
  }

  private handleStatus(type: RealtimeEventType, operationId: number): void {
    this.appendProtocolEvent(type);
    if (type === RealtimeEventType.StreamEnded) {
      this.publish({
        ...this.snapshot,
        sessionState: RealtimeSessionState.Stopping,
      });
      if (!this.playbackCompletion) {
        this.playbackCompletion = this.finishPlayback(operationId);
      }
    } else if (type === RealtimeEventType.PostprocessEnded) {
      if (!this.naturalCompletion) {
        this.naturalCompletion = this.completeNaturally(operationId);
      }
    }
  }

  private queueAudio(bytes: Uint8Array, operationId: number): void {
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    if (!this.snapshot.isPlaying) {
      this.publish({ ...this.snapshot, isPlaying: true });
    }
    if (!this.player.tryEnqueue(bytes)) {
      this.appendProtocolEvent('audio_chunk_dropped');
    }
  }

  private async finishPlayback(operationId: number): Promise<void> {
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    await this.player.complete();
    if (this.operationGuard.isCurrent(operationId)) {
      this.publish({ ...this.snapshot, isPlaying: false });
    }
  }

  private async completeNaturally(operationId: number): Promise<void> {
    if (!this.operationGuard.isCurrent(operationId) || this.naturalCompletionRunning) {
      return;
    }
    this.naturalCompletionRunning = true;
    if (!this.playbackCompletion) {
      this.playbackCompletion = this.finishPlayback(operationId);
    }
    await this.playbackCompletion;
    if (!this.operationGuard.isCurrent(operationId)) {
      this.naturalCompletionRunning = false;
      return;
    }
    const completionId = this.operationGuard.begin();
    this.elapsedClock.stop();
    await this.audioSession.deactivate();
    await this.session?.close();
    this.clearSessionReferences();
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
      isPlaying: false,
    });
  }

  private failLater(error: unknown, operationId: number, generation: number): void {
    if (generation !== this.listenerGeneration || this.connectingSession) {
      return;
    }
    if (this.operationGuard.isCurrent(operationId)) {
      void this.fail(operationId, error);
    }
  }

  private handleEventStreamDone(operationId: number, generation: number): void {
    if (generation !== this.listenerGeneration || this.connectingSession) {
      return;
    }
    const terminalReceived = this.terminalWait?.isCompleted ?? false;
    if (this.operationGuard.isCurrent(operationId) && !terminalReceived) {
      void this.fail(operationId, WiroFailure.SocketConnection);
    }
  }

  private handlePlayerFailure(failure: unknown): void {
    if (isActive(this.snapshot.sessionState)) {
      void this.fail(this.operationGuard.current, failure);
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
    await this.player.stop();
    await this.audioSession.deactivate();
    await this.session?.close();
    this.clearSessionReferences();
    this.naturalCompletionRunning = false;
    this.releaseLease();
    if (!this.operationGuard.isCurrent(failureId)) {
      return;
    }
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Error,
      sessionState: RealtimeSessionState.Failure,
      isPlaying: false,
      errorMessage: failureMapper.message(error),
      protocolEvents: this.protocolLog.add(`failure:${failureMapper.code(error)}`),
      revealProtocolPanel: true,
    });
  }

  private publish(next: SpeechSessionSnapshot): void {
    if (this.operationGuard.isDisposed || speechSnapshotsEqual(next, this.currentSnapshot)) {
      return;
    }
    this.currentSnapshot = next;
    this.listeners.forEach(listener => listener(next));
  }

  private clearSessionReferences(): void {
    this.session = null;
    this.terminalWait = null;
    this.playbackCompletion = null;
    this.naturalCompletion = null;
  }

  private async disposeResources(): Promise<void> {
    this.routeWatcher.dispose();
    await this.player.stop();
    await this.audioSession.deactivate();
    this.session?.sendSessionEnd();
    await this.taskLauncher.terminateBestEffort();
    await this.session?.close();
    await this.player.dispose();
    this.clearSessionReferences();
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

  private clearedLoadingSnapshot(): SpeechSessionSnapshot {
    return {
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.PreparingAudio,
      elapsedMs: 0,
      isPlaying: false,
      errorMessage: null,
      protocolEvents: this.protocolLog.events,
      revealProtocolPanel: false,
    };
  }

  private promptFieldId(): string {
    return SpeechFields.promptFieldId(this.selectedModel);
  }
}
