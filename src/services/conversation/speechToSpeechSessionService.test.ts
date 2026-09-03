import { ConversationConfig } from '../../app/conversationConfig';
import { ViewStatus } from '../../app/viewStatus';
import { AudioPreparationResult, RealtimeAudioInterruption } from '../../audio/realtimeAudioSession';
import { RealtimeSessionOwner } from '../../audio/sessionGuard';
import { WiroFailure } from '../../networking/failure';
import { RealtimeEvent, RealtimeEventType } from '../../realtime/event';
import { RealtimeSessionState } from '../../realtime/sessionState';
import { waitUntil } from '../../realtime/support/waitUntil';
import {
  ConversationTestDependencies,
  conversationPcm,
} from './support/conversationTestDependencies';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

function stringParam(
  dependencies: ConversationTestDependencies,
  key: string,
): unknown {
  return dependencies.apiClient.lastParameters?.[key];
}

describe('SpeechToSpeechSessionService', () => {
  it('starts gpt-realtime with verified PCM parameters', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();

    await service.start();

    expect(dependencies.audioSession.preparedProfiles).toEqual(['Conversation']);
    expect(stringParam(dependencies, 'input_audio_format')).toBe('audio/pcm');
    expect(stringParam(dependencies, 'output_audio_format')).toBe('audio/pcm');
    expect(stringParam(dependencies, 'input_audio_rate')).toBe('24000');
    expect(stringParam(dependencies, 'output_audio_rate')).toBe('24000');
    expect(dependencies.recorder.startCalls).toBe(1);
    expect(dependencies.player.startCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(service.snapshot.microphoneActive).toBe(true);

    await service.dispose();
  });

  it('sends the configured persona and voice', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();

    await service.start();

    expect(stringParam(dependencies, 'system_instructions')).toBe(
      ConversationConfig.PERSONA,
    );
    expect(stringParam(dependencies, 'voice')).toBe(ConversationConfig.VOICE);

    await service.dispose();
  });

  it('ends itself once the configured ceiling is reached', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ maxSessionDurationMs: 500 });

    await service.start();
    await delay(1_400);

    expect(service.snapshot.protocolEvents).toContain('session_limit_reached');
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);
    expect(dependencies.apiClient.runCalls).toBe(1);

    await service.dispose();
  }, 10_000);

  it('lets the conversation run on with a zero ceiling', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ maxSessionDurationMs: 0 });

    await service.start();
    await delay(1_200);

    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);

    await service.dispose();
  }, 10_000);

  it('streams microphone and assistant PCM concurrently', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.recorder.emit(new Uint8Array([1, 2]));
    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([3, 4])));
    await waitUntil(() => dependencies.session.sentAudio.length === 1);

    expect(dependencies.session.sentAudio).toHaveLength(1);
    expect(dependencies.session.sentAudio[0]).toEqual(new Uint8Array([1, 2]));
    expect(dependencies.player.fedChunks).toHaveLength(1);
    expect(dependencies.player.fedChunks[0]).toEqual(new Uint8Array([3, 4]));

    await service.dispose();
  });

  it('a user transcript alone never cuts assistant audio', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([1])));
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Stop'));
    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([2])));

    expect(dependencies.player.flushCalls).toBe(0);
    expect(dependencies.player.stopCalls).toBe(0);
    expect(dependencies.player.fedChunks).toHaveLength(2);
    expect(service.snapshot.userTranscript).toBe('Stop');

    await service.dispose();
  });

  it('a new assistant turn drops the interrupted turn tail', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([1])));
    dependencies.session.emit(RealtimeEvent.status(RealtimeEventType.StreamEnded));
    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([2])));
    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([3])));

    expect(dependencies.player.flushCalls).toBe(1);
    expect(dependencies.player.fedChunks).toHaveLength(2);
    expect(dependencies.player.fedChunks[0]).toEqual(new Uint8Array([2]));
    expect(dependencies.player.fedChunks[1]).toEqual(new Uint8Array([3]));
    expect(service.snapshot.protocolEvents).toContain('previous_turn_dropped');

    await service.dispose();
  });

  it('interruptAssistant cuts the turn and keeps the next', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array(48_000)));
    service.interruptAssistant();

    expect(dependencies.player.flushCalls).toBe(1);
    expect(service.snapshot.protocolEvents).toContain('assistant_silenced_by_user');

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([9])));
    expect(dependencies.player.fedChunks).toHaveLength(0);

    dependencies.session.emit(RealtimeEvent.status(RealtimeEventType.StreamEnded));
    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([7])));
    expect(dependencies.player.fedChunks).toHaveLength(1);
    expect(dependencies.player.fedChunks[0]).toEqual(new Uint8Array([7]));

    await service.dispose();
  });

  it('interruptAssistant with nothing playing never latches', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    service.interruptAssistant();
    expect(dependencies.player.flushCalls).toBe(0);

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([1])));
    expect(dependencies.player.fedChunks).toHaveLength(1);

    await service.dispose();
  });

  it('a noise burst pauses the answer and hands it back', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array(48_000)));
    for (let index = 0; index < 3; index += 1) {
      dependencies.recorder.emit(conversationPcm(20_000));
    }
    await waitUntil(() =>
      service.snapshot.protocolEvents.includes('assistant_playback_held'),
    );

    expect(dependencies.player.flushCalls).toBe(1);
    expect(service.snapshot.protocolEvents).not.toContain('assistant_interrupted');

    for (let index = 0; index < 3; index += 1) {
      dependencies.recorder.emit(conversationPcm(0));
    }
    await waitUntil(() =>
      service.snapshot.protocolEvents.includes('assistant_playback_resumed'),
    );

    expect(dependencies.player.fedChunks).toHaveLength(1);

    await service.dispose();
  });

  it('sustained speech over the assistant commits the cut', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array(48_000)));
    for (let index = 0; index < 8; index += 1) {
      dependencies.recorder.emit(conversationPcm(20_000));
    }
    await waitUntil(() =>
      service.snapshot.protocolEvents.includes('assistant_interrupted'),
    );

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([9])));
    expect(dependencies.player.fedChunks).toHaveLength(0);

    await service.dispose();
  });

  it('assigns progressive transcripts to the correct role', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello'));
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_AI:Hi there'));
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello world'));

    expect(service.snapshot.userTranscript).toBe('Hello world');
    expect(service.snapshot.aiTranscript).toBe('Hi there');

    await service.dispose();
  });

  it('mute drops microphone audio without closing the session', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    service.setMuted(true);
    dependencies.recorder.emit(new Uint8Array([1]));
    service.setMuted(false);
    dependencies.recorder.emit(new Uint8Array([2]));
    await waitUntil(() => dependencies.session.sentAudio.length === 1);

    expect(dependencies.session.sentAudio[0]).toEqual(new Uint8Array([2]));
    expect(dependencies.session.closeCalls).toBe(0);
    expect(service.snapshot.microphoneActive).toBe(true);

    await service.dispose();
  });

  it('stop releases all media and sends exactly one session end', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    await Promise.all([service.stop(), service.stop()]);

    expect(dependencies.recorder.stopCalls).toBe(1);
    expect(dependencies.player.stopCalls).toBe(1);
    expect(dependencies.session.sessionEndCalls).toBe(1);
    expect(dependencies.session.closeCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);
    expect(service.snapshot.microphoneActive).toBe(false);

    await service.dispose();
  });

  it('an AI turn end resumes listening without closing', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();
    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([1, 2])));

    dependencies.session.emit(RealtimeEvent.status(RealtimeEventType.StreamEnded));
    dependencies.session.emit(RealtimeEvent.status(RealtimeEventType.Ended));

    expect(dependencies.player.completeCalls).toBe(0);
    expect(dependencies.player.startCalls).toBe(1);
    expect(dependencies.player.fedChunks).toHaveLength(1);
    expect(dependencies.recorder.stopCalls).toBe(0);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(service.snapshot.microphoneActive).toBe(true);

    await service.dispose();
  });

  it('postprocess end drains media and completes the session', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(
      RealtimeEvent.status(RealtimeEventType.PostprocessEnded),
    );
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(dependencies.player.completeCalls).toBe(1);
    expect(dependencies.recorder.stopCalls).toBe(1);

    await service.dispose();
  });

  it('a remote task end costs nothing more', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ autoRestartDelayMs: 50 });
    await service.start();

    dependencies.session.emit(
      RealtimeEvent.status(RealtimeEventType.PostprocessEnded),
    );
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(service.snapshot.protocolEvents).toContain('conversation_ended_remotely');

    await delay(200);

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);

    await service.dispose();
  });

  it('a user stop never restarts by itself', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ autoRestartDelayMs: 20 });
    await service.start();

    await service.stop();
    await delay(100);

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);
    expect(service.snapshot.protocolEvents).not.toContain(
      'conversation_ended_remotely',
    );

    await service.dispose();
  });

  it('permission denial does not create a task', async () => {
    const dependencies = new ConversationTestDependencies({
      preparationResult: AudioPreparationResult.PermissionDenied,
    });
    const service = dependencies.createService();

    await service.start();

    expect(dependencies.apiClient.runCalls).toBe(0);
    expect(service.snapshot.status).toBe(ViewStatus.Error);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Failure);
    expect(service.snapshot.errorMessage).not.toBeNull();
    expect(service.snapshot.canOpenSystemSettings).toBe(false);

    await service.dispose();
  });

  it('a permanently denied microphone offers settings', async () => {
    const dependencies = new ConversationTestDependencies({
      preparationResult: AudioPreparationResult.PermissionPermanentlyDenied,
    });
    const service = dependencies.createService();

    await service.start();

    expect(service.snapshot.canOpenSystemSettings).toBe(true);

    await service.openSystemSettings();

    expect(dependencies.audioSession.systemSettingsResult).toBe(true);

    await service.dispose();
  });

  it('a transport failure is not a settings problem', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emitError(WiroFailure.SocketConnection);
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Failure,
    );

    expect(service.snapshot.errorMessage).not.toBeNull();
    expect(service.snapshot.canOpenSystemSettings).toBe(false);

    await service.dispose();
  });

  it('retries a transient start failure before publishing failure', async () => {
    const dependencies = new ConversationTestDependencies({
      runErrors: [WiroFailure.NetworkUnavailable],
    });
    const service = dependencies.createService({ maxRetryAttempts: 2 });
    const publishedStates: RealtimeSessionState[] = [];
    const unsubscribe = service.subscribe(snapshot =>
      publishedStates.push(snapshot.sessionState),
    );

    await service.start();

    expect(dependencies.apiClient.runCalls).toBe(2);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(publishedStates).not.toContain(RealtimeSessionState.Failure);
    expect(service.snapshot.protocolEvents).toContain('retry_started:1');

    unsubscribe();
    await service.dispose();
  });

  it('publishes failure only after retries are exhausted', async () => {
    const dependencies = new ConversationTestDependencies({
      runErrors: [
        WiroFailure.NetworkUnavailable,
        WiroFailure.NetworkUnavailable,
        WiroFailure.NetworkUnavailable,
      ],
    });
    const service = dependencies.createService({ maxRetryAttempts: 2 });

    await service.start();

    expect(dependencies.apiClient.runCalls).toBe(3);
    expect(service.snapshot.status).toBe(ViewStatus.Error);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Failure);

    await service.dispose();
  });

  it('stops an active session when audio is interrupted', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.audioSession.emitInterruption(RealtimeAudioInterruption.Began);
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(dependencies.session.sessionEndCalls).toBe(1);

    await service.dispose();
  });

  it('a mid-stream socket failure returns to the same task', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ maxRetryAttempts: 1 });
    await service.start();
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello'));

    dependencies.session.emitError(WiroFailure.SocketConnection);
    await waitUntil(() =>
      service.snapshot.protocolEvents.includes('reconnect_accepted'),
    );

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(dependencies.apiClient.terminateCalls).toBe(0);
    expect(dependencies.taskTokens).toEqual(['task-token', 'task-token']);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(service.snapshot.userTranscript).toBe('Hello');

    await service.dispose();
  });

  it('leaving silences the microphone and frees the hardware', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ suspendGracePeriodMs: 5_000 });
    await service.start();

    await service.suspend();

    expect(service.snapshot.isSuspended).toBe(true);
    expect(service.snapshot.microphoneActive).toBe(false);
    expect(dependencies.recorder.isRecording).toBe(false);
    expect(dependencies.session.sessionEndCalls).toBe(0);
    expect(dependencies.apiClient.terminateCalls).toBe(0);
    expect(
      dependencies.sessionGuard.acquire(RealtimeSessionOwner.Transcription),
    ).not.toBeNull();

    await service.dispose();
  });

  it('coming back continues the same task', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ suspendGracePeriodMs: 5_000 });
    await service.start();
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello'));
    await service.suspend();

    await service.resume();

    expect(service.snapshot.isSuspended).toBe(false);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(service.snapshot.userTranscript).toBe('Hello');
    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(dependencies.taskTokens).toEqual(['task-token', 'task-token']);

    await service.dispose();
  });

  it('a speaker who never comes back is hung up on', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ suspendGracePeriodMs: 40 });
    await service.start();
    await service.suspend();

    await delay(160);

    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);
    expect(service.snapshot.isSuspended).toBe(false);
    expect(service.snapshot.protocolEvents).toContain('hold_expired');
    expect(dependencies.apiClient.terminateCalls).toBe(1);

    await service.dispose();
  });

  it('the configured default ends the conversation outright', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    await service.suspend();

    expect(service.snapshot.isSuspended).toBe(false);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);
    expect(dependencies.session.sessionEndCalls).toBe(1);

    await service.dispose();
  });

  it('an idle conversation has nothing to hold', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();

    await service.suspend();
    await service.resume();

    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Idle);
    expect(dependencies.apiClient.runCalls).toBe(0);

    await service.dispose();
  });

  it('a task that refuses the reconnect is replaced', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ maxRetryAttempts: 1 });
    await service.start();
    dependencies.session.connectError = WiroFailure.SocketConnection;

    dependencies.session.emitError(WiroFailure.SocketConnection);
    await waitUntil(
      () =>
        service.snapshot.sessionState === RealtimeSessionState.Streaming &&
        dependencies.apiClient.runCalls === 2,
    );

    expect(service.snapshot.protocolEvents).toContain('reconnect_refused');
    expect(dependencies.apiClient.terminateCalls).toBe(1);

    await service.dispose();
  });

  it('a dead microphone reconnects then fails once retries run out', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({
      maxRetryAttempts: 1,
      micStallTimeoutMs: 60,
    });

    await service.start();
    await delay(500);

    expect(service.snapshot.protocolEvents).toContain('microphone_stalled');
    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Failure);

    await service.dispose();
  }, 10_000);

  it('a recoverable failure restarts the conversation by itself', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ autoRestartDelayMs: 50 });
    await service.start();

    dependencies.session.emitError(WiroFailure.SocketConnection);
    await waitUntil(() =>
      service.snapshot.protocolEvents.includes('auto_restart_scheduled'),
    );

    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Failure);

    await delay(200);

    expect(dependencies.apiClient.runCalls).toBe(2);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);

    await service.dispose();
  });

  it('leaving the screen cancels a scheduled restart', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({ autoRestartDelayMs: 50 });
    await service.start();

    dependencies.session.emitError(WiroFailure.SocketConnection);
    await waitUntil(() =>
      service.snapshot.protocolEvents.includes('auto_restart_scheduled'),
    );

    await service.suspend();
    await delay(200);

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Failure);

    await service.dispose();
  });

  it('a denied permission never restarts by itself', async () => {
    const dependencies = new ConversationTestDependencies({
      preparationResult: AudioPreparationResult.PermissionDenied,
    });
    const service = dependencies.createService({ autoRestartDelayMs: 20 });

    await service.start();
    await delay(100);

    expect(dependencies.apiClient.runCalls).toBe(0);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Failure);
    expect(service.snapshot.protocolEvents).not.toContain('auto_restart_scheduled');

    await service.dispose();
  });

  it('a failure reports what happened in one line', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emitError(WiroFailure.SocketConnection);
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Failure,
    );

    expect(service.snapshot.errorMessage).not.toBeNull();

    await service.dispose();
  });

  it('a task error hands the conversation back', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.error('task_error'));
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(service.snapshot.microphoneActive).toBe(false);
    expect(dependencies.recorder.isRecording).toBe(false);
    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.protocolEvents).toContain('task_error');

    await service.dispose();
  });

  it('a command after dispose is ignored', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();
    await service.dispose();

    await service.start();
    await service.stop();
    service.setMuted(true);

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(dependencies.recorder.startCalls).toBe(1);
  });

  it('a start after dispose does not strand the shared lease', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.dispose();

    await service.start();

    expect(
      dependencies.sessionGuard.acquire(RealtimeSessionOwner.Transcription),
    ).not.toBeNull();
  });

  it('configured parameters replace the catalog defaults, but never persona or voice', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService({
      parameterOverrides: {
        transcription_model: 'whisper-1',
        turn_detection_threshold: '0.6',
        voice: 'cedar',
      },
    });

    await service.start();

    expect(stringParam(dependencies, 'transcription_model')).toBe('whisper-1');
    expect(stringParam(dependencies, 'turn_detection_threshold')).toBe(0.6);
    expect(stringParam(dependencies, 'voice')).toBe(ConversationConfig.VOICE);

    await service.dispose();
  });

  it('rapid starts create only one run', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();

    await Promise.all([service.start(), service.start()]);

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);

    await service.dispose();
  });

  it('dispose closes the socket and audio', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    await service.dispose();

    expect(dependencies.session.closeCalls).toBeGreaterThanOrEqual(1);
    expect(dependencies.recorder.disposeCalls).toBe(1);
    expect(dependencies.player.disposeCalls).toBe(1);
  });

  it('a headphone unplug stops without a second run', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.audioSession.emitBecomingNoisy();
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(dependencies.session.sessionEndCalls).toBe(1);

    await service.dispose();
  });

  it('a route change does not create a second run', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.audioSession.emitRouteChanged();
    await waitUntil(() =>
      service.snapshot.protocolEvents.includes('audio_route_changed'),
    );

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);

    await service.dispose();
  });

  it('protocol events never carry the task token', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hi'));
    dependencies.session.emit(RealtimeEvent.unknown('future_event'));

    expect(
      service.snapshot.protocolEvents.every(
        event => !event.includes('task-token'),
      ),
    ).toBe(true);

    await service.dispose();
  });

  it('keeps the local protocol history bounded', async () => {
    const dependencies = new ConversationTestDependencies();
    const service = dependencies.createService();
    await service.start();

    for (let index = 0; index < 50; index += 1) {
      dependencies.session.emit(RealtimeEvent.unknown(`future_event_${index}`));
    }

    expect(service.snapshot.protocolEvents).toHaveLength(40);

    await service.dispose();
  });
});
