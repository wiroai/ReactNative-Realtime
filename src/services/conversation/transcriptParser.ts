import { WiroRealtimeProtocol } from '../../realtime/protocol';

export type ConversationTranscript =
  | { readonly speaker: 'user'; readonly text: string }
  | { readonly speaker: 'ai'; readonly text: string };

/**
 * Recognises the speaker prefixes the conversation model puts on
 * its transcript output. Both speakers share one output channel.
 */
export class ConversationTranscriptParser {
  parse(message: string): ConversationTranscript | null {
    const userPrefix = WiroRealtimeProtocol.TRANSCRIPT_USER_PREFIX;
    if (message.startsWith(userPrefix)) {
      return { speaker: 'user', text: message.slice(userPrefix.length) };
    }
    const aiPrefix = WiroRealtimeProtocol.TRANSCRIPT_AI_PREFIX;
    if (message.startsWith(aiPrefix)) {
      return { speaker: 'ai', text: message.slice(aiPrefix.length) };
    }
    return null;
  }
}
