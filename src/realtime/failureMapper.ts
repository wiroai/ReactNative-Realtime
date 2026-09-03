import { AudioFailure } from '../audio/audioFailure';
import { WiroFailure } from '../networking/failure';

/**
 * Translates session errors into a user-facing message and a
 * stable machine-readable code.
 *
 * Errors outside the project's failure types collapse to
 * `fallbackMessage` and the `unknown` code, so raw exception text
 * never reaches the UI or the protocol log.
 */
export class RealtimeFailureMapper {
  static readonly UNKNOWN_CODE = 'unknown';

  constructor(private readonly fallbackMessage: string) {}

  message(error: unknown): string {
    if (error instanceof WiroFailure || error instanceof AudioFailure) {
      return error.message;
    }
    return this.fallbackMessage;
  }

  code(error: unknown): string {
    if (error instanceof WiroFailure || error instanceof AudioFailure) {
      return wireName(error.code);
    }
    return RealtimeFailureMapper.UNKNOWN_CODE;
  }
}

function wireName(code: string): string {
  return code.length === 0 ? code : code[0].toLowerCase() + code.slice(1);
}
