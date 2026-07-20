import { z } from 'zod';

/**
 * Resource map keys (model/tool/agent/workflow/node names, policy IDs, ...).
 * Must start with a letter and contain only letters, digits, `_`, and `-`
 * so identifiers are safe to use as file names, environment variable
 * fragments, and generated-code symbol fragments later in the pipeline.
 */
export const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    'must start with a letter and contain only letters, digits, "_", or "-"',
  );

export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/, 'must be a semantic version');

/** A relative duration such as "30s", "5m", "24h", "1d". */
export const durationSchema = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, 'must be a duration like "30s", "5m", "24h", or "1d"');

export const dataClassificationSchema = z.enum([
  'public',
  'internal',
  'confidential',
  'restricted',
]);

export const sideEffectSchema = z.enum(['read', 'write', 'destructive']);

/**
 * A non-empty array with no duplicate entries, used for reference lists
 * (e.g. an agent's `tools`) where repeating an entry is always a mistake
 * rather than a meaningful configuration.
 */
export function uniqueArray<Item extends z.ZodTypeAny>(
  item: Item,
  keyOf: (value: z.infer<Item>) => string,
) {
  return z.array(item).superRefine((values, ctx) => {
    const seen = new Map<string, number>();
    values.forEach((value, index) => {
      const key = keyOf(value);
      const firstIndex = seen.get(key);
      if (firstIndex !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate entry "${key}" (first seen at index ${firstIndex})`,
          path: [index],
        });
        return;
      }
      seen.set(key, index);
    });
  });
}

/** `${env.NAME}`, `${var.name}`, `${local.name}`, or a plain literal string. */
export const interpolatableStringSchema = z.string().min(1);
