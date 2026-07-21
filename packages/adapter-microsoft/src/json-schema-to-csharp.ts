import { toCamelCase } from './csharp-identifiers.js';

interface JsonSchemaLike {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, JsonSchemaLike>>;
  readonly required?: readonly string[];
}

function isJsonSchemaLike(value: unknown): value is JsonSchemaLike {
  return typeof value === 'object' && value !== null;
}

function csharpTypeHint(schema: JsonSchemaLike): string {
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    case 'array':
      return 'List<object>';
    case 'object':
      return 'Dictionary<string, object>';
    default:
      return 'object';
  }
}

/**
 * Best-effort conversion of an Agentform tool's `inputSchema` into a C#
 * method parameter list, e.g. `'string query, int? limit = null'` —
 * the C# analog of `@agentform/compiler`'s `jsonSchemaToPythonParams`, kept
 * local to this package since Microsoft Agent Framework is the only
 * C#-targeting adapter (§4's other five targets are all TypeScript or
 * Python). Required properties come first (C# forbids a non-default
 * parameter after a defaulted one); optional properties get a nullable
 * type with a `= null` default — verified this compiles for both reference
 * and value types alike (`string? x = null`, `int? x = null`). An empty or
 * unrecognized schema falls back to no parameters at all — `AIFunctionFactory.Create`
 * has no need for a catch-all parameter the way Python's `**kwargs` fills
 * that role, since a C# delegate's signature is fixed either way.
 */
export function jsonSchemaToCSharpParams(schema: unknown): string {
  if (
    !isJsonSchemaLike(schema) ||
    !schema.properties ||
    Object.keys(schema.properties).length === 0
  ) {
    return '';
  }
  const required = new Set(schema.required ?? []);
  const propertyNames = Object.keys(schema.properties);
  const requiredParams = propertyNames.filter((name) => required.has(name));
  const optionalParams = propertyNames.filter((name) => !required.has(name));

  const properties = schema.properties;
  const renderRequired = (name: string): string =>
    `${csharpTypeHint(properties[name] as JsonSchemaLike)} ${toCamelCase(name)}`;
  const renderOptional = (name: string): string =>
    `${csharpTypeHint(properties[name] as JsonSchemaLike)}? ${toCamelCase(name)} = null`;

  return [...requiredParams.map(renderRequired), ...optionalParams.map(renderOptional)].join(', ');
}
