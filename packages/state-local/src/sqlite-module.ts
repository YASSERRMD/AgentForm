type SqliteModule = typeof import('node:sqlite');

/**
 * `node:sqlite` is still Node's own `ExperimentalWarning`-flagged module as
 * of the Node versions this package targets — importing it unconditionally
 * prints that warning to stderr on every single `agentform` invocation
 * that touches state, which reads as alarming/unprofessional for a CLI
 * tool with no way for an end user to pass `--no-warnings` themselves.
 * This surgically silences *only* that one warning (by name and message
 * content) for the duration of the import, restoring `process.emitWarning`
 * immediately after — every other warning still prints normally. See the
 * ADR for the fuller tradeoff writeup (why `node:sqlite` over a native
 * dependency like `better-sqlite3` at all).
 *
 * `process.getBuiltinModule` (not a static `import`) is what makes this
 * synchronous — the state backend's whole call chain stays synchronous
 * under the hood, matching `node:sqlite`'s own `DatabaseSync` API.
 */
export function loadSqliteModule(): SqliteModule {
  const originalEmitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const type = typeof args[0] === 'string' ? args[0] : (args[0] as { type?: string })?.type;
    if (type === 'ExperimentalWarning' && String(warning).includes('SQLite')) {
      return;
    }
    return (originalEmitWarning as (...a: unknown[]) => void)(warning, ...args);
  }) as typeof process.emitWarning;

  try {
    return process.getBuiltinModule('node:sqlite') as SqliteModule;
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}
