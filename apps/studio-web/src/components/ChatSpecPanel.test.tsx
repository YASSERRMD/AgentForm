import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { ChatSpecPanel } from './ChatSpecPanel';

function typeAndSend(message: string) {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: message } });
  fireEvent.click(screen.getByText('Send'));
}

describe('ChatSpecPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the user message and the assistant reply in the transcript', async () => {
    vi.spyOn(client, 'chatSpec').mockResolvedValue({
      success: true,
      message: 'The assistant uses the primary model.',
      diagnostics: [],
    });
    render(<ChatSpecPanel onApplied={vi.fn()} />);

    typeAndSend('what model does the assistant use?');

    expect(screen.getByText('what model does the assistant use?')).toBeInTheDocument();
    expect(await screen.findByText('The assistant uses the primary model.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Proposal')).not.toBeInTheDocument();
  });

  it('shows a proposal with its changes and impact for a patch-bearing reply', async () => {
    vi.spyOn(client, 'chatSpec').mockResolvedValue({
      success: true,
      message: "I've added a lookup tool.",
      patch: [
        { op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function', handler: 'x' } },
      ],
      diagnostics: [],
    });
    render(<ChatSpecPanel onApplied={vi.fn()} />);

    typeAndSend('add a lookup tool');

    expect(await screen.findByLabelText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('add spec.tools.lookup')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
  });

  it('accepts a valid proposal by re-submitting the patch to patchSpec, then calls onApplied', async () => {
    vi.spyOn(client, 'chatSpec').mockResolvedValue({
      success: true,
      message: "I've added a lookup tool.",
      patch: [{ op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function' } }],
      diagnostics: [],
    });
    const patchSpecMock = vi
      .spyOn(client, 'patchSpec')
      .mockResolvedValue({ success: true, diagnostics: [] });
    const onApplied = vi.fn();
    render(<ChatSpecPanel onApplied={onApplied} />);
    typeAndSend('add a lookup tool');
    await screen.findByLabelText('Proposal');

    fireEvent.click(screen.getByText('Accept'));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(patchSpecMock).toHaveBeenCalledWith([
      { op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function' } },
    ]);
    expect(screen.queryByLabelText('Proposal')).not.toBeInTheDocument();
    // The transcript itself isn't cleared by accepting.
    expect(screen.getByText("I've added a lookup tool.")).toBeInTheDocument();
  });

  it('disables Accept and shows diagnostics when the proposal failed validation', async () => {
    vi.spyOn(client, 'chatSpec').mockResolvedValue({
      success: false,
      message: 'Added an agent using an undeclared model.',
      patch: [{ op: 'add', path: ['spec', 'agents', 'researcher'], value: { model: 'bogus' } }],
      diagnostics: [{ code: 'AGF3001', severity: 'error', message: 'Unknown model reference.' }],
    });
    render(<ChatSpecPanel onApplied={vi.fn()} />);

    typeAndSend('add a researcher');

    expect(await screen.findByText('Unknown model reference.')).toBeInTheDocument();
    expect(screen.getByText('Accept')).toBeDisabled();
  });

  it('rejecting a proposal clears it without calling patchSpec, leaving the transcript intact', async () => {
    vi.spyOn(client, 'chatSpec').mockResolvedValue({
      success: true,
      message: "I've added a lookup tool.",
      patch: [{ op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function' } }],
      diagnostics: [],
    });
    const patchSpecMock = vi.spyOn(client, 'patchSpec');
    render(<ChatSpecPanel onApplied={vi.fn()} />);
    typeAndSend('add a lookup tool');
    await screen.findByLabelText('Proposal');

    fireEvent.click(screen.getByText('Reject'));

    expect(screen.queryByLabelText('Proposal')).not.toBeInTheDocument();
    expect(patchSpecMock).not.toHaveBeenCalled();
    expect(screen.getByText("I've added a lookup tool.")).toBeInTheDocument();
  });

  it('threads prior turns as history on the next message', async () => {
    const chatSpecMock = vi
      .spyOn(client, 'chatSpec')
      .mockResolvedValueOnce({
        success: true,
        message: "I've added a lookup tool.",
        diagnostics: [],
      })
      .mockResolvedValueOnce({ success: true, message: 'You are welcome.', diagnostics: [] });
    render(<ChatSpecPanel onApplied={vi.fn()} />);
    typeAndSend('add a lookup tool');
    await screen.findByText("I've added a lookup tool.");

    typeAndSend('thanks');

    await screen.findByText('You are welcome.');
    expect(chatSpecMock).toHaveBeenNthCalledWith(2, 'thanks', [
      { role: 'user', content: 'add a lookup tool' },
      { role: 'assistant', content: "I've added a lookup tool." },
    ]);
  });

  it('shows an error alert without losing the just-sent message when the request fails', async () => {
    vi.spyOn(client, 'chatSpec').mockRejectedValue(new Error('network error'));
    render(<ChatSpecPanel onApplied={vi.fn()} />);

    typeAndSend('add a lookup tool');

    expect(await screen.findByRole('alert')).toHaveTextContent('network error');
    expect(screen.getByText('add a lookup tool')).toBeInTheDocument();
  });

  it('shows an error alert, not a blank reply, when generation itself fails (success:false, no patch)', async () => {
    vi.spyOn(client, 'chatSpec').mockResolvedValue({
      success: false,
      message: '',
      diagnostics: [{ code: 'AGF8006', severity: 'error', message: 'GenAI is not configured.' }],
    });
    render(<ChatSpecPanel onApplied={vi.fn()} />);

    typeAndSend('add a lookup tool');

    expect(await screen.findByRole('alert')).toHaveTextContent('GenAI is not configured.');
    // No blank assistant bubble should have been added to the transcript.
    expect(screen.queryByLabelText('assistant message')).not.toBeInTheDocument();
  });
});
