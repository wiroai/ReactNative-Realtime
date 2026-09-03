import { AppLifecycleTracker } from './appLifecycle';

function fakeControllers() {
  return {
    suspendConversation: jest.fn(),
    stopTranscription: jest.fn(),
    stopSpeech: jest.fn(),
    resumeConversation: jest.fn(),
  };
}

describe('AppLifecycleTracker', () => {
  it('hangs up all three sessions the first time the app backgrounds', () => {
    const tracker = new AppLifecycleTracker('active');
    const controllers = fakeControllers();

    tracker.onStateChange('background', controllers, () => true);

    expect(controllers.suspendConversation).toHaveBeenCalledTimes(1);
    expect(controllers.stopTranscription).toHaveBeenCalledTimes(1);
    expect(controllers.stopSpeech).toHaveBeenCalledTimes(1);
    expect(controllers.resumeConversation).not.toHaveBeenCalled();
  });

  it('does not hang up again on a repeated background notification', () => {
    const tracker = new AppLifecycleTracker('background');
    const controllers = fakeControllers();

    tracker.onStateChange('background', controllers, () => true);

    expect(controllers.suspendConversation).not.toHaveBeenCalled();
  });

  it('ignores the transient inactive state — no hang up, no resume', () => {
    const tracker = new AppLifecycleTracker('active');
    const controllers = fakeControllers();

    tracker.onStateChange('inactive', controllers, () => true);

    expect(controllers.suspendConversation).not.toHaveBeenCalled();
    expect(controllers.stopTranscription).not.toHaveBeenCalled();
    expect(controllers.stopSpeech).not.toHaveBeenCalled();
    expect(controllers.resumeConversation).not.toHaveBeenCalled();
  });

  it('resumes conversation on return from background when its tab is visible', () => {
    const tracker = new AppLifecycleTracker('background');
    const controllers = fakeControllers();

    tracker.onStateChange('active', controllers, () => true);

    expect(controllers.resumeConversation).toHaveBeenCalledTimes(1);
  });

  it('does not resume conversation on return from background when another tab is visible', () => {
    const tracker = new AppLifecycleTracker('background');
    const controllers = fakeControllers();

    tracker.onStateChange('active', controllers, () => false);

    expect(controllers.resumeConversation).not.toHaveBeenCalled();
  });

  it('does not resume when returning to active from inactive (never backgrounded)', () => {
    const tracker = new AppLifecycleTracker('inactive');
    const controllers = fakeControllers();

    tracker.onStateChange('active', controllers, () => true);

    expect(controllers.resumeConversation).not.toHaveBeenCalled();
  });
});
