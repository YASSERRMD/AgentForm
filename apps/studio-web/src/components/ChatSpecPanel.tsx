import type {
  AgenticApplication,
  ChatHistoryMessage,
  ChatSpecResponse,
} from '@agentform/studio-core';
import { classifyPatchImpact } from '@agentform/studio-core';
import { useState } from 'react';
import { chatSpec, patchSpec } from '../api/client';
import { ChatTranscript } from './ChatTranscript';
import { ProposalReview } from './ProposalReview';

export interface ChatSpecPanelProps {
  /** The currently-loaded, validated spec — feeds `classifyPatchImpact`'s destructive-tool check and is what a proposed patch would apply against. */
  readonly application?: AgenticApplication;
  /** Called after a proposal is accepted and successfully written — the caller reloads the spec, same as every other mutation in App.tsx. */
  readonly onApplied: () => void;
}

type TurnState =
  | { readonly status: 'idle' }
  | { readonly status: 'sending' }
  | { readonly status: 'reviewing'; readonly response: ChatSpecResponse }
  | { readonly status: 'applying'; readonly response: ChatSpecResponse }
  | { readonly status: 'error'; readonly message: string };

/**
 * Edit-by-chat for the spec (Phase 18) — the multi-turn replacement for
 * Phase 17's one-shot "Generate with AI" panel; a fresh conversation's
 * first message covers that same one-shot case, so there's no longer a
 * separate box for it (see ADR-0021). Every turn either replies
 * conversationally (shown straight in the transcript) or proposes a real
 * `SpecPatch`, reviewed through the same `ProposalReview` every other
 * proposal source uses. Preview-only, same as Phase 17: Accept
 * re-submits `patch` to the real `patchSpec`, which re-validates it
 * fresh — nothing here ever writes directly.
 */
export function ChatSpecPanel({ application, onApplied }: ChatSpecPanelProps) {
  const [messages, setMessages] = useState<readonly ChatHistoryMessage[]>([]);
  const [input, setInput] = useState('');
  const [state, setState] = useState<TurnState>({ status: 'idle' });

  async function handleSend() {
    const message = input.trim();
    if (message.length === 0) {
      return;
    }
    const history = messages;
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    setState({ status: 'sending' });
    try {
      const response = await chatSpec(message, history);
      if (!response.success && !response.patch) {
        // Generation itself failed (no provider configured, a transient
        // provider error, ...) — there's no reply to add to the
        // transcript, just a diagnostic explaining why.
        setState({
          status: 'error',
          message: response.diagnostics[0]?.message ?? 'Generation failed.',
        });
        return;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: response.message }]);
      setState(response.patch ? { status: 'reviewing', response } : { status: 'idle' });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleAccept(response: ChatSpecResponse) {
    if (!response.patch || response.patch.length === 0) {
      return;
    }
    setState({ status: 'applying', response });
    try {
      const applied = await patchSpec(response.patch);
      if (applied.success) {
        setState({ status: 'idle' });
        onApplied();
      } else {
        setState({
          status: 'reviewing',
          response: { ...response, success: false, diagnostics: applied.diagnostics },
        });
      }
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const review =
    state.status === 'reviewing' || state.status === 'applying' ? state.response : undefined;
  const busy = state.status === 'sending' || state.status === 'applying';
  const canAccept =
    review !== undefined && review.success && (review.patch?.length ?? 0) > 0 && !busy;

  return (
    <section aria-label="Chat with AI">
      <h3>Chat with AI</h3>
      <ChatTranscript
        messages={messages}
        pendingReview={
          review && (
            <ProposalReview
              ariaLabel="Proposal"
              changes={review.patch?.map((op) => ({
                description: `${op.op} ${op.path.join('.')}`,
              }))}
              impact={review.patch ? classifyPatchImpact(review.patch, application) : undefined}
              diagnostics={review.diagnostics}
              canAccept={canAccept}
              acceptBusy={state.status === 'applying'}
              onAccept={() => void handleAccept(review)}
              onReject={() => setState({ status: 'idle' })}
            />
          )
        }
        input={input}
        onInputChange={setInput}
        onSend={() => void handleSend()}
        busy={busy}
        placeholder="e.g. add a tool that looks up order status, or ask a question"
        error={state.status === 'error' ? state.message : undefined}
      />
    </section>
  );
}
