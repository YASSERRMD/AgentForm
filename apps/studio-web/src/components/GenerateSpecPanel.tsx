import type { AgenticApplication, PromptToSpecResponse } from '@agentform/studio-core';
import { classifyPatchImpact } from '@agentform/studio-core';
import { useState } from 'react';
import { patchSpec, promptToSpec } from '../api/client';
import { ProposalReview } from './ProposalReview';

export interface GenerateSpecPanelProps {
  /** The currently-loaded, validated spec — feeds `classifyPatchImpact`'s destructive-tool check. Omit (e.g. nothing loaded yet) and the impact signal falls back to the patch's own operation types alone. */
  readonly application?: AgenticApplication;
  /** Called after a proposal is accepted and successfully written — the caller reloads the spec, same as every other mutation in App.tsx. */
  readonly onApplied: () => void;
}

type GenerateState =
  | { readonly status: 'idle' }
  | { readonly status: 'generating' }
  | { readonly status: 'proposed'; readonly result: PromptToSpecResponse }
  | { readonly status: 'applying'; readonly result: PromptToSpecResponse }
  | { readonly status: 'error'; readonly message: string };

/**
 * Prompt-to-spec (§34.3, Phase 17): proposes NEW models/tools/agents/
 * workflows from a natural-language prompt. Preview-only — Accept
 * re-submits the proposed `patch` to the real `patchSpec` (the same
 * write path ResourceEditor's own Save button uses), so nothing here
 * ever writes directly; the server re-validates it fresh regardless of
 * what this preview already showed.
 */
export function GenerateSpecPanel({ application, onApplied }: GenerateSpecPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<GenerateState>({ status: 'idle' });
  const busy = state.status === 'generating' || state.status === 'applying';

  async function handleGenerate() {
    setState({ status: 'generating' });
    try {
      const result = await promptToSpec(prompt);
      setState({ status: 'proposed', result });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleAccept(result: PromptToSpecResponse) {
    if (!result.patch || result.patch.length === 0) {
      return;
    }
    setState({ status: 'applying', result });
    try {
      const applied = await patchSpec(result.patch);
      if (applied.success) {
        setPrompt('');
        setState({ status: 'idle' });
        onApplied();
      } else {
        setState({
          status: 'proposed',
          result: { ...result, success: false, diagnostics: applied.diagnostics },
        });
      }
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const proposal =
    state.status === 'proposed' || state.status === 'applying' ? state.result : undefined;
  const canAccept =
    proposal !== undefined && proposal.success && (proposal.patch?.length ?? 0) > 0 && !busy;

  return (
    <section aria-label="Generate with AI">
      <h3>Generate with AI</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (prompt.trim().length > 0) {
            void handleGenerate();
          }
        }}
      >
        <label>
          <span>Prompt</span>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. add a tool that looks up order status"
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy || prompt.trim().length === 0}>
          {state.status === 'generating' ? 'Generating…' : 'Generate'}
        </button>
      </form>
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {proposal && (
        <ProposalReview
          ariaLabel="Proposal"
          summary={proposal.summary}
          changes={proposal.patch?.map((op) => ({ description: `${op.op} ${op.path.join('.')}` }))}
          skipped={proposal.skipped}
          impact={proposal.patch ? classifyPatchImpact(proposal.patch, application) : undefined}
          diagnostics={proposal.diagnostics}
          canAccept={canAccept}
          acceptBusy={state.status === 'applying'}
          onAccept={() => void handleAccept(proposal)}
          onReject={() => setState({ status: 'idle' })}
        />
      )}
    </section>
  );
}
