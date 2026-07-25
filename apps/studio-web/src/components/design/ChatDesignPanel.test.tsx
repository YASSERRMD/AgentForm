import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { ChatDesignPanel } from './ChatDesignPanel';

function typeAndSend(message: string) {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: message } });
  fireEvent.click(screen.getByText('Send'));
}

describe('ChatDesignPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the user message and the assistant reply, with no proposal for a plain reply', async () => {
    vi.spyOn(client, 'chatDesign').mockResolvedValue({
      success: true,
      message: 'This agent has one input field today.',
      diagnostics: [],
    });
    render(<ChatDesignPanel agentId="assistant" onAccept={vi.fn()} />);

    typeAndSend('what fields does this have?');

    expect(screen.getByText('what fields does this have?')).toBeInTheDocument();
    expect(await screen.findByText('This agent has one input field today.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Layout proposal')).not.toBeInTheDocument();
  });

  it('threads prior turns as history, scoped to the given agentId', async () => {
    const chatDesignMock = vi
      .spyOn(client, 'chatDesign')
      .mockResolvedValueOnce({ success: true, message: 'Grouped it.', diagnostics: [] })
      .mockResolvedValueOnce({ success: true, message: 'You are welcome.', diagnostics: [] });
    render(<ChatDesignPanel agentId="assistant" onAccept={vi.fn()} />);
    typeAndSend('group urgency with the question');
    await screen.findByText('Grouped it.');

    typeAndSend('thanks');

    await screen.findByText('You are welcome.');
    expect(chatDesignMock).toHaveBeenNthCalledWith(
      1,
      'assistant',
      'group urgency with the question',
      [],
    );
    expect(chatDesignMock).toHaveBeenNthCalledWith(2, 'assistant', 'thanks', [
      { role: 'user', content: 'group urgency with the question' },
      { role: 'assistant', content: 'Grouped it.' },
    ]);
  });

  it('shows an error alert without losing the just-sent message when the request fails', async () => {
    vi.spyOn(client, 'chatDesign').mockRejectedValue(new Error('network error'));
    render(<ChatDesignPanel agentId="assistant" onAccept={vi.fn()} />);

    typeAndSend('lay it out');

    expect(await screen.findByRole('alert')).toHaveTextContent('network error');
    expect(screen.getByText('lay it out')).toBeInTheDocument();
  });

  it('shows an error alert, not a blank reply, when generation itself fails (success:false, no design)', async () => {
    vi.spyOn(client, 'chatDesign').mockResolvedValue({
      success: false,
      message: '',
      diagnostics: [{ code: 'AGF8006', severity: 'error', message: 'GenAI is not configured.' }],
    });
    render(<ChatDesignPanel agentId="assistant" onAccept={vi.fn()} />);

    typeAndSend('lay it out');

    expect(await screen.findByRole('alert')).toHaveTextContent('GenAI is not configured.');
    expect(screen.queryByLabelText('assistant message')).not.toBeInTheDocument();
  });
});
