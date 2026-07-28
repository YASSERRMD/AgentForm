import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every apps/cli/src/commands/*.test.ts file spawns the real built CLI
    // via runCli (test-fixture-project.ts), a genuine execFileSync
    // subprocess doing real file I/O and, for apply/rollback/destroy, real
    // SQLite state writes — comfortably under 5s locally, but a shared CI
    // runner with a live Postgres sidecar plus turbo's and vitest's own
    // stacked, unthrottled concurrency has occasionally pushed a real
    // multi-invocation test past vitest's bare 5000ms default (observed:
    // apply.test.ts's end-to-end test, PR #20).
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
