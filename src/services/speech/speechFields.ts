import { mossTtsRealtime, voxcpm2 } from '../../models/catalog';
import { ModelDefinition, ModelFieldDefinition, firstPassFields, modelSlug } from '../../models/modelDefinition';

export const SpeechFields = {
  models: [mossTtsRealtime, voxcpm2] as readonly ModelDefinition[],

  promptFieldId(model: ModelDefinition): string {
    return modelSlug(model) === modelSlug(mossTtsRealtime) ? 'text' : 'prompt';
  },

  settingsFields(model: ModelDefinition): readonly ModelFieldDefinition[] {
    const promptId = SpeechFields.promptFieldId(model);
    return firstPassFields(model).filter(field => field.id !== promptId);
  },
};
