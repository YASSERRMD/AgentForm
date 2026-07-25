import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // Browser code only ever fetches relative /api/... paths in dev — no
    // CORS involved in the primary dev loop at all. studio-server's own
    // CORS allowlist is defense-in-depth for the separately-served-build
    // case, not something this proxy depends on.
    proxy: {
      '/api': 'http://localhost:4310',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setup-tests.ts'],
    // Vitest's own default exclude is only node_modules/.git (verified
    // against the installed package — it does NOT cover build output).
    // studio-web is the one package whose typecheck (`tsc -b`, a real
    // composite-project build) emits every src file, tests included,
    // into dist/ — without this, vitest discovers and runs each test
    // twice (src/*.test.tsx and the compiled dist/*.test.js), and can
    // outright fail if an incremental build ever leaves dist/ with a
    // compiled test whose sibling module wasn't re-emitted.
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
