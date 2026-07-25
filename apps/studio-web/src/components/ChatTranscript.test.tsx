import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatTranscript } from './ChatTranscript';

describe('ChatTranscript', () => {
  it('renders each message labeled by its role', () => {
    render(
      <ChatTranscript
        messages={[
          { role: 'user', content: 'add a lookup tool' },
          { role: 'assistant', content: "I've added a lookup tool." },
        ]}
        input=""
        onInputChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        placeholder="Ask something…"
      />,
    );

    expect(screen.getByLabelText('user message')).toHaveTextContent('add a lookup tool');
    expect(screen.getByLabelText('assistant message')).toHaveTextContent(
      "I've added a lookup tool.",
    );
  });

  it('renders pendingReview when given, and omits it when absent', () => {
    const { rerender } = render(
      <ChatTranscript
        messages={[]}
        input=""
        onInputChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        placeholder="Ask something…"
      />,
    );
    expect(screen.queryByLabelText('Proposal')).not.toBeInTheDocument();

    rerender(
      <ChatTranscript
        messages={[]}
        pendingReview={<div aria-label="Proposal">a proposal</div>}
        input=""
        onInputChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        placeholder="Ask something…"
      />,
    );
    expect(screen.getByLabelText('Proposal')).toBeInTheDocument();
  });

  it('submits the current input via onSend, and disables submit for a blank input', () => {
    const onSend = vi.fn();
    const { rerender } = render(
      <ChatTranscript
        messages={[]}
        input=""
        onInputChange={vi.fn()}
        onSend={onSend}
        busy={false}
        placeholder="Ask something…"
      />,
    );
    expect(screen.getByText('Send')).toBeDisabled();

    rerender(
      <ChatTranscript
        messages={[]}
        input="hello"
        onInputChange={vi.fn()}
        onSend={onSend}
        busy={false}
        placeholder="Ask something…"
      />,
    );
    fireEvent.click(screen.getByText('Send'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disables the input and shows "Sending…" while busy', () => {
    render(
      <ChatTranscript
        messages={[]}
        input="hello"
        onInputChange={vi.fn()}
        onSend={vi.fn()}
        busy
        placeholder="Ask something…"
      />,
    );

    expect(screen.getByLabelText('Message')).toBeDisabled();
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it('shows the error message as an alert when given', () => {
    render(
      <ChatTranscript
        messages={[]}
        input=""
        onInputChange={vi.fn()}
        onSend={vi.fn()}
        busy={false}
        placeholder="Ask something…"
        error="network error"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('network error');
  });
});
