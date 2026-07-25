import type { Diagnostic } from '@agentform/diagnostics';

/**
 * A design artifact is presentational metadata about one spec resource —
 * form field order/grouping/widget choice for an agent's input/output
 * schema, or canvas node positions for a workflow. It never carries
 * anything that could change control flow, permissions, or policy: no
 * tool wiring, no edge conditions, no model config. See ADR-0019.
 */
export type DesignResourceType = 'agents' | 'workflows';

export interface ResourceBinding {
  readonly resourceType: DesignResourceType;
  readonly resourceId: string;
}

export type LayoutNodeType = 'container' | 'field';

export type LayoutWidget = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';

export interface LayoutNode {
  readonly id: string;
  readonly type: LayoutNodeType;
  readonly label?: string;
  /** Set when type === 'field': the top-level property key this node represents within the bound agent's inputSchema/outputSchema. */
  readonly fieldPath?: string;
  readonly widget?: LayoutWidget;
  readonly children?: readonly LayoutNode[];
}

export interface FormLayout {
  readonly input?: readonly LayoutNode[];
  readonly output?: readonly LayoutNode[];
}

export interface CanvasPosition {
  readonly x: number;
  readonly y: number;
}

export interface StyleTokens {
  readonly spacing?: Record<string, string>;
  readonly color?: Record<string, string>;
  readonly typography?: Record<string, string>;
}

export interface DesignArtifact {
  readonly binding: ResourceBinding;
  readonly designVersion: string;
  /** Content hash (see @agentform/ir's computeContentHash format) of the AgenticApplication this design was authored against. */
  readonly specVersionTarget: string;
  /** Content hash of this artifact's own fields (every field below this one). */
  readonly contentHash: string;
  /** Present when binding.resourceType === 'agents'. */
  readonly layout?: FormLayout;
  /** Present when binding.resourceType === 'workflows': node id -> canvas position. */
  readonly positions?: Record<string, CanvasPosition>;
  readonly styleTokens?: StyleTokens;
}

export const CURRENT_DESIGN_VERSION = '1';

/** What a client submits: everything except the fields only the server can compute (designVersion, specVersionTarget, contentHash). */
export type DesignDraft = Pick<DesignArtifact, 'binding' | 'layout' | 'positions' | 'styleTokens'>;

export interface GetDesignResponse {
  readonly design: DesignArtifact | null;
}

export interface PutDesignRequest {
  readonly design: DesignDraft;
}

export interface PutDesignResponse {
  readonly success: boolean;
  readonly design?: DesignArtifact;
  readonly diagnostics: readonly Diagnostic[];
}

/** Body of `POST /api/genai/prompt-to-design`. Scoped to a single agent's form layout — see ADR-0020 on why canvas positions aren't part of this. */
export interface PromptToDesignRequest {
  readonly agentId: string;
  readonly prompt: string;
}

/**
 * `success: false` means `design` (when present) isn't safe to accept as
 * a preview — `diagnostics` explains why. Accepting a proposal never
 * happens through this endpoint: the client re-submits `design` to the
 * real `PUT /api/design/:resourceType/:resourceId`, which re-stamps and
 * re-validates it itself rather than trusting this preview call.
 */
export interface PromptToDesignResponse {
  readonly success: boolean;
  readonly design?: DesignArtifact;
  readonly diagnostics: readonly Diagnostic[];
}
