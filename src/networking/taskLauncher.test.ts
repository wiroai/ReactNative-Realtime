import { gptRealtimeMini } from '../models/catalog';
import { modelSlug } from '../models/modelDefinition';
import { FakeWiroApiClient } from './support/fakeWiroApiClient';
import { RealtimeTaskLauncher } from './taskLauncher';

describe('RealtimeTaskLauncher', () => {
  it('returns the task and forwards the request parameters', async () => {
    const apiClient = new FakeWiroApiClient();
    const launcher = new RealtimeTaskLauncher(apiClient);

    const runResult = await launcher.launch(
      gptRealtimeMini,
      { sampleRate: 24000 },
      () => true,
    );

    expect(runResult?.taskId).toBe('task-1');
    expect(apiClient.runCalls).toBe(1);
    expect(apiClient.lastParameters?.sampleRate).toBe(24000);
    expect(
      apiClient.lastModel && modelSlug(apiClient.lastModel),
    ).toBe(modelSlug(gptRealtimeMini));
  });

  it('terminates a task that arrives after the caller moved on', async () => {
    const apiClient = new FakeWiroApiClient();
    const launcher = new RealtimeTaskLauncher(apiClient);

    const runResult = await launcher.launch(
      gptRealtimeMini,
      {},
      () => false,
    );

    expect(runResult).toBeNull();
    expect(apiClient.terminatedTaskIds).toEqual(['task-1']);
  });

  it('does not terminate a stale task twice on a later teardown', async () => {
    const apiClient = new FakeWiroApiClient();
    const launcher = new RealtimeTaskLauncher(apiClient);

    await launcher.launch(gptRealtimeMini, {}, () => false);
    await launcher.terminateBestEffort();

    expect(apiClient.terminatedTaskIds).toEqual(['task-1']);
  });

  it('tears down the live task exactly once on terminateBestEffort', async () => {
    const apiClient = new FakeWiroApiClient();
    const launcher = new RealtimeTaskLauncher(apiClient);

    await launcher.launch(gptRealtimeMini, {}, () => true);
    await launcher.terminateBestEffort();
    await launcher.terminateBestEffort();

    expect(apiClient.terminatedTaskIds).toEqual(['task-1']);
  });

  it('release forgets the task without terminating it', async () => {
    const apiClient = new FakeWiroApiClient();
    const launcher = new RealtimeTaskLauncher(apiClient);

    await launcher.launch(gptRealtimeMini, {}, () => true);
    launcher.release();
    await launcher.terminateBestEffort();

    expect(apiClient.terminatedTaskIds).toHaveLength(0);
  });

  it('cancelPendingRequest aborts an in-flight request', async () => {
    const apiClient = new FakeWiroApiClient();
    apiClient.holdRunModel = true;
    const launcher = new RealtimeTaskLauncher(apiClient);

    const pending = launcher.launch(gptRealtimeMini, {}, () => true);
    await apiClient.waitUntilHolding();
    launcher.cancelPendingRequest();

    expect(apiClient.lastCancellation?.isCancelled).toBe(true);
    apiClient.completeRunModel();
    await pending;
  });

  it('leaves no cancellation to abort after a completed launch', async () => {
    const apiClient = new FakeWiroApiClient();
    const launcher = new RealtimeTaskLauncher(apiClient);

    await launcher.launch(gptRealtimeMini, {}, () => true);
    launcher.cancelPendingRequest();

    expect(apiClient.lastCancellation?.isCancelled).toBe(false);
    expect(apiClient.lastCancellation).not.toBeNull();
  });

  it('is safe to tear down when nothing was ever launched', async () => {
    const apiClient = new FakeWiroApiClient();
    const launcher = new RealtimeTaskLauncher(apiClient);

    launcher.release();
    await launcher.terminateBestEffort();
    launcher.cancelPendingRequest();

    expect(apiClient.terminatedTaskIds).toHaveLength(0);
  });
});
