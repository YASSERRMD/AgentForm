/**
 * Browser-safe barrel. Deliberately excludes `./server.js` (and anything
 * that transitively imports `@agentform/ir`'s main barrel, which pulls in
 * `node:crypto`) — see the doc comment on `server.ts` and ADR-0019. This
 * split is made proactively, not retrofitted after a crash, applying the
 * lesson ADR-0018 recorded during Phase 15.
 */
export type {
  CanvasPosition,
  ChangeProvenance,
  ChangeSource,
  ChatDesignRequest,
  ChatDesignResponse,
  ChatHistoryMessage,
  DesignArtifact,
  DesignDraft,
  DesignResourceType,
  FormLayout,
  GetDesignResponse,
  LayoutNode,
  LayoutNodeType,
  LayoutWidget,
  PromptToDesignRequest,
  PromptToDesignResponse,
  PutDesignRequest,
  PutDesignResponse,
  ResourceBinding,
  StyleTokens,
} from './types.js';
export { CURRENT_DESIGN_VERSION } from './types.js';

export { DESIGN_DIAGNOSTIC_CODES } from './codes.js';

export { validateDesignArtifact } from './validate.js';

export { renderDesignToHtml } from './render-html.js';

export {
  canvasPositionSchema,
  changeProvenanceSchema,
  chatDesignRequestSchema,
  chatDesignResponseSchema,
  designArtifactSchema,
  designDraftSchema,
  formLayoutSchema,
  getDesignResponseSchema,
  layoutNodeSchema,
  promptToDesignRequestSchema,
  promptToDesignResponseSchema,
  putDesignRequestSchema,
  putDesignResponseSchema,
  resourceBindingSchema,
  styleTokensSchema,
} from './http-contracts.js';
