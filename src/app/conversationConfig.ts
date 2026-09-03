import { gptRealtimeMini } from '../models/catalog';
import { ModelDefinition } from '../models/modelDefinition';
import { ModelParameterValues } from '../models/modelParameterValues';

/**
 * The conversation, in one place.
 *
 * This is the file to edit to turn the example into a product.
 * Everything else — the transport, the audio pipeline, the screen —
 * stays as it is.
 *
 * The values here win over the catalog's own defaults, which
 * describe the model rather than this app's use of it.
 */
export const ConversationConfig = {
  /**
   * Who the assistant is and how it should behave.
   *
   * The two sentences about language are worth keeping whatever
   * else is written here: they let a speaker switch languages
   * mid-conversation and stop the model from inventing words out of
   * background noise.
   */
  PERSONA:
    'Respond in the language of the latest clear spoken utterance. ' +
    'Allow intentional language changes. Ignore non-speech or ' +
    'unclear audio instead of inferring words.',

  /** Which voice answers. The full list lives in the catalog. */
  VOICE: 'marin',

  model: gptRealtimeMini as ModelDefinition,

  /**
   * Engineering overrides. Keys are catalog field ids. Persona and
   * voice have their own fields and win over entries here.
   */
  parameters: {} as Readonly<Record<string, string>>,

  /**
   * How long a conversation is held after the speaker leaves, in
   * milliseconds.
   *
   * Zero — leave the screen and the conversation is over — because
   * Wiro bills a realtime task by how long it stays up.
   */
  suspendGracePeriodMs: 0,
};

/**
 * Catalog defaults, then `overrides`, then persona and voice.
 *
 * The named fields spread last: a stray duplicate in `overrides`
 * cannot silently contradict `persona` or `voice`.
 */
export function conversationParameterValues(options: {
  readonly model?: ModelDefinition;
  readonly persona?: string;
  readonly voice?: string;
  readonly overrides?: Readonly<Record<string, string>>;
} = {}): ModelParameterValues {
  const model = options.model ?? ConversationConfig.model;
  const persona = options.persona ?? ConversationConfig.PERSONA;
  const voice = options.voice ?? ConversationConfig.VOICE;
  const overrides = options.overrides ?? ConversationConfig.parameters;
  const merged: Record<string, string> = {
    ...overrides,
    system_instructions: persona,
    voice,
  };
  return ModelParameterValues.create({
    fields: model.fields,
    overrides: merged,
  });
}
