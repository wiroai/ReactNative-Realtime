import { AudioConstants } from '../../audio/audioConstants';
import {
  ConversationVoiceActivity,
  ConversationVoicePhase,
} from './voiceActivity';

const BYTES_PER_MS =
  (AudioConstants.SAMPLE_RATE_HZ *
    AudioConstants.CHANNEL_COUNT *
    AudioConstants.BITS_PER_SAMPLE) /
  8 /
  1_000;

function silence(durationMs: number): Uint8Array {
  return new Uint8Array(durationMs * BYTES_PER_MS);
}

describe('ConversationVoiceActivity phase subscription', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('notifies on transitions only, never on repeated chunks', () => {
    let now = 0;
    const activity = new ConversationVoiceActivity(() => now);
    const phases: ConversationVoicePhase[] = [];
    activity.subscribePhase(phase => phases.push(phase));

    activity.addUserChunk(silence(20), 0.9);
    activity.addUserChunk(silence(20), 0.9);
    activity.addUserChunk(silence(20), 0.9);

    expect(phases).toEqual([ConversationVoicePhase.UserSpeaking]);

    now = 10_000;
    activity.resetUser();
    expect(phases).toEqual([
      ConversationVoicePhase.UserSpeaking,
      ConversationVoicePhase.Quiet,
    ]);
    activity.dispose();
  });

  it('stops notifying after unsubscribe', () => {
    const activity = new ConversationVoiceActivity(() => 0);
    const phases: ConversationVoicePhase[] = [];
    const unsubscribe = activity.subscribePhase(phase => phases.push(phase));
    unsubscribe();

    activity.addUserChunk(silence(20), 0.9);

    expect(phases).toEqual([]);
    expect(activity.phase).toBe(ConversationVoicePhase.UserSpeaking);
    activity.dispose();
  });
});
