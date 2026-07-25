export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reads a `oneOf` variant's real discriminator literal (its `properties.type.const`) — used to pick which concrete schema a discriminated union's value actually matches. */
export function discriminatorConst(variantSchema: unknown): string | undefined {
  if (!isRecord(variantSchema) || !isRecord(variantSchema.properties)) {
    return undefined;
  }
  const discriminator = variantSchema.properties.type;
  return isRecord(discriminator) && typeof discriminator.const === 'string'
    ? discriminator.const
    : undefined;
}
