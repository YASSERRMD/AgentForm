import { resolvePathWithinRoot } from '@agentform/core';
import type { FileSystem } from '@agentform/parser';
import { parse as parseYaml } from 'yaml';
import { testCaseSchema, type TestCase } from './test-case.js';

export class DatasetLoadError extends Error {}

function parseDatasetFile(datasetPath: string, content: string): readonly unknown[] {
  if (datasetPath.endsWith('.jsonl')) {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new DatasetLoadError(
            `${datasetPath}:${index + 1}: invalid JSON line — ${(error as Error).message}`,
          );
        }
      });
  }

  let parsed: unknown;
  try {
    parsed = datasetPath.endsWith('.json') ? JSON.parse(content) : parseYaml(content);
  } catch (error) {
    throw new DatasetLoadError(`${datasetPath}: failed to parse — ${(error as Error).message}`);
  }
  if (Array.isArray(parsed)) return parsed;
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { tests?: unknown }).tests)
  ) {
    return (parsed as { tests: unknown[] }).tests;
  }
  throw new DatasetLoadError(
    `${datasetPath}: expected either a top-level array of test cases or an object with a "tests" array`,
  );
}

/**
 * Loads and validates every test case in one dataset file. Supports
 * `.jsonl` (§17's own example, `tests/complaints.jsonl` — one JSON test
 * case per line), plus `.json`/`.yaml`/`.yml` (either a bare array of test
 * cases, or an object with a top-level `tests:` array — matching §17's
 * own inline `tests:` YAML block shape when a dataset is authored as a
 * single structured document instead of one-record-per-line).
 */
export function loadDatasetFile(
  fs: FileSystem,
  rootDir: string,
  datasetPath: string,
): readonly TestCase[] {
  const absolutePath = resolvePathWithinRoot(rootDir, datasetPath);
  if (!fs.exists(absolutePath)) {
    throw new DatasetLoadError(`Dataset file "${datasetPath}" does not exist.`);
  }
  const content = fs.readFile(absolutePath);
  const rawCases = parseDatasetFile(datasetPath, content);

  return rawCases.map((raw, index) => {
    const result = testCaseSchema.safeParse(raw);
    if (!result.success) {
      throw new DatasetLoadError(
        `${datasetPath}[${index}]: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
      );
    }
    return result.data;
  });
}

/** Loads every dataset a spec's `evaluations.datasets` declares, in order, flattened into one list of test cases. */
export function loadDatasets(
  fs: FileSystem,
  rootDir: string,
  datasetPaths: readonly string[],
): readonly TestCase[] {
  return datasetPaths.flatMap((datasetPath) => loadDatasetFile(fs, rootDir, datasetPath));
}
