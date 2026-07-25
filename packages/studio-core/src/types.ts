import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import type { SpecPatch } from './patch.js';

export type { AgenticApplication } from '@agentform/schema';
export type {
  Agent,
  Tool,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from '@agentform/schema';
export type { Diagnostic, DiagnosticSeverity, SourceLocation } from '@agentform/diagnostics';

/**
 * The one atomic snapshot `GET /api/spec` returns: the validated
 * specification, whenever validation succeeded, plus every diagnostic
 * collected along the way (parse, schema, or semantic). `application` is
 * absent whenever an error-severity diagnostic exists — Studio never
 * displays a spec that didn't actually pass validation.
 */
export interface SpecDocumentResponse {
  readonly application?: AgenticApplication;
  readonly diagnostics: readonly Diagnostic[];
}

export interface HealthResponse {
  readonly status: 'ok';
  readonly rootDir: string;
}

/** Where a change actually came from — a plain UI form/canvas edit, an accepted one-shot GenAI proposal (Phase 17), or an accepted multi-turn chat proposal (Phase 18). */
export type ChangeSource = 'manual' | 'genai' | 'chat';

/** Attached to a write request so the resulting audit-log entry (see `AuditEntry`) records where the change came from — optional, and defaults to `'manual'` server-side when omitted, so every pre-Phase-18 caller (a plain form Save) needs no change. */
export interface ChangeProvenance {
  readonly source: ChangeSource;
  /** A short human-readable description, e.g. a GenAI/chat proposal's own summary. Server derives a generic one from the patch itself when omitted. */
  readonly summary?: string;
}

/** Body of `POST /api/spec/patch` — a form/canvas/chat/GenAI edit, expressed as a structured patch, never a raw file write. */
export interface PatchSpecRequest {
  readonly patch: SpecPatch;
  readonly provenance?: ChangeProvenance;
}

/**
 * `success: false` means nothing was written — `diagnostics` explains
 * why (schema/semantic/policy rejection, or a project shape this write
 * path doesn't support yet, e.g. multi-file). `success: true` always
 * carries the freshly-written `application`, re-read from disk so the
 * client's view can never drift from what's actually on it.
 */
export interface PatchSpecResponse {
  readonly success: boolean;
  readonly application?: AgenticApplication;
  readonly diagnostics: readonly Diagnostic[];
}

/** Body of `POST /api/genai/prompt-to-spec`. */
export interface PromptToSpecRequest {
  readonly prompt: string;
}

/**
 * Mirrors `@agentform/studio-genai`'s `SkippedResource` structurally
 * rather than importing it — studio-genai already depends on studio-core,
 * so the reverse import would be circular. Same self-contained-mirror
 * choice studio-design's http-contracts.ts makes for `Diagnostic`.
 */
export interface SkippedSpecResource {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly reason: string;
}

/**
 * `success: false` means `patch` isn't safe to accept as-is —
 * `diagnostics` explains why. `summary`/`patch`/`skipped` are still
 * populated whenever generation itself succeeded (even if the resulting
 * patch failed validation), so the UI can show what was proposed and why
 * it was rejected, not just an opaque failure. Accepting a proposal never
 * happens through this endpoint — the client re-submits `patch` to the
 * real `POST /api/spec/patch`, which re-runs this exact same validation
 * itself rather than trusting that this preview call is still fresh.
 */
export interface PromptToSpecResponse {
  readonly success: boolean;
  readonly summary?: string;
  readonly patch?: SpecPatch;
  readonly skipped?: readonly SkippedSpecResource[];
  readonly diagnostics: readonly Diagnostic[];
}

export type AuditTarget =
  | { readonly kind: 'spec' }
  | { readonly kind: 'design'; readonly resourceType: string; readonly resourceId: string };

/**
 * One entry in Studio's local, append-only provenance log (Phase 18) —
 * never a security control (unlike `@agentform/planner`'s hash-verified
 * `.afplan` files), just operational visibility into what changed, from
 * where, and when. Lives under `.agentform/` on the server, never
 * committed to git or shared as a team artifact — see ADR-0021.
 */
export interface AuditEntry {
  readonly timestamp: string;
  readonly source: ChangeSource;
  readonly summary: string;
  readonly target: AuditTarget;
}

/** Body of `GET /api/audit`. Newest first. */
export interface AuditListResponse {
  readonly entries: readonly AuditEntry[];
}

/** One prior turn of a multi-turn chat conversation. Mirrors `@agentform/studio-genai`'s `GenAIHistoryMessage` structurally, not by import — studio-genai already depends on studio-core. */
export interface ChatHistoryMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** Body of `POST /api/genai/chat/spec`. */
export interface ChatSpecRequest {
  readonly message: string;
  /** Prior turns of this conversation, oldest first — omit for the first turn. */
  readonly history?: readonly ChatHistoryMessage[];
}

/**
 * Unlike `PromptToSpecResponse`, `message` is always present (a chat
 * turn always has a reply, even just an explanation of why nothing was
 * proposed) and `patch` is present only when the model actually proposed
 * a change this turn — a plain conversational reply carries no patch at
 * all. `success` describes the patch's own validity when one is present;
 * with no patch there is nothing to validate, so `success` stays `true`.
 * Same preview-only contract as `PromptToSpecResponse`: accepting a
 * proposal means re-submitting `patch` to the real `POST /api/spec/patch`.
 */
export interface ChatSpecResponse {
  readonly success: boolean;
  readonly message: string;
  readonly patch?: SpecPatch;
  readonly diagnostics: readonly Diagnostic[];
}
