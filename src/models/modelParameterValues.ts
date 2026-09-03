import { ModelFieldDefinition, ModelFieldKind } from './modelDefinition';

export type ModelRequestValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'decimal'; readonly value: number };

export interface ModelParameterValuesOptions {
  readonly fields: readonly ModelFieldDefinition[];
  readonly overrides?: Readonly<Record<string, string>>;
}

/**
 * Catalog defaults plus the ids an application chooses to replace.
 *
 * Overrides replace the catalog defaults for the ids they name. Ids
 * the model does not expose are ignored.
 */
export class ModelParameterValues {
  private constructor(
    private readonly definitions: ReadonlyMap<string, ModelFieldDefinition>,
    private readonly values: ReadonlyMap<string, string>,
  ) {}

  static create(options: ModelParameterValuesOptions): ModelParameterValues {
    const firstPass = options.fields.filter(field => field.includeInFirstPass);
    const overrides = options.overrides ?? {};
    const definitions = new Map(firstPass.map(field => [field.id, field]));
    const values = new Map(
      firstPass.map(field => [
        field.id,
        overrides[field.id] ?? field.defaultValue ?? '',
      ]),
    );
    return new ModelParameterValues(definitions, values);
  }

  value(id: string): string | undefined {
    return this.values.get(id);
  }

  withValue(id: string, value: string): ModelParameterValues {
    if (!this.values.has(id)) {
      return this;
    }
    const next = new Map(this.values);
    next.set(id, value);
    return new ModelParameterValues(this.definitions, next);
  }

  snapshot(): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    this.values.forEach((value, id) => {
      if (value.trim().length > 0) {
        result[id] = value;
      }
    });
    return result;
  }

  requestSnapshot(): Readonly<Record<string, ModelRequestValue>> {
    const result: Record<string, ModelRequestValue> = {};
    Object.entries(this.snapshot()).forEach(([id, value]) => {
      const definition = this.definitions.get(id);
      if (!definition) {
        return;
      }
      result[id] = requestValue(definition, value);
    });
    return result;
  }

  requestBody(): Readonly<Record<string, string | number>> {
    const result: Record<string, string | number> = {};
    Object.entries(this.requestSnapshot()).forEach(([id, value]) => {
      result[id] = value.value;
    });
    return result;
  }
}

function requestValue(
  definition: ModelFieldDefinition,
  value: string,
): ModelRequestValue {
  switch (definition.kind) {
    case ModelFieldKind.Number: {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed)
        ? { kind: 'text', value }
        : { kind: 'integer', value: parsed };
    }
    case ModelFieldKind.Float: {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed)
        ? { kind: 'text', value }
        : { kind: 'decimal', value: parsed };
    }
    case ModelFieldKind.Text:
    case ModelFieldKind.Textarea:
    case ModelFieldKind.Select:
    default:
      return { kind: 'text', value };
  }
}
