import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateJsonSchema } from '../dist/index.js';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputPath = path.resolve(
  packageRoot,
  '../../specifications/v1alpha1/agentic-application.schema.json',
);

const schema = generateJsonSchema();

// z.toJSONSchema() walks a fixed Zod schema graph whose object shapes have
// a fixed literal key order, so plain JSON.stringify is already
// deterministic across repeated generations (verified by
// json-schema.test.ts) — no key-sorting replacer needed, and a `replacer`
// *array* would (incorrectly) act as a recursive key allowlist rather than
// a top-level sort, corrupting nested schema content.
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf-8');

console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
