import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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
  },
});
