import type { ChatDesignResponse, FormLayout } from '@agentform/studio-design';
import type { ChatHistoryMessage } from '@agentform/studio-core';
import { useState } from 'react';
import { chatDesign } from '../../api/client';
import { ChatTranscript } from '../ChatTranscript';
import { ProposalReview } from '../ProposalReview';

export interface ChatDesignPanelProps {
  readonly agentId: string;
  /** Called when a proposed layout is accepted — loads it straight into the editor's own draft state (the same `layout` the up/down/add-field controls already mutate). Never calls `putDesign` itself; the existing "Save layout" button is still the only thing that persists it. */
  readonly onAccept: (layout: FormLayout) => void;
}

type TurnState =
  | { readonly status: 'idle' }
  | { readonly status: 'sending' }
  | { readonly status: 'reviewing'; readonly response: ChatDesignResponse }
  | { readonly status: 'error'; readonly message: string };

/**
 * Edit-by-chat for one agent's form layout (Phase 18) — the multi-turn
 * replacement for Phase 17's one-shot "Generate layout with AI" panel;
 * see ADR-0021 for why the one-shot box was retired rather than kept
 * alongside this. No `changes`/`impact` passed to `ProposalReview` here:
 * a layout is presentation-only and never touches spec.* behavior, so
 * neither concept applies to it (see `classifyPatchImpact`'s own note).
 * Accept has no separate "applying" phase — unlike the spec panel, it
 * only ever assigns local draft state, never makes a network call.
 */
export function ChatDesignPanel({ agentId, onAccept }: ChatDesignPanelProps) {
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
      const response = await chatDesign(agentId, message, history);
      if (!response.success && !response.design) {
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
      setState(response.design ? { status: 'reviewing', response } : { status: 'idle' });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const review = state.status === 'reviewing' ? state.response : undefined;
  const proposedLayout = review?.design?.layout;
  const busy = state.status === 'sending';
  const canAccept = review !== undefined && review.success && proposedLayout !== undefined;

  return (
    <section aria-label="Chat about layout">
      <ChatTranscript
        messages={messages}
        pendingReview={
          review && (
            <ProposalReview
              ariaLabel="Layout proposal"
              diagnostics={review.diagnostics}
              canAccept={canAccept}
              acceptBusy={false}
              onAccept={() => {
                if (proposedLayout) {
                  onAccept(proposedLayout);
                }
                setState({ status: 'idle' });
              }}
              onReject={() => setState({ status: 'idle' })}
            />
          )
        }
        input={input}
        onInputChange={setInput}
        onSend={() => void handleSend()}
        busy={busy}
        placeholder="e.g. group urgency with the question, or ask what fields exist"
        error={state.status === 'error' ? state.message : undefined}
      />
    </section>
  );
}
