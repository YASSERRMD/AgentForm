import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Explicit rather than relying on @testing-library/react's auto-cleanup
// detection, since this config doesn't set Vitest's `globals: true`.
afterEach(() => {
  cleanup();
});
