export enum RealtimeDirection {
  SpeechToSpeech = 'SpeechToSpeech',
  SpeechToText = 'SpeechToText',
  TextToSpeech = 'TextToSpeech',
}

export enum ModelFieldKind {
  Text = 'Text',
  Textarea = 'Textarea',
  Select = 'Select',
  Number = 'Number',
  Float = 'Float',
}

export interface ModelFieldOption {
  readonly value: string;
}

export interface ModelFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: ModelFieldKind;
  readonly isRequired: boolean;
  readonly includeInFirstPass: boolean;
  readonly options?: readonly ModelFieldOption[];
  readonly defaultValue?: string;
}

export interface ModelDefinition {
  readonly owner: string;
  readonly slug: string;
  readonly displayName: string;
  readonly direction: RealtimeDirection;
  readonly fields: readonly ModelFieldDefinition[];
}

export function modelSlug(model: ModelDefinition): string {
  return `${model.owner}/${model.slug}`;
}

export function firstPassFields(
  model: ModelDefinition,
): readonly ModelFieldDefinition[] {
  return model.fields.filter(field => field.includeInFirstPass);
}
