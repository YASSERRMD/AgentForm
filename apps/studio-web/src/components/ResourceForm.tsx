import { useState } from 'react';

export interface ResourceFormProps {
  readonly jsonSchema: Record<string, unknown>;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** A field the schema declares but this renderer can't render faithfully — a free-form record (no fixed `properties`), an array of objects, or anything without a plain `type`. Falls back to raw JSON rather than silently dropping or guessing at the field's shape. */
function JsonField({
  value,
  onChange,
}: {
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <div>
      <textarea
        rows={4}
        value={text}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          try {
            onChange(JSON.parse(nextText) as unknown);
            setError(undefined);
          } catch {
            setError('Not valid JSON yet.');
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

interface FieldProps {
  readonly label: string;
  readonly schema: Record<string, unknown>;
  readonly required: boolean;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}

function Field({ label, schema, required, value, onChange }: FieldProps) {
  const enumValues = schema.enum;
  const type = schema.type;

  const control = (() => {
    if (isStringArray(enumValues)) {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          {enumValues.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    if (type === 'string') {
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    if (type === 'number' || type === 'integer') {
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    }
    if (type === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    }
    if (
      type === 'array' &&
      isRecord(schema.items) &&
      schema.items.type === 'string' &&
      !isRecord(schema.items.enum)
    ) {
      const arrayValue = isStringArray(value) ? value : [];
      return (
        <input
          type="text"
          value={arrayValue.join(', ')}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0),
            )
          }
        />
      );
    }
    if (type === 'object' && isRecord(schema.properties)) {
      return (
        <ResourceForm
          jsonSchema={schema}
          value={isRecord(value) ? value : {}}
          onChange={onChange}
        />
      );
    }
    return <JsonField value={value} onChange={onChange} />;
  })();

  return (
    <label>
      <span>
        {label}
        {required && ' *'}
      </span>
      {control}
    </label>
  );
}

function propertiesOf(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return isRecord(schema.properties)
    ? (schema.properties as Record<string, Record<string, unknown>>)
    : {};
}

function requiredOf(schema: Record<string, unknown>): ReadonlySet<string> {
  return new Set(isStringArray(schema.required) ? schema.required : []);
}

/**
 * Renders form fields directly from a real JSON Schema — string/enum/
 * number/boolean/string-array/nested-object are rendered as real
 * inputs; anything else (a free-form record, an array of objects, a
 * top-level `oneOf`) falls back to a raw JSON field rather than
 * guessing at a shape this renderer doesn't actually understand.
 * `tools`' real `z.discriminatedUnion('type', [...])` is exactly that
 * "anything else" case at the top level — its own picker lives in
 * ResourceEditor, which selects a variant's schema *before* handing it
 * to this component, so ResourceForm itself only ever needs to render
 * one concrete object shape at a time.
 */
export function ResourceForm({ jsonSchema, value, onChange }: ResourceFormProps) {
  const properties = propertiesOf(jsonSchema);
  const required = requiredOf(jsonSchema);
  const record = isRecord(value) ? value : {};

  return (
    <fieldset>
      {Object.entries(properties).map(([key, propertySchema]) => (
        <Field
          key={key}
          label={key}
          schema={propertySchema}
          required={required.has(key)}
          value={record[key]}
          onChange={(fieldValue) => onChange({ ...record, [key]: fieldValue })}
        />
      ))}
    </fieldset>
  );
}
