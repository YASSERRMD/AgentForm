/**
 * Node-only entry point for `@agentform/studio-core` — currently just
 * `buildSpecDocument`, which needs `@agentform/ir`'s full barrel (and so
 * transitively `node:crypto`). Kept out of the main `index.ts` barrel so
 * `apps/studio-web` can safely import everything else this package
 * exports without pulling a Node-only dependency into the browser
 * bundle. Only `apps/studio-server` should import from here.
 */
export { buildSpecDocument, type BuildSpecDocumentOptions } from './spec-document.js';
