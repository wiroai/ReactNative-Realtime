import { AudioFailure } from '../audio/audioFailure';
import { WiroFailure } from '../networking/failure';
import { RealtimeFailureMapper } from './failureMapper';

describe('RealtimeFailureMapper', () => {
  const mapper = new RealtimeFailureMapper('fallback message');

  it('surfaces a WiroFailure message and wire code', () => {
    expect(mapper.message(WiroFailure.SessionBusy)).toBe(
      WiroFailure.SessionBusy.message,
    );
    expect(mapper.code(WiroFailure.SessionBusy)).toBe('sessionBusy');
  });

  it('surfaces an AudioFailure message and wire code', () => {
    expect(mapper.message(AudioFailure.Capture)).toBe(
      AudioFailure.Capture.message,
    );
    expect(mapper.code(AudioFailure.Capture)).toBe('captureUnavailable');
  });

  it('falls back for an unrecognized error, never leaking its text', () => {
    const raw = new Error('raw platform detail');

    expect(mapper.message(raw)).toBe('fallback message');
    expect(mapper.code(raw)).toBe(RealtimeFailureMapper.UNKNOWN_CODE);
  });
});
