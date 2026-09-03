import { ConversationTranscriptParser } from './transcriptParser';

describe('ConversationTranscriptParser', () => {
  const parser = new ConversationTranscriptParser();

  it('parses user and AI prefixes', () => {
    expect(parser.parse('TRANSCRIPT_USER:hello')).toEqual({
      speaker: 'user',
      text: 'hello',
    });
    expect(parser.parse('TRANSCRIPT_AI:hi there')).toEqual({
      speaker: 'ai',
      text: 'hi there',
    });
  });

  it('ignores unprefixed output', () => {
    expect(parser.parse('plain text')).toBeNull();
    expect(parser.parse('USER:no')).toBeNull();
  });
});
