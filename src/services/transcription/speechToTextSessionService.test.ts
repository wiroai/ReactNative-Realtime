import { ViewStatus } from '../../app/viewStatus';
import { AudioPreparationResult, RealtimeAudioInterruption } from '../../audio/realtimeAudioSession';
import { RealtimeSessionOwner } from '../../audio/sessionGuard';
import { RealtimeEvent, RealtimeEventType } from '../../realtime/event';
import { RealtimeSessionState } from '../../realtime/sessionState';
import { waitUntil } from '../../realtime/support/waitUntil';
import { TranscriptionTestDependencies } from './support/transcriptionTestDependencies';

describe('SpeechToTextSessionService', () => {
  it('runs Voxtral and streams prefixed PCM after readiness', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();

    await service.start();
    dependencies.recorder.emit(new Uint8Array([1, 2, 3]));
    await waitUntil(() => dependencies.session.sentAudio.length === 1);

    expect(dependencies.audioSession.preparedProfiles).toEqual(['Transcription']);
    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(dependencies.apiClient.lastParameters?.transcriptionDelay).toBe('balanced');
    expect(dependencies.session.sentAudio[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(service.snapshot.microphoneActive).toBe(true);

    await service.dispose();
  });

  it('a growing utterance refines the transcript in place', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello'));
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello world'));

    expect(service.snapshot.transcript).toBe('Hello world');
    expect(
      service.snapshot.protocolEvents.filter(event => event === 'task_output'),
    ).toHaveLength(2);

    await service.dispose();
  });

  it('a new utterance joins the transcript instead of erasing it', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello world.'));
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:How are'));
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:How are you?'));
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Good.'));

    expect(service.snapshot.transcript).toBe('Hello world. How are you? Good.');

    await service.dispose();
  });

  it('a shorter re-emit of the live utterance changes nothing', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello world'));
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Hello'));

    expect(service.snapshot.transcript).toBe('Hello world');

    await service.dispose();
  });

  it('a new take starts from a blank transcript', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Old take'));
    await service.stop();

    await service.start();
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:New take'));

    expect(service.snapshot.transcript).toBe('New take');

    await service.dispose();
  });

  it('stop releases the microphone and sends exactly one session end', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    await Promise.all([service.stop(), service.stop()]);

    expect(dependencies.recorder.stopCalls).toBe(1);
    expect(dependencies.audioSession.deactivateCalls).toBe(1);
    expect(dependencies.session.sessionEndCalls).toBe(1);
    expect(dependencies.session.closeCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);
    expect(service.snapshot.microphoneActive).toBe(false);

    await service.dispose();
  });

  it('a slow shutdown confirmation completes without an error', async () => {
    const dependencies = new TranscriptionTestDependencies({
      completeSessionEnd: false,
    });
    const service = dependencies.createService();
    await service.start();

    await service.stop();

    expect(service.snapshot.status).toBe(ViewStatus.Success);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);
    expect(service.snapshot.errorMessage).toBeNull();
    expect(service.snapshot.protocolEvents).toContain('shutdown_timeout');

    await service.dispose();
  });

  it('maps a denied microphone permission without running a task', async () => {
    const dependencies = new TranscriptionTestDependencies({
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
    const dependencies = new TranscriptionTestDependencies({
      preparationResult: AudioPreparationResult.PermissionPermanentlyDenied,
    });
    const service = dependencies.createService();

    await service.start();

    expect(service.snapshot.canOpenSystemSettings).toBe(true);

    await service.openSystemSettings();

    expect(dependencies.audioSession.systemSettingsResult).toBe(true);

    await service.dispose();
  });

  it('cancels a pending run request during stop', async () => {
    const dependencies = new TranscriptionTestDependencies();
    dependencies.apiClient.holdRunModel = true;
    const service = dependencies.createService();
    const starting = service.start();
    await dependencies.apiClient.waitUntilHolding();

    const stopping = service.stop();
    await waitUntil(() => dependencies.apiClient.lastCancellation?.isCancelled === true);
    dependencies.apiClient.completeRunModel();
    await starting;
    await stopping;

    expect(dependencies.apiClient.lastCancellation?.isCancelled).toBe(true);
    expect(dependencies.session.connectCalls).toBe(0);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);

    await service.dispose();
  });

  it('terminates a run result that arrives after stop', async () => {
    const dependencies = new TranscriptionTestDependencies();
    dependencies.apiClient.holdRunModel = true;
    const service = dependencies.createService();
    const starting = service.start();
    await dependencies.apiClient.waitUntilHolding();

    const stopping = service.stop();
    await waitUntil(() => dependencies.apiClient.lastCancellation?.isCancelled === true);
    dependencies.apiClient.completeRunModel();
    await starting;
    await stopping;

    expect(dependencies.apiClient.terminatedTaskIds).toEqual(['task-id']);
    expect(dependencies.session.connectCalls).toBe(0);

    await service.dispose();
  });

  it('stream end stops capture before natural completion', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.status(RealtimeEventType.StreamEnded));
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Stopping,
    );

    expect(service.snapshot.microphoneActive).toBe(false);
    expect(dependencies.recorder.stopCalls).toBe(1);
    expect(dependencies.session.closeCalls).toBe(0);

    await service.dispose();
  });

  it('completes naturally after postprocess end', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.status(RealtimeEventType.StreamEnded));
    dependencies.session.emit(
      RealtimeEvent.status(RealtimeEventType.PostprocessEnded),
    );
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(service.snapshot.microphoneActive).toBe(false);
    expect(dependencies.recorder.stopCalls).toBe(1);

    await service.dispose();
  });

  it('rejects unexpected server audio for STT', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([1, 2])));
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Failure,
    );

    expect(service.snapshot.status).toBe(ViewStatus.Error);
    expect(service.snapshot.errorMessage?.includes('1, 2')).toBe(false);
    expect(service.snapshot.protocolEvents).toContain('failure:realtimeProtocol');

    await service.dispose();
  });

  it('clearTranscript is inactive-only business behavior', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();
    dependencies.session.emit(RealtimeEvent.output('TRANSCRIPT_USER:Keep me'));

    service.clearTranscript();
    expect(service.snapshot.transcript).toBe('Keep me');

    await service.stop();
    service.clearTranscript();
    expect(service.snapshot.transcript).toBe('');

    await service.dispose();
  });

  it('mute drops microphone audio without closing the session', async () => {
    const dependencies = new TranscriptionTestDependencies();
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

  it('stops an active session when audio is interrupted', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.audioSession.emitInterruption(RealtimeAudioInterruption.Began);
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(dependencies.session.sessionEndCalls).toBe(1);

    await service.dispose();
  });

  it('commands after dispose are safe no-ops', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();
    await service.dispose();
    const snapshot = service.snapshot;

    await service.start();
    await service.stop();
    service.clearTranscript();

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(dependencies.recorder.startCalls).toBe(1);
    expect(service.snapshot).toEqual(snapshot);
  });

  it('a start after dispose does not strand the shared lease', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.dispose();

    await service.start();

    expect(
      dependencies.sessionGuard.acquire(RealtimeSessionOwner.Conversation),
    ).not.toBeNull();
  });

  it('a start during another feature teardown waits it out', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    const departing = dependencies.sessionGuard.acquire(RealtimeSessionOwner.Conversation);

    const starting = service.start();
    await waitUntil(() => service.snapshot.status === ViewStatus.Loading);
    dependencies.sessionGuard.release(departing);
    await starting;

    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(service.snapshot.errorMessage).toBeNull();

    await service.dispose();
  });

  it('rapid starts create only one run', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();

    await Promise.all([service.start(), service.start()]);

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);

    await service.dispose();
  });

  it('dispose closes the socket and microphone', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    await service.dispose();

    expect(dependencies.session.closeCalls).toBeGreaterThanOrEqual(1);
    expect(dependencies.recorder.disposeCalls).toBe(1);
  });

  it('a headphone unplug stops without a second run', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    dependencies.audioSession.emitBecomingNoisy();
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(dependencies.apiClient.runCalls).toBe(1);

    await service.dispose();
  });

  it('keeps the local protocol history bounded', async () => {
    const dependencies = new TranscriptionTestDependencies();
    const service = dependencies.createService();
    await service.start();

    for (let index = 0; index < 50; index += 1) {
      dependencies.session.emit(RealtimeEvent.unknown(`future_event_${index}`));
    }

    expect(service.snapshot.protocolEvents).toHaveLength(40);

    await service.dispose();
  });
});
