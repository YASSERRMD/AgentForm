import type { Diagnostic, PatchImpactLevel, SkippedSpecResource } from '@agentform/studio-core';
import { DiagnosticsPanel } from './DiagnosticsPanel';

export interface ProposalChange {
  readonly description: string;
}

export interface ProposalReviewProps {
  /** Matches the outer `aria-label` each call site already used before this extraction (`'Proposal'`, `'Layout proposal'`, ...) — existing tests query by it, so this stays call-site-owned rather than fixed here. */
  readonly ariaLabel: string;
  readonly summary?: string;
  readonly changes?: readonly ProposalChange[];
  readonly skipped?: readonly SkippedSpecResource[];
  /** Absent when the proposal kind has no such signal (e.g. a presentation-only layout change never touches spec.* behavior) — see `classifyPatchImpact`'s own doc comment for why this is deliberately narrower than a full plan-risk classification. */
  readonly impact?: PatchImpactLevel;
  readonly diagnostics: readonly Diagnostic[];
  readonly canAccept: boolean;
  readonly acceptBusy: boolean;
  readonly onAccept: () => void;
  readonly onReject: () => void;
}

/**
 * The single "plan + risk + policy shown together" review surface every
 * proposal source in Studio renders through (Phase 17's one-shot GenAI
 * panels, Phase 18's chat) — one consistent layout no matter where a
 * proposal came from. Never applies anything itself: `onAccept` is
 * entirely the caller's own decision about what "accept" means for its
 * proposal kind (re-submit a patch for real validation, or load a layout
 * into local draft state), matching the preview-only contract every
 * proposal endpoint already guarantees server-side.
 */
export function ProposalReview({
  ariaLabel,
  summary,
  changes,
  skipped,
  impact,
  diagnostics,
  canAccept,
  acceptBusy,
  onAccept,
  onReject,
}: ProposalReviewProps) {
  return (
    <div aria-label={ariaLabel}>
      {summary && <p>{summary}</p>}
      {impact && (
        <p>
          Impact: <strong>{impact}</strong>
        </p>
      )}
      {changes && changes.length > 0 && (
        <ul aria-label="Proposed changes">
          {changes.map((change, index) => (
            <li key={index}>{change.description}</li>
          ))}
        </ul>
      )}
      {skipped && skipped.length > 0 && (
        <ul aria-label="Skipped resources">
          {skipped.map((skippedResource) => (
            <li key={`${skippedResource.resourceType}.${skippedResource.resourceId}`}>
              {skippedResource.resourceType}.{skippedResource.resourceId}: {skippedResource.reason}
            </li>
          ))}
        </ul>
      )}
      <DiagnosticsPanel diagnostics={diagnostics} />
      <button type="button" onClick={onAccept} disabled={!canAccept}>
        {acceptBusy ? 'Applying…' : 'Accept'}
      </button>
      <button type="button" onClick={onReject} disabled={acceptBusy}>
        Reject
      </button>
    </div>
  );
}
