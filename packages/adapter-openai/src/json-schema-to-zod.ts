interface JsonSchemaLike {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, JsonSchemaLike>>;
  readonly required?: readonly string[];
  readonly description?: string;
  readonly enum?: readonly unknown[];
  readonly items?: JsonSchemaLike;
}

function isJsonSchemaLike(value: unknown): value is JsonSchemaLike {
  return typeof value === 'object' && value !== null;
}

function primitiveExpression(schema: JsonSchemaLike): string {
  if (schema.enum && schema.enum.length > 0) {
    return `z.enum([${schema.enum.map((value) => JSON.stringify(value)).join(', ')}])`;
  }
  switch (schema.type) {
    case 'string':
      return 'z.string()';
    case 'number':
    case 'integer':
      return 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    case 'array':
      return `z.array(${schema.items ? expressionFor(schema.items) : 'z.unknown()'})`;
    case 'object':
      return objectExpression(schema);
    default:
      return 'z.unknown()';
  }
}

function expressionFor(schema: JsonSchemaLike): string {
  const expression = primitiveExpression(schema);
  return schema.description ? `${expression}.describe(${JSON.stringify(schema.description)})` : expression;
}

function objectExpression(schema: JsonSchemaLike): string {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const fieldNames = Object.keys(properties);
  if (fieldNames.length === 0) {
    return 'z.object({})';
  }
  const fields = fieldNames.map((key) => {
    const propertySchema = properties[key] as JsonSchemaLike;
    const expression = expressionFor(propertySchema);
    const optional = required.has(key) ? '' : '.optional()';
    return `    ${JSON.stringify(key)}: ${expression}${optional},`;
  });
  return `z.object({\n${fields.join('\n')}\n  })`;
}

/**
 * Best-effort conversion of an Agentform tool's `inputSchema`/`outputSchema`
 * (`@agentform/schema`'s `z.record(z.string(), z.unknown())` — a loose,
 * JSON-Schema-*shaped* object, not validated as real JSON Schema) into Zod
 * source code text for the generated tool file. Covers the common shapes
 * (`type`, `properties`, `required`, `enum`, `description`, one level of
 * `array`/`object` nesting) and falls back to `z.record(z.string(),
 * z.unknown())` for anything it doesn't recognize, rather than guessing —
 * an honestly-loose schema is safer than a wrong one for a tool the
 * generated agent will actually call.
 */
export function jsonSchemaToZodExpression(schema: unknown): string {
  if (!isJsonSchemaLike(schema) || Object.keys(schema).length === 0) {
    return 'z.record(z.string(), z.unknown())';
  }
  if (schema.type && schema.type !== 'object') {
    return expressionFor(schema);
  }
  return objectExpression(schema);
}
