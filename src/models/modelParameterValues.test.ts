import { ModelFieldDefinition, ModelFieldKind } from './modelDefinition';
import { ModelParameterValues } from './modelParameterValues';

const fields: ModelFieldDefinition[] = [
  {
    id: 'voice',
    label: 'Voice',
    kind: ModelFieldKind.Select,
    isRequired: true,
    includeInFirstPass: true,
    defaultValue: 'marin',
  },
  {
    id: 'turns',
    label: 'Turns',
    kind: ModelFieldKind.Number,
    isRequired: false,
    includeInFirstPass: true,
    defaultValue: '3',
  },
  {
    id: 'threshold',
    label: 'Threshold',
    kind: ModelFieldKind.Float,
    isRequired: false,
    includeInFirstPass: true,
    defaultValue: '0.75',
  },
  {
    id: 'excluded',
    label: 'Excluded',
    kind: ModelFieldKind.Text,
    isRequired: false,
    includeInFirstPass: false,
  },
];

describe('ModelParameterValues', () => {
  it('falls back to catalog defaults for fields without an override', () => {
    const values = ModelParameterValues.create({ fields });

    expect(values.value('voice')).toBe('marin');
    expect(values.value('turns')).toBe('3');
  });

  it('lets overrides replace a default', () => {
    const values = ModelParameterValues.create({
      fields,
      overrides: { voice: 'cedar' },
    });

    expect(values.value('voice')).toBe('cedar');
  });

  it('ignores an id the model does not expose', () => {
    const values = ModelParameterValues.create({ fields });

    expect(values.withValue('unknown', 'x')).toBe(values);
  });

  it('excludes a field outside the first pass entirely', () => {
    const values = ModelParameterValues.create({ fields });

    expect(values.value('excluded')).toBeUndefined();
    expect(values.snapshot()).not.toHaveProperty('excluded');
  });

  it('withValue returns a new instance without mutating the original', () => {
    const values = ModelParameterValues.create({ fields });

    const changed = values.withValue('voice', 'cedar');

    expect(values.value('voice')).toBe('marin');
    expect(changed.value('voice')).toBe('cedar');
  });

  it('omits blank values from the snapshot', () => {
    const values = ModelParameterValues.create({ fields }).withValue(
      'voice',
      '   ',
    );

    expect(values.snapshot()).not.toHaveProperty('voice');
  });

  it('coerces Number and Float fields for the request body', () => {
    const values = ModelParameterValues.create({ fields });

    const body = values.requestBody();

    expect(body.turns).toBe(3);
    expect(body.threshold).toBe(0.75);
    expect(body.voice).toBe('marin');
  });

  it('keeps an unparsable numeric override as text', () => {
    const values = ModelParameterValues.create({
      fields,
      overrides: { turns: 'many' },
    });

    expect(values.requestBody().turns).toBe('many');
  });
});
