import type { ChatHistoryMessage } from '@agentform/studio-core';
import type { ReactNode } from 'react';

export interface ChatTranscriptProps {
  readonly messages: readonly ChatHistoryMessage[];
  /** The `ProposalReview` for the latest turn's proposal, when there is one still pending accept/reject. */
  readonly pendingReview?: ReactNode;
  readonly input: string;
  readonly onInputChange: (value: string) => void;
  readonly onSend: () => void;
  readonly busy: boolean;
  readonly placeholder: string;
  readonly error?: string;
}

/**
 * Pure rendering of a chat transcript plus its input form — shared by
 * `ChatSpecPanel` and `ChatDesignPanel` (Phase 18), the same leaf-component
 * split `DiagnosticsPanel`/`ProposalReview` already use. Owns no
 * conversation state itself; each caller's own turn-by-turn state machine
 * decides what `messages`/`pendingReview` are on every render.
 */
export function ChatTranscript({
  messages,
  pendingReview,
  input,
  onInputChange,
  onSend,
  busy,
  placeholder,
  error,
}: ChatTranscriptProps) {
  return (
    <div>
      <ul aria-label="Conversation">
        {messages.map((message, index) => (
          <li key={index} aria-label={`${message.role} message`}>
            <strong>{message.role === 'user' ? 'You' : 'Assistant'}:</strong> {message.content}
          </li>
        ))}
      </ul>
      {pendingReview}
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim().length > 0) {
            onSend();
          }
        }}
      >
        <label>
          <span>Message</span>
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={placeholder}
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy || input.trim().length === 0}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
