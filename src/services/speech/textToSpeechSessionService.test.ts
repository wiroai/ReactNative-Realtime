import { ViewStatus } from '../../app/viewStatus';
import { RealtimeAudioInterruption } from '../../audio/realtimeAudioSession';
import { RealtimeSessionOwner } from '../../audio/sessionGuard';
import { RealtimeDirection } from '../../models/modelDefinition';
import { mossTtsRealtime, voxcpm2, voxtralMiniRealtime } from '../../models/catalog';
import { RealtimeEvent, RealtimeEventType } from '../../realtime/event';
import { RealtimeSessionState } from '../../realtime/sessionState';
import { waitUntil } from '../../realtime/support/waitUntil';
import { SpeechTestDependencies } from './support/speechTestDependencies';

const ENTER_TEXT = 'Enter text to synthesize.';

describe('TextToSpeechSessionService', () => {
  it('requires non-empty trimmed text', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = '   ';

    await service.start();

    expect(dependencies.apiClient.runCalls).toBe(0);
    expect(dependencies.audioSession.preparedProfiles).toHaveLength(0);
    expect(service.snapshot.status).toBe(ViewStatus.Error);
    expect(service.snapshot.errorMessage).toBe(ENTER_TEXT);

    await service.dispose();
  });

  it('runs MOSS with text and prepares playback', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = '  Hello realtime speech.  ';

    await service.start();

    expect(dependencies.audioSession.preparedProfiles).toEqual(['Speech']);
    expect(dependencies.apiClient.lastParameters?.text).toBe(
      'Hello realtime speech.',
    );
    expect(dependencies.session.connectCalls).toBe(1);
    expect(dependencies.player.startCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);

    await service.dispose();
  });

  it('selects inactive TTS models and changes the prompt field', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();

    service.selectModel(voxcpm2);
    service.prompt = 'Vox prompt';
    await service.start();

    expect(service.snapshot.selectedModel).toBe(voxcpm2);
    expect(dependencies.apiClient.lastParameters?.prompt).toBe('Vox prompt');
    expect(dependencies.apiClient.lastParameters?.cfgValue).toBe(2.0);
    expect(dependencies.apiClient.lastParameters?.inferenceSteps).toBe(10);

    await service.dispose();
  });

  it('reselecting the model resets its parameter values', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Discard me';

    service.selectModel(mossTtsRealtime);

    expect(service.prompt).toBe('');

    await service.dispose();
  });

  it('rejects model changes while active or in another direction', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();

    service.selectModel(voxtralMiniRealtime);
    expect(service.snapshot.selectedModel.direction).toBe(
      RealtimeDirection.TextToSpeech,
    );
    service.prompt = 'Hello';
    await service.start();
    service.selectModel(voxcpm2);

    expect(service.snapshot.selectedModel.slug).toBe(mossTtsRealtime.slug);

    await service.dispose();
  });

  it('resubscribes to a task the socket dropped while spinning up', async () => {
    const dependencies = new SpeechTestDependencies({ sessionConnectFailures: 2 });
    const service = dependencies.createService();
    service.prompt = 'Hello';

    await service.start();

    expect(dependencies.session.connectCalls).toBe(3);
    expect(dependencies.apiClient.terminatedTaskIds).toHaveLength(0);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(service.snapshot.protocolEvents).toContain('socket_reconnect:1');

    await service.dispose();
  });

  it('a task that never streams fails once the retry budget is spent', async () => {
    const dependencies = new SpeechTestDependencies({ sessionConnectFailures: 99 });
    const service = dependencies.createService();
    service.prompt = 'Hello';

    await service.start();

    expect(dependencies.session.connectCalls).toBe(8);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Failure);
    expect(dependencies.apiClient.terminatedTaskIds).toEqual(['task-id']);

    await service.dispose();
  });

  it('queues PCM in FIFO and drains before natural completion', async () => {
    const dependencies = new SpeechTestDependencies({ holdComplete: true });
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([1, 2])));
    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([3, 4])));
    dependencies.session.emit(RealtimeEvent.status(RealtimeEventType.StreamEnded));
    dependencies.session.emit(
      RealtimeEvent.status(RealtimeEventType.PostprocessEnded),
    );
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Stopping,
    );

    expect(dependencies.player.fedChunks).toHaveLength(2);
    expect(dependencies.player.fedChunks[0]).toEqual(new Uint8Array([1, 2]));
    expect(dependencies.player.fedChunks[1]).toEqual(new Uint8Array([3, 4]));
    expect(service.snapshot.isPlaying).toBe(true);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Stopping);

    dependencies.player.releaseComplete();
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );
    expect(service.snapshot.isPlaying).toBe(false);
    expect(dependencies.player.completeCalls).toBe(1);

    await service.dispose();
  });

  it('early stop flushes playback and ends once', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();
    dependencies.session.emit(RealtimeEvent.binary(new Uint8Array([1, 2])));

    await Promise.all([service.stop(), service.stop()]);

    expect(dependencies.player.stopCalls).toBe(1);
    expect(dependencies.session.sessionEndCalls).toBe(1);
    expect(dependencies.session.closeCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);

    await service.dispose();
  });

  it('maps playback failures to a sanitized failure', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    dependencies.player.emitFailure();
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Failure,
    );

    expect(service.snapshot.status).toBe(ViewStatus.Error);
    expect(service.snapshot.errorMessage?.includes('platform')).toBe(false);

    await service.dispose();
  });

  it('rejects malformed realtime audio frames', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    dependencies.session.emit(RealtimeEvent.malformed());
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Failure,
    );

    expect(service.snapshot.status).toBe(ViewStatus.Error);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Failure);

    await service.dispose();
  });

  it('cancels a pending run and terminates a stale result', async () => {
    const dependencies = new SpeechTestDependencies();
    dependencies.apiClient.holdRunModel = true;
    const service = dependencies.createService();
    service.prompt = 'Hello';
    const starting = service.start();
    await dependencies.apiClient.waitUntilHolding();

    const stopping = service.stop();
    await waitUntil(
      () => dependencies.apiClient.lastCancellation?.isCancelled === true,
    );
    dependencies.apiClient.completeRunModel();
    await starting;
    await stopping;

    expect(dependencies.apiClient.terminatedTaskIds).toEqual(['task-id']);
    expect(dependencies.session.connectCalls).toBe(0);

    await service.dispose();
  });

  it('a slow shutdown confirmation completes without an error', async () => {
    const dependencies = new SpeechTestDependencies({ completeSessionEnd: false });
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    await service.stop();

    expect(service.snapshot.status).toBe(ViewStatus.Success);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);
    expect(service.snapshot.errorMessage).toBeNull();
    expect(service.snapshot.protocolEvents).toContain('shutdown_timeout');

    await service.dispose();
  });

  it('stops an active session on interruption', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    dependencies.audioSession.emitInterruption(RealtimeAudioInterruption.Began);
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(dependencies.session.sessionEndCalls).toBe(1);

    await service.dispose();
  });

  it('keeps protocol history bounded', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    for (let index = 0; index < 50; index += 1) {
      dependencies.session.emit(RealtimeEvent.unknown(`future_event_${index}`));
    }

    expect(service.snapshot.protocolEvents).toHaveLength(40);

    await service.dispose();
  });

  it('commands after dispose are safe no-ops', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    await service.dispose();
    const snapshot = service.snapshot;

    service.selectModel(voxcpm2);
    await service.start();
    await service.stop();

    expect(dependencies.apiClient.runCalls).toBe(0);
    expect(service.snapshot).toEqual(snapshot);
  });

  it('a start after dispose does not strand the shared lease', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    await service.dispose();

    await service.start();

    expect(
      dependencies.sessionGuard.acquire(RealtimeSessionOwner.Conversation),
    ).not.toBeNull();
  });

  it('stream and postprocess racing stop remain idempotent', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    dependencies.session.emit(RealtimeEvent.status(RealtimeEventType.StreamEnded));
    dependencies.session.emit(
      RealtimeEvent.status(RealtimeEventType.PostprocessEnded),
    );
    await service.stop();
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(dependencies.session.closeCalls).toBe(1);
    expect(dependencies.player.completeCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Completed);

    await service.dispose();
  });

  it('rapid starts create only one run', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';

    await Promise.all([service.start(), service.start()]);

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);

    await service.dispose();
  });

  it('dispose closes the socket and player', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    await service.dispose();

    expect(dependencies.session.closeCalls).toBeGreaterThanOrEqual(1);
    expect(dependencies.player.disposeCalls).toBe(1);
  });

  it('a headphone unplug stops without a second run', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    dependencies.audioSession.emitBecomingNoisy();
    await waitUntil(
      () => service.snapshot.sessionState === RealtimeSessionState.Completed,
    );

    expect(dependencies.apiClient.runCalls).toBe(1);

    await service.dispose();
  });

  it('a route change does not create a second run', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    await service.start();

    dependencies.audioSession.emitRouteChanged();
    await waitUntil(
      () => service.snapshot.protocolEvents.includes('audio_route_changed'),
    );

    expect(dependencies.apiClient.runCalls).toBe(1);
    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);

    await service.dispose();
  });

  it('a start during another feature teardown waits it out', async () => {
    const dependencies = new SpeechTestDependencies();
    const service = dependencies.createService();
    service.prompt = 'Hello';
    const departing = dependencies.sessionGuard.acquire(
      RealtimeSessionOwner.Conversation,
    );

    const starting = service.start();
    await waitUntil(() => service.snapshot.status === ViewStatus.Loading);
    dependencies.sessionGuard.release(departing);
    await starting;

    expect(service.snapshot.sessionState).toBe(RealtimeSessionState.Streaming);
    expect(service.snapshot.errorMessage).toBeNull();

    await service.dispose();
  });
});
