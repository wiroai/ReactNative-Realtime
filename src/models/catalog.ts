import {
  ModelDefinition,
  ModelFieldKind,
  ModelFieldOption,
  RealtimeDirection,
} from './modelDefinition';

function options(...values: string[]): ModelFieldOption[] {
  return values.map(value => ({ value }));
}

/**
 * Model parameter table from Wiro MCP `get_model_schema` on
 * 2026-09-02.
 *
 * Field ids and options match the live schemas. Catalog defaults
 * that the schema omits are the values that keep the local PCM
 * pipeline aligned with the documented wire format, mirrored from
 * Kotlin-Realtime's working first pass.
 */

export const gptRealtimeMini: ModelDefinition = {
  owner: 'openai',
  slug: 'gpt-realtime-mini',
  displayName: 'GPT Realtime Mini',
  direction: RealtimeDirection.SpeechToSpeech,
  fields: [
    {
      id: 'voice',
      label: 'Voice',
      kind: ModelFieldKind.Select,
      isRequired: true,
      includeInFirstPass: true,
      options: options(
        'marin',
        'cedar',
        'alloy',
        'ash',
        'ballad',
        'coral',
        'echo',
        'fable',
        'nova',
        'onyx',
        'sage',
        'shimmer',
        'verse',
      ),
      defaultValue: 'marin',
    },
    // Persona lives in ConversationConfig. The schema requires the
    // field; it does not fix the text.
    {
      id: 'system_instructions',
      label: 'System instructions',
      kind: ModelFieldKind.Textarea,
      isRequired: true,
      includeInFirstPass: true,
    },
    {
      id: 'transcription_model',
      label: 'Transcription model',
      kind: ModelFieldKind.Select,
      isRequired: false,
      includeInFirstPass: true,
      options: options(
        'gpt-4o-mini-transcribe',
        'gpt-4o-transcribe',
        'whisper-1',
      ),
      defaultValue: 'gpt-4o-mini-transcribe',
    },
    {
      id: 'input_audio_format',
      label: 'Input audio format',
      kind: ModelFieldKind.Select,
      isRequired: false,
      includeInFirstPass: true,
      options: options('audio/pcm', 'audio/pcmu', 'audio/pcma'),
      defaultValue: 'audio/pcm',
    },
    {
      id: 'output_audio_format',
      label: 'Output audio format',
      kind: ModelFieldKind.Select,
      isRequired: false,
      includeInFirstPass: true,
      options: options('audio/pcm', 'audio/pcmu', 'audio/pcma'),
      defaultValue: 'audio/pcm',
    },
    {
      id: 'input_audio_rate',
      label: 'Input audio rate',
      kind: ModelFieldKind.Select,
      isRequired: false,
      includeInFirstPass: true,
      options: options('24000', '8000'),
      defaultValue: '24000',
    },
    {
      id: 'output_audio_rate',
      label: 'Output audio rate',
      kind: ModelFieldKind.Select,
      isRequired: false,
      includeInFirstPass: true,
      options: options('24000', '8000'),
      defaultValue: '24000',
    },
    {
      id: 'turn_detection_threshold',
      label: 'Turn detection threshold',
      kind: ModelFieldKind.Float,
      isRequired: false,
      includeInFirstPass: true,
      defaultValue: '0.75',
    },
    // Schema copy says 500 ms. 700 ms is the noise-resistant first
    // pass Swift already ships.
    {
      id: 'turn_detection_silence_ms',
      label: 'Silence duration (ms)',
      kind: ModelFieldKind.Number,
      isRequired: false,
      includeInFirstPass: true,
      defaultValue: '700',
    },
  ],
};

export const voxtralMiniRealtime: ModelDefinition = {
  owner: 'mistralai',
  slug: 'voxtral-mini-4b-realtime-2602',
  displayName: 'Voxtral Mini Realtime',
  direction: RealtimeDirection.SpeechToText,
  fields: [
    {
      id: 'transcriptionDelay',
      label: 'Transcription delay',
      kind: ModelFieldKind.Select,
      isRequired: false,
      includeInFirstPass: true,
      options: options('fastest', 'fast', 'balanced', 'accurate'),
      defaultValue: 'balanced',
    },
  ],
};

export const mossTtsRealtime: ModelDefinition = {
  owner: 'openmoss',
  slug: 'moss-tts-realtime',
  displayName: 'MOSS TTS Realtime',
  direction: RealtimeDirection.TextToSpeech,
  fields: [
    {
      id: 'text',
      label: 'Text',
      kind: ModelFieldKind.Textarea,
      isRequired: false,
      includeInFirstPass: true,
    },
    {
      id: 'inputAudio',
      label: 'Reference audio',
      kind: ModelFieldKind.Text,
      isRequired: false,
      includeInFirstPass: false,
    },
    {
      id: 'temperature',
      label: 'Temperature',
      kind: ModelFieldKind.Float,
      isRequired: false,
      includeInFirstPass: false,
    },
    {
      id: 'topP',
      label: 'Top P',
      kind: ModelFieldKind.Float,
      isRequired: false,
      includeInFirstPass: false,
    },
    {
      id: 'topK',
      label: 'Top K',
      kind: ModelFieldKind.Number,
      isRequired: false,
      includeInFirstPass: false,
    },
    {
      id: 'repetitionPenalty',
      label: 'Repetition penalty',
      kind: ModelFieldKind.Float,
      isRequired: false,
      includeInFirstPass: false,
    },
    {
      id: 'repetitionWindow',
      label: 'Repetition window',
      kind: ModelFieldKind.Number,
      isRequired: false,
      includeInFirstPass: false,
    },
    {
      id: 'maxLength',
      label: 'Max length',
      kind: ModelFieldKind.Number,
      isRequired: false,
      includeInFirstPass: false,
    },
  ],
};

export const wiroModelCatalog: readonly ModelDefinition[] = [
  gptRealtimeMini,
  voxtralMiniRealtime,
  mossTtsRealtime,
];
