import { toIdentifier } from '@agentform/compiler';

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

/** JSON's `true`/`false`/`null` aren't valid Python literals — everything else (strings, numbers) is. */
function pythonLiteral(value: unknown): string {
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (value === null) return 'None';
  return JSON.stringify(value);
}

function pythonTypeHint(schema: JsonSchemaLike): string {
  if (schema.enum && schema.enum.length > 0) {
    return `Literal[${schema.enum.map((value) => pythonLiteral(value)).join(', ')}]`;
  }
  switch (schema.type) {
    case 'string':
      return 'str';
    case 'integer':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    case 'array':
      return `list[${schema.items ? pythonTypeHint(schema.items) : 'Any'}]`;
    case 'object':
      return 'dict[str, Any]';
    default:
      return 'Any';
  }
}

/**
 * Best-effort conversion of an Agentform tool's `inputSchema` (a loose,
 * JSON-Schema-*shaped* object — see `@agentform/adapter-openai`'s
 * `json-schema-to-zod.ts` for the equivalent Zod conversion this mirrors)
 * into a Python function parameter list, e.g. `'query: str, limit:
 * Optional[int] = None'`. Required properties come first (Python forbids a
 * non-default parameter after a defaulted one); optional properties get an
 * `Optional[...] = None` default. An empty or unrecognized schema falls
 * back to `**kwargs: Any` — still a syntactically valid, callable
 * signature, just one with no declared parameters to infer a schema from.
 */
export function jsonSchemaToPythonParams(schema: unknown): string {
  if (!isJsonSchemaLike(schema) || !schema.properties || Object.keys(schema.properties).length === 0) {
    return '**kwargs: Any';
  }
  const required = new Set(schema.required ?? []);
  const propertyNames = Object.keys(schema.properties);
  const requiredParams = propertyNames.filter((name) => required.has(name));
  const optionalParams = propertyNames.filter((name) => !required.has(name));

  const properties = schema.properties;
  const renderRequired = (name: string): string =>
    `${toIdentifier(name)}: ${pythonTypeHint(properties[name] as JsonSchemaLike)}`;
  const renderOptional = (name: string): string =>
    `${toIdentifier(name)}: Optional[${pythonTypeHint(properties[name] as JsonSchemaLike)}] = None`;

  return [...requiredParams.map(renderRequired), ...optionalParams.map(renderOptional)].join(', ');
}
