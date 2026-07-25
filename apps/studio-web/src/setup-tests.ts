import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Explicit rather than relying on @testing-library/react's auto-cleanup
// detection, since this config doesn't set Vitest's `globals: true`.
afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver; @xyflow/react (the workflow canvas) measures
// its container with one on mount, so tests that render it need this stub.
// A real no-op is sufficient — none of Studio's tests assert on measured
// pixel layout, only on which nodes/edges/controls are present.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;
