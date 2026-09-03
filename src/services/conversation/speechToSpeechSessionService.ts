import { ConversationConfig, conversationParameterValues } from '../../app/conversationConfig';
import { ViewStatus } from '../../app/viewStatus';
import { AudioFailure } from '../../audio/audioFailure';
import { PcmAudioPlayer } from '../../audio/playback';
import { PcmAudioRecorder, PcmCaptureProfile } from '../../audio/capture';
import { PcmNoiseGate } from '../../audio/pcmNoiseGate';
import {
  AudioPreparationResult,
  RealtimeAudioProfile,
  RealtimeAudioSession,
  preparationErrorMessage,
  preparationNeedsSystemSettings,
} from '../../audio/realtimeAudioSession';
import { RealtimeAudioRouteWatcher } from '../../audio/realtimeAudioRouteWatcher';
import { RealtimeSessionGuard, RealtimeSessionOwner } from '../../audio/sessionGuard';
import { ModelDefinition } from '../../models/modelDefinition';
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
import {
  RealtimeSessionState,
  canStart,
  canStop,
  isActive,
} from '../../realtime/sessionState';
import { TerminalWait } from '../terminalWait';
import { ConversationBargeIn } from './bargeIn';
import { ConversationMicPipeline } from './micPipeline';
import { ConversationPlaybackCoordinator } from './playbackCoordinator';
import { ConversationRecoveryPolicy } from './recoveryPolicy';
import { ConversationSessionController } from './sessionController';
import {
  ConversationSessionSnapshot,
  conversationSnapshotsEqual,
  initialConversationSessionSnapshot,
} from './sessionSnapshot';
import { ConversationSuspension } from './suspension';
import { ConversationTranscriptParser } from './transcriptParser';
import { ConversationVoiceActivity } from './voiceActivity';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

export interface SpeechToSpeechSessionServiceOptions {
  readonly audioSession: RealtimeAudioSession;
  readonly apiClient: WiroApiClient;
  readonly sessionFactory: (
    taskId: string,
    taskToken: string,
  ) => RealtimeSessionClient;
  readonly recorder: PcmAudioRecorder;
  readonly player: PcmAudioPlayer;
  readonly sessionGuard: RealtimeSessionGuard;
  readonly model?: ModelDefinition;
  readonly persona?: string;
  readonly voice?: string;
  readonly parameterOverrides?: Readonly<Record<string, string>>;
  /** Zero — no ceiling. Only tests need a client-side cap. */
  readonly maxSessionDurationMs?: number;
  readonly suspendGracePeriodMs?: number;
  readonly reconnectTimeoutMs?: number;
  readonly terminalTimeoutMs?: number;
  readonly maxRetryAttempts?: number;
  readonly retryBaseDelayMs?: number;
  readonly micStallTimeoutMs?: number;
  readonly autoRestartDelayMs?: number;
  readonly maxAutoRestarts?: number;
  readonly interruptHoldTimeoutMs?: number;
  readonly interruptHoldCooldownMs?: number;
  readonly noiseGate?: PcmNoiseGate;
  readonly nowMillis?: () => number;
}

const DEFAULT_RECONNECT_TIMEOUT_MS = 4_000;
const DEFAULT_TERMINAL_TIMEOUT_MS = 3_000;

/**
 * Runs a two-way speech conversation: microphone capture, the
 * realtime socket, assistant playback, and every way the session
 * can end.
 *
 * The service reports itself only through `subscribe`/`snapshot`
 * and never touches view state.
 */
export class SpeechToSpeechSessionService implements ConversationSessionController {
  readonly audioSession: RealtimeAudioSession;
  readonly apiClient: WiroApiClient;
  readonly sessionFactory: (
    taskId: string,
    taskToken: string,
  ) => RealtimeSessionClient;
  readonly recorder: PcmAudioRecorder;
  readonly player: PcmAudioPlayer;
  readonly sessionGuard: RealtimeSessionGuard;
  readonly model: ModelDefinition;
  readonly maxSessionDurationMs: number;
  readonly suspendGracePeriodMs: number;
  readonly reconnectTimeoutMs: number;
  readonly terminalTimeoutMs: number;
  readonly micStallTimeoutMs: number;
  readonly noiseGate?: PcmNoiseGate;
  readonly voiceActivity: ConversationVoiceActivity;

  private readonly nowMillis: () => number;
  private readonly listeners: Array<(snapshot: ConversationSessionSnapshot) => void> = [];
  private readonly taskLauncher: RealtimeTaskLauncher;
  private readonly operationGuard = new RealtimeOperationGuard();
  private readonly protocolLog = new ProtocolEventLog();
  private readonly elapsedClock = new SessionElapsedClock();
  private readonly playbackCoordinator: ConversationPlaybackCoordinator;
  private readonly bargeIn: ConversationBargeIn;
  private readonly micPipeline: ConversationMicPipeline;
  private readonly recovery: ConversationRecoveryPolicy;
  private readonly suspension: ConversationSuspension;
  private readonly routeWatcher: RealtimeAudioRouteWatcher;
  private readonly transcriptParser = new ConversationTranscriptParser();
  private readonly failureMapper = new RealtimeFailureMapper(
    'The conversation session could not be completed.',
  );

  private currentSnapshot: ConversationSessionSnapshot = initialConversationSessionSnapshot;
  private storedParameters: ModelParameterValues;
  private sessionLease: import('../../audio/sessionGuard').RealtimeSessionLease | null = null;
  private session: RealtimeSessionClient | null = null;
  private terminalWait: TerminalWait | null = null;
  private naturalCompletion: Promise<void> | null = null;
  private naturalCompletionRunning = false;
  private startJob: Promise<void> | null = null;
  private relaunchJob: Promise<void> | null = null;
  private pendingStop: Promise<void> | null = null;
  private watchdogOperationId = 0;

  constructor(options: SpeechToSpeechSessionServiceOptions) {
    this.audioSession = options.audioSession;
    this.apiClient = options.apiClient;
    this.sessionFactory = options.sessionFactory;
    this.recorder = options.recorder;
    this.player = options.player;
    this.sessionGuard = options.sessionGuard;
    this.model = options.model ?? ConversationConfig.model;
    this.maxSessionDurationMs = options.maxSessionDurationMs ?? 0;
    this.suspendGracePeriodMs =
      options.suspendGracePeriodMs ?? ConversationConfig.suspendGracePeriodMs;
    this.reconnectTimeoutMs =
      options.reconnectTimeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS;
    this.terminalTimeoutMs = options.terminalTimeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS;
    this.micStallTimeoutMs = options.micStallTimeoutMs ?? 3_000;
    this.noiseGate = options.noiseGate;
    this.nowMillis = options.nowMillis ?? (() => Date.now());

    this.taskLauncher = new RealtimeTaskLauncher(this.apiClient);
    this.storedParameters = conversationParameterValues({
      model: this.model,
      persona: options.persona,
      voice: options.voice,
      overrides: options.parameterOverrides,
    });

    this.playbackCoordinator = new ConversationPlaybackCoordinator(
      this.player,
      this.nowMillis,
    );
    this.voiceActivity = new ConversationVoiceActivity(this.nowMillis);
    this.bargeIn = new ConversationBargeIn({
      playback: this.playbackCoordinator,
      voiceActivity: this.voiceActivity,
      onProtocolEvent: event => this.appendProtocolEvent(event),
      holdTimeoutMs: options.interruptHoldTimeoutMs,
      holdCooldownMs: options.interruptHoldCooldownMs,
      nowMillis: this.nowMillis,
    });
    this.micPipeline = new ConversationMicPipeline({
      onStall: () => this.handleMicStall(),
      noiseGate: this.noiseGate,
      stallTimeoutMs: this.micStallTimeoutMs,
      nowMillis: this.nowMillis,
    });
    this.recovery = new ConversationRecoveryPolicy({
      maxRetryAttempts: options.maxRetryAttempts,
      retryBaseDelayMs: options.retryBaseDelayMs,
      autoRestartDelayMs: options.autoRestartDelayMs,
      maxAutoRestarts: options.maxAutoRestarts,
    });
    this.suspension = new ConversationSuspension({
      gracePeriodMs: this.suspendGracePeriodMs,
      onExpired: () => this.onHoldExpired(),
      nowMillis: this.nowMillis,
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

  get snapshot(): ConversationSessionSnapshot {
    return this.currentSnapshot;
  }

  get parameters(): ModelParameterValues {
    return this.storedParameters;
  }

  subscribe(
    listener: (snapshot: ConversationSessionSnapshot) => void,
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
    this.recovery.cancelAutoRestart();
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
      RealtimeSessionOwner.Conversation,
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
    this.recovery.resetRetries();
    await this.startSession(false);
  }

  private async startSession(isRetry: boolean): Promise<void> {
    const operationId = this.operationGuard.begin();
    if (!isRetry) {
      this.protocolLog.clear();
    }
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.RequestingPermission,
      elapsedMs: isRetry ? this.snapshot.elapsedMs : 0,
      userTranscript: isRetry ? this.snapshot.userTranscript : '',
      aiTranscript: isRetry ? this.snapshot.aiTranscript : '',
      microphoneActive: false,
      errorMessage: null,
      canOpenSystemSettings: false,
      protocolEvents: this.protocolLog.events,
    });
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
      await this.recorder.start(PcmCaptureProfile.Conversation, {
        onChunk: chunk => this.sendPcm(chunk, operationId),
        onError: error => this.handleAudioError(error, operationId),
        onDone: () => {},
      });
      if (!this.player.isPlaying) {
        await this.player.start();
      }
      if (!this.operationGuard.isCurrent(operationId)) {
        await this.recorder.stop();
        await this.player.stop();
        await this.session?.close();
        return;
      }
      this.startElapsedTimer(operationId);
      this.publish({
        ...this.snapshot,
        status: ViewStatus.Success,
        sessionState: RealtimeSessionState.Streaming,
        microphoneActive: !this.snapshot.muted,
        protocolEvents: this.protocolLog.add('conversation_stream_started'),
      });
      this.startMicWatchdog(operationId);
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
    this.micPipeline.stopWatchdog();
    this.recovery.cancelAutoRestart();
    this.bargeIn.cancelHold();
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.Stopping,
      microphoneActive: false,
      isReconfiguring: false,
    });
    this.taskLauncher.cancelPendingRequest();
    this.elapsedClock.stop();
    await this.stopCapture();
    await this.player.stop();
    this.playbackCoordinator.reset();
    this.voiceActivity.reset();
    this.noiseGate?.reset();
    await this.naturalCompletion;
    await this.audioSession.deactivate();
    this.releaseLease();
    let shutdownTimedOut = false;
    let endedCleanly = false;
    const current = this.session;
    if (current && !current.isClosed) {
      endedCleanly = true;
      const shouldWait = current.isReady;
      current.sendSessionEnd();
      const wait = this.terminalWait;
      if (shouldWait && wait && !wait.isCompleted) {
        shutdownTimedOut = !(await this.waitForTerminal());
      }
      await current.close();
    }
    await this.startJob;
    this.session = null;
    this.terminalWait = null;
    this.naturalCompletion = null;
    if (endedCleanly) {
      this.taskLauncher.release();
    } else {
      await this.taskLauncher.terminateBestEffort();
    }
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    const event = shutdownTimedOut ? 'shutdown_timeout' : 'session_stopped';
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Success,
      sessionState: RealtimeSessionState.Completed,
      microphoneActive: false,
      isSuspended: false,
      errorMessage: null,
      protocolEvents: this.protocolLog.add(event),
    });
  }

  async changeVoice(voice: string): Promise<void> {
    if (this.operationGuard.isDisposed) {
      return;
    }
    if (!isActive(this.snapshot.sessionState) || this.snapshot.isReconfiguring) {
      await this.relaunchJob;
      return;
    }
    if (this.parameters.value('voice') === voice) {
      return;
    }
    this.setParameter('voice', voice);
    await this.runRelaunch('voice_change');
  }

  async suspend(): Promise<void> {
    if (this.operationGuard.isDisposed) {
      return;
    }
    this.recovery.cancelAutoRestart();
    if (this.snapshot.isSuspended || !isActive(this.snapshot.sessionState)) {
      return;
    }
    if (!this.suspension.holdsAnything || this.startJob || this.relaunchJob) {
      await this.stop();
      return;
    }
    const operationId = this.operationGuard.begin();
    this.micPipeline.stopWatchdog();
    this.recovery.cancelAutoRestart();
    this.bargeIn.cancelHold();
    this.elapsedClock.stop();
    this.taskLauncher.cancelPendingRequest();
    await this.stopCapture();
    this.player.flush();
    await this.player.stop();
    this.playbackCoordinator.reset();
    this.voiceActivity.reset();
    this.noiseGate?.reset();
    await this.audioSession.deactivate();
    await this.dropSocket();
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    this.releaseLease();
    this.suspension.begin();
    this.publish({
      ...this.snapshot,
      microphoneActive: false,
      isSuspended: true,
      protocolEvents: this.protocolLog.add('conversation_held'),
    });
  }

  async resume(): Promise<void> {
    if (this.operationGuard.isDisposed || !this.snapshot.isSuspended) {
      return;
    }
    this.suspension.cancel();
    if (this.suspension.hasLapsed) {
      await this.endHeldSession('hold_expired');
      return;
    }
    const lease = await this.sessionGuard.acquireWhenFree(
      RealtimeSessionOwner.Conversation,
    );
    if (lease === null) {
      await this.endHeldSession('hold_lost_to_another_session');
      return;
    }
    if (!this.snapshot.isSuspended) {
      this.sessionGuard.release(lease);
      return;
    }
    this.sessionLease = lease;
    this.suspension.clear();
    await this.runRelaunch('resume', true, true);
  }

  setMuted(muted: boolean): void {
    if (this.operationGuard.isDisposed) {
      return;
    }
    this.recorder.setMuted(muted);
    if (muted) {
      this.voiceActivity.resetUser();
    }
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

  interruptAssistant(): void {
    if (
      this.operationGuard.isDisposed ||
      this.snapshot.sessionState !== RealtimeSessionState.Streaming
    ) {
      return;
    }
    if (!this.voiceActivity.aiAudioPending) {
      return;
    }
    if (this.playbackCoordinator.interruptTurn()) {
      this.bargeIn.cancelHold();
      this.voiceActivity.resetAi();
      this.appendProtocolEvent('assistant_silenced_by_user');
    }
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
    this.micPipeline.dispose();
    this.recovery.dispose();
    this.suspension.dispose();
    this.bargeIn.dispose();
    this.taskLauncher.cancelPendingRequest();
    this.elapsedClock.stop();
    await this.disposeResources();
    this.voiceActivity.dispose();
  }

  private onHoldExpired(): void {
    if (this.operationGuard.isDisposed || !this.snapshot.isSuspended) {
      return;
    }
    void this.endHeldSession('hold_expired');
  }

  private async endHeldSession(reason: string): Promise<void> {
    this.suspension.clear();
    this.appendProtocolEvent(reason);
    await this.stop();
  }

  private async runRelaunch(
    reason: string,
    reuseTask = false,
    shouldPrepareAudio = false,
  ): Promise<void> {
    const job = this.relaunch(reason, reuseTask, shouldPrepareAudio).finally(() => {
      if (this.relaunchJob === job) {
        this.relaunchJob = null;
      }
    });
    this.relaunchJob = job;
    await job;
  }

  /**
   * Rebuilds the live conversation in place, keeping the transcript
   * and the clock as they are.
   */
  private async relaunch(
    reason: string,
    reuseTask: boolean,
    shouldPrepareAudio: boolean,
  ): Promise<void> {
    const operationId = this.operationGuard.begin();
    const preservedUser = this.snapshot.userTranscript;
    const preservedAi = this.snapshot.aiTranscript;
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Loading,
      sessionState: RealtimeSessionState.CreatingTask,
      microphoneActive: false,
      isReconfiguring: true,
      isSuspended: false,
      protocolEvents: this.protocolLog.add(`${reason}_started`),
    });
    try {
      await this.stopCapture();
      this.bargeIn.cancelHold();
      this.player.flush();
      this.playbackCoordinator.reset();
      this.voiceActivity.reset();
      this.noiseGate?.reset();
      if (shouldPrepareAudio && !(await this.prepareAudio(operationId))) {
        return;
      }
      let reconnected = false;
      if (reuseTask) {
        reconnected = await this.reconnectToHeldTask(
          operationId,
          preservedUser,
          preservedAi,
        );
      }
      if (!this.operationGuard.isCurrent(operationId)) {
        return;
      }
      if (!reconnected) {
        await this.closeActiveSessionForRelaunch();
        if (!this.operationGuard.isCurrent(operationId)) {
          return;
        }
        const runResult = await this.launchTask(operationId);
        if (!runResult) {
          return;
        }
        const opened = await this.openSession(
          runResult,
          operationId,
          preservedUser,
          preservedAi,
        );
        if (!opened) {
          return;
        }
      }
      await this.recorder.start(PcmCaptureProfile.Conversation, {
        onChunk: chunk => this.sendPcm(chunk, operationId),
        onError: error => this.handleAudioError(error, operationId),
        onDone: () => {},
      });
      if (!this.operationGuard.isCurrent(operationId)) {
        await this.recorder.stop();
        await this.session?.close();
        return;
      }
      if (!this.player.isPlaying) {
        await this.player.start();
      }
      this.startElapsedTimer(operationId);
      this.publish({
        ...this.snapshot,
        status: ViewStatus.Success,
        sessionState: RealtimeSessionState.Streaming,
        microphoneActive: !this.snapshot.muted,
        isReconfiguring: false,
        protocolEvents: this.protocolLog.add(`${reason}_completed`),
      });
      this.startMicWatchdog(operationId);
    } catch (error) {
      if (this.operationGuard.isCurrent(operationId)) {
        await this.fail(operationId, error);
      }
    }
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
    userTranscript?: string,
    aiTranscript?: string,
  ): Promise<boolean> {
    const created = this.sessionFactory(runResult.taskId, runResult.taskToken);
    this.session = created;
    this.terminalWait = new TerminalWait();
    this.naturalCompletion = null;
    this.naturalCompletionRunning = false;
    this.playbackCoordinator.reset();
    created.addEventListener(event => this.handleEvent(event, operationId));
    created.addErrorListener(error => this.handleEventError(error, operationId));
    created.addDoneListener(() => this.handleEventStreamDone(operationId));
    this.publish({
      ...this.snapshot,
      sessionState: RealtimeSessionState.ConnectingSocket,
      userTranscript: userTranscript ?? this.snapshot.userTranscript,
      aiTranscript: aiTranscript ?? this.snapshot.aiTranscript,
    });
    await this.player.start();
    if (!this.operationGuard.isCurrent(operationId)) {
      await this.player.stop();
      await created.close();
      return false;
    }
    if (this.operationGuard.isCurrent(operationId)) {
      this.publish({
        ...this.snapshot,
        sessionState: RealtimeSessionState.WaitingForStream,
      });
    }
    try {
      await created.connect();
    } catch (error) {
      await this.player.stop();
      throw error;
    }
    if (!this.operationGuard.isCurrent(operationId)) {
      await this.player.stop();
      await created.close();
      return false;
    }
    return true;
  }

  private async prepareAudio(operationId: number): Promise<boolean> {
    const preparation = await this.audioSession.prepare(
      RealtimeAudioProfile.Conversation,
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
      isReconfiguring: false,
      isSuspended: false,
      errorMessage: preparationErrorMessage(preparation),
      canOpenSystemSettings: preparationNeedsSystemSettings(preparation),
    });
    return false;
  }

  private async reconnectToHeldTask(
    operationId: number,
    userTranscript: string,
    aiTranscript: string,
  ): Promise<boolean> {
    const heldTask = this.taskLauncher.currentRunResult;
    if (!heldTask) {
      return false;
    }
    this.taskLauncher.cancelPendingRequest();
    await this.dropSocket();
    if (!this.operationGuard.isCurrent(operationId)) {
      return false;
    }
    this.appendProtocolEvent('reconnect_attempted');
    try {
      const result = await raceTimeout(
        this.openSession(heldTask, operationId, userTranscript, aiTranscript),
        this.reconnectTimeoutMs,
      );
      if (result.timedOut) {
        this.appendProtocolEvent('reconnect_refused');
        await this.dropSocket();
        return false;
      }
      if (result.value) {
        this.appendProtocolEvent('reconnect_accepted');
        return true;
      }
      return false;
    } catch {
      this.appendProtocolEvent('reconnect_refused');
      await this.dropSocket();
      return false;
    }
  }

  /**
   * Lets go of the socket without telling the server anything, so
   * the task on the other end stays alive and reconnectable.
   */
  private async dropSocket(): Promise<void> {
    const current = this.session;
    this.session = null;
    this.terminalWait = null;
    this.naturalCompletion = null;
    this.naturalCompletionRunning = false;
    await current?.close();
  }

  private async closeActiveSessionForRelaunch(): Promise<void> {
    this.taskLauncher.cancelPendingRequest();
    const current = this.session;
    if (current && !current.isClosed) {
      current.sendSessionEnd();
    }
    await this.dropSocket();
    await this.taskLauncher.terminateBestEffort();
  }

  private async fail(operationId: number, error: unknown): Promise<void> {
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    const shouldRetry = this.recovery.shouldRetry(
      error,
      this.snapshot.isReconfiguring,
    );
    const isCancellation =
      error instanceof WiroFailure && error.code === WiroFailureCode.Cancelled;
    const canReuseTask =
      shouldRetry &&
      this.taskLauncher.currentRunResult !== null &&
      !isCancellation &&
      !(this.terminalWait?.isCompleted ?? false) &&
      this.snapshot.sessionState === RealtimeSessionState.Streaming;
    const failureId = this.operationGuard.begin();
    this.micPipeline.stopWatchdog();
    this.bargeIn.cancelHold();
    if (!canReuseTask) {
      await this.taskLauncher.terminateBestEffort();
    }
    this.taskLauncher.cancelPendingRequest();
    this.elapsedClock.stop();
    await this.stopCapture();
    await this.player.stop();
    this.playbackCoordinator.reset();
    this.voiceActivity.reset();
    this.noiseGate?.reset();
    await this.audioSession.deactivate();
    await this.dropSocket();
    if (!this.operationGuard.isCurrent(failureId)) {
      return;
    }
    if (shouldRetry) {
      this.recovery.noteRetryScheduled();
      this.publish({
        ...this.snapshot,
        status: ViewStatus.Loading,
        sessionState: RealtimeSessionState.CreatingTask,
        microphoneActive: false,
        isReconfiguring: false,
        errorMessage: null,
        protocolEvents: this.protocolLog.add(
          `retry_scheduled:${this.recovery.retryAttempt}/${this.recovery.maxRetryAttempts}`,
        ),
      });
      await delay(this.recovery.nextRetryDelayMs);
      if (!this.operationGuard.isCurrent(failureId)) {
        return;
      }
      this.appendProtocolEvent(`retry_started:${this.recovery.retryAttempt}`);
      if (canReuseTask) {
        await this.relaunch('reconnect', true, true);
      } else {
        await this.startSession(true);
      }
      return;
    }
    this.releaseLease();
    this.publish({
      ...this.snapshot,
      status: ViewStatus.Error,
      sessionState: RealtimeSessionState.Failure,
      microphoneActive: false,
      isReconfiguring: false,
      errorMessage: this.failureMapper.message(error),
      canOpenSystemSettings: false,
      protocolEvents: this.protocolLog.add(
        `failure:${this.failureMapper.code(error)}`,
      ),
    });
    if (this.recovery.isRecoverable(error)) {
      this.scheduleAutoRestart();
    }
  }

  private scheduleAutoRestart(): void {
    if (this.operationGuard.isDisposed) {
      return;
    }
    const armedState = this.snapshot.sessionState;
    const scheduled = this.recovery.scheduleAutoRestart(() => {
      if (this.operationGuard.isDisposed || this.snapshot.sessionState !== armedState) {
        return;
      }
      void this.start();
    });
    if (scheduled) {
      this.appendProtocolEvent('auto_restart_scheduled');
    }
  }

  private async disposeResources(): Promise<void> {
    this.routeWatcher.dispose();
    await this.stopCapture();
    await this.player.stop();
    await this.audioSession.deactivate();
    this.session?.sendSessionEnd();
    await this.taskLauncher.terminateBestEffort();
    await this.session?.close();
    await this.recorder.dispose();
    await this.player.dispose();
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

  private handlePlayerFailure(failure: unknown): void {
    if (isActive(this.snapshot.sessionState)) {
      void this.fail(this.operationGuard.current, failure);
    }
  }

  private releaseLease(): void {
    const lease = this.sessionLease;
    this.sessionLease = null;
    this.sessionGuard.release(lease);
  }

  private publish(next: ConversationSessionSnapshot): void {
    if (this.operationGuard.isDisposed || conversationSnapshotsEqual(next, this.currentSnapshot)) {
      return;
    }
    this.currentSnapshot = next;
    this.listeners.forEach(listener => listener(next));
  }

  private appendProtocolEvent(event: string): void {
    this.publish({
      ...this.snapshot,
      protocolEvents: this.protocolLog.add(event),
    });
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

  private sendPcm(chunk: Uint8Array, operationId: number): void {
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    const processed = this.micPipeline.process(chunk, this.voiceActivity.aiAudioPending);
    const sent = this.session?.sendAudio(processed.gated) ?? false;
    if (!sent) {
      void this.fail(operationId, WiroFailure.SocketConnection);
      return;
    }
    this.recovery.noteHealthy();
    this.voiceActivity.addUserChunk(processed.gated, processed.level);
    this.bargeIn.evaluate();
  }

  private handleEvent(event: RealtimeEvent, operationId: number): void {
    if (
      event.kind === 'status' &&
      (event.type === RealtimeEventType.Ended ||
        event.type === RealtimeEventType.PostprocessEnded)
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
      case 'output':
        this.handleOutput(event.message);
        break;
      case 'status':
        this.appendProtocolEvent(realtimeEventWireType(event));
        if (event.type === RealtimeEventType.StreamEnded) {
          this.finishAiTurn(operationId);
        } else if (event.type === RealtimeEventType.PostprocessEnded) {
          this.startNaturalCompletion(operationId);
        }
        break;
      case 'error':
        this.appendProtocolEvent(realtimeEventWireType(event));
        this.startNaturalCompletion(operationId);
        break;
      case 'cancel':
        this.appendProtocolEvent(realtimeEventWireType(event));
        void this.fail(operationId, WiroFailure.Cancelled);
        break;
      case 'malformed':
        this.appendProtocolEvent(realtimeEventWireType(event));
        void this.fail(operationId, WiroFailure.RealtimeProtocol);
        break;
      case 'unknown':
        this.appendProtocolEvent(realtimeEventWireType(event));
        break;
    }
  }

  private queueAudio(bytes: Uint8Array, operationId: number): void {
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    const outcome = this.playbackCoordinator.enqueue(bytes);
    if (outcome.silencedChunk || outcome.heldChunk) {
      return;
    }
    if (outcome.flushedPreviousTurn) {
      this.voiceActivity.resetAi();
      this.appendProtocolEvent('previous_turn_dropped');
    }
    if (outcome.droppedChunk) {
      this.appendProtocolEvent('audio_chunk_dropped');
    } else {
      this.voiceActivity.addAiChunk(bytes);
    }
  }

  private handleOutput(message: string): void {
    const parsed = this.transcriptParser.parse(message);
    if (!parsed) {
      this.appendProtocolEvent('task_output');
      return;
    }
    if (parsed.speaker === 'user') {
      this.publish({
        ...this.snapshot,
        userTranscript: parsed.text,
        protocolEvents: this.protocolLog.add('task_output'),
      });
    } else {
      this.publish({
        ...this.snapshot,
        aiTranscript: parsed.text,
        protocolEvents: this.protocolLog.add('task_output'),
      });
    }
  }

  private finishAiTurn(operationId: number): void {
    if (!this.operationGuard.isCurrent(operationId)) {
      return;
    }
    this.playbackCoordinator.markTurnFinished();
    this.publish({
      ...this.snapshot,
      sessionState: RealtimeSessionState.Streaming,
      microphoneActive: !this.snapshot.muted,
      protocolEvents: this.protocolLog.add('listening_resumed'),
    });
  }

  private startNaturalCompletion(operationId: number): void {
    if (!this.naturalCompletion) {
      this.naturalCompletion = this.completeNaturally(operationId);
    }
  }

  private async completeNaturally(operationId: number): Promise<void> {
    if (!this.operationGuard.isCurrent(operationId) || this.naturalCompletionRunning) {
      return;
    }
    this.naturalCompletionRunning = true;
    this.micPipeline.stopWatchdog();
    this.bargeIn.cancelHold();
    await this.stopCapture();
    await this.player.complete();
    await this.player.stop();
    this.playbackCoordinator.reset();
    this.voiceActivity.reset();
    this.noiseGate?.reset();
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
      isReconfiguring: false,
    });
    if (!this.pendingStop) {
      this.appendProtocolEvent('conversation_ended_remotely');
    }
  }

  private handleEventError(error: unknown, operationId: number): void {
    if (this.operationGuard.isCurrent(operationId)) {
      void this.fail(operationId, error);
    }
  }

  private handleEventStreamDone(operationId: number): void {
    const terminalReceived = this.terminalWait?.isCompleted ?? false;
    if (this.operationGuard.isCurrent(operationId) && !terminalReceived) {
      this.appendProtocolEvent('socket_closed_remotely');
      void this.fail(operationId, WiroFailure.SocketConnection);
    }
  }

  private handleAudioError(error: unknown, operationId: number): void {
    if (this.operationGuard.isCurrent(operationId)) {
      void this.fail(operationId, error);
    }
  }

  private async stopCapture(): Promise<void> {
    await this.recorder.stop();
  }

  private startMicWatchdog(operationId: number): void {
    this.watchdogOperationId = operationId;
    this.micPipeline.startWatchdog();
  }

  private handleMicStall(): void {
    const operationId = this.watchdogOperationId;
    if (
      !this.operationGuard.isCurrent(operationId) ||
      this.snapshot.sessionState !== RealtimeSessionState.Streaming
    ) {
      return;
    }
    if (this.snapshot.muted) {
      this.micPipeline.markAlive();
      return;
    }
    this.micPipeline.stopWatchdog();
    this.appendProtocolEvent('microphone_stalled');
    void this.fail(operationId, AudioFailure.Capture);
  }

  private startElapsedTimer(operationId: number): void {
    const base = this.snapshot.elapsedMs;
    this.elapsedClock.start(elapsed => {
      if (!this.operationGuard.isCurrent(operationId)) {
        return;
      }
      const total = base + elapsed;
      this.publish({ ...this.snapshot, elapsedMs: total });
      this.enforceSessionLimit(total);
    });
  }

  private enforceSessionLimit(elapsedMs: number): void {
    const limit = this.maxSessionDurationMs;
    if (limit <= 0 || elapsedMs < limit || this.pendingStop) {
      return;
    }
    this.appendProtocolEvent('session_limit_reached');
    void this.stop();
  }
}
