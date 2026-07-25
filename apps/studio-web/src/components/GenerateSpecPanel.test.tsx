import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { GenerateSpecPanel } from './GenerateSpecPanel';

function typePromptAndGenerate(prompt: string) {
  fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: prompt } });
  fireEvent.click(screen.getByText('Generate'));
}

describe('GenerateSpecPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a proposal and shows the summary and proposed changes', async () => {
    vi.spyOn(client, 'promptToSpec').mockResolvedValue({
      success: true,
      summary: 'Added a lookup tool.',
      patch: [
        { op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function', handler: 'x' } },
      ],
      skipped: [],
      diagnostics: [],
    });
    render(<GenerateSpecPanel onApplied={vi.fn()} />);

    typePromptAndGenerate('add a lookup tool');

    expect(await screen.findByText('Added a lookup tool.')).toBeInTheDocument();
    expect(screen.getByText('add spec.tools.lookup')).toBeInTheDocument();
  });

  it('accepts a valid proposal by re-submitting the patch to patchSpec, then calls onApplied', async () => {
    vi.spyOn(client, 'promptToSpec').mockResolvedValue({
      success: true,
      summary: 'Added a lookup tool.',
      patch: [{ op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function' } }],
      skipped: [],
      diagnostics: [],
    });
    const patchSpecMock = vi
      .spyOn(client, 'patchSpec')
      .mockResolvedValue({ success: true, diagnostics: [] });
    const onApplied = vi.fn();
    render(<GenerateSpecPanel onApplied={onApplied} />);
    typePromptAndGenerate('add a lookup tool');
    await screen.findByText('Added a lookup tool.');

    fireEvent.click(screen.getByText('Accept'));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(patchSpecMock).toHaveBeenCalledWith([
      { op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function' } },
    ]);
    expect(screen.queryByText('Added a lookup tool.')).not.toBeInTheDocument();
  });

  it('disables Accept and shows diagnostics when the proposal failed validation', async () => {
    vi.spyOn(client, 'promptToSpec').mockResolvedValue({
      success: false,
      summary: 'Added an agent using an undeclared model.',
      patch: [{ op: 'add', path: ['spec', 'agents', 'researcher'], value: { model: 'bogus' } }],
      skipped: [],
      diagnostics: [{ code: 'AGF3001', severity: 'error', message: 'Unknown model reference.' }],
    });
    render(<GenerateSpecPanel onApplied={vi.fn()} />);

    typePromptAndGenerate('add a researcher');

    expect(await screen.findByText('Unknown model reference.')).toBeInTheDocument();
    expect(screen.getByText('Accept')).toBeDisabled();
  });

  it('shows skipped resources with their reason', async () => {
    vi.spyOn(client, 'promptToSpec').mockResolvedValue({
      success: true,
      summary: 'Redefined the primary model.',
      patch: [],
      skipped: [{ resourceType: 'models', resourceId: 'primary', reason: 'already exists' }],
      diagnostics: [],
    });
    render(<GenerateSpecPanel onApplied={vi.fn()} />);

    typePromptAndGenerate('change the model');

    expect(await screen.findByText('models.primary: already exists')).toBeInTheDocument();
    // Nothing to apply — Accept stays disabled even though success is true.
    expect(screen.getByText('Accept')).toBeDisabled();
  });

  it('rejecting a proposal clears it without ever calling patchSpec', async () => {
    vi.spyOn(client, 'promptToSpec').mockResolvedValue({
      success: true,
      summary: 'Added a lookup tool.',
      patch: [{ op: 'add', path: ['spec', 'tools', 'lookup'], value: { type: 'function' } }],
      skipped: [],
      diagnostics: [],
    });
    const patchSpecMock = vi.spyOn(client, 'patchSpec');
    render(<GenerateSpecPanel onApplied={vi.fn()} />);
    typePromptAndGenerate('add a lookup tool');
    await screen.findByText('Added a lookup tool.');

    fireEvent.click(screen.getByText('Reject'));

    expect(screen.queryByText('Added a lookup tool.')).not.toBeInTheDocument();
    expect(patchSpecMock).not.toHaveBeenCalled();
  });

  it('shows an error message when generation itself fails (e.g. a transport error)', async () => {
    vi.spyOn(client, 'promptToSpec').mockRejectedValue(new Error('network error'));
    render(<GenerateSpecPanel onApplied={vi.fn()} />);

    typePromptAndGenerate('add a lookup tool');

    expect(await screen.findByRole('alert')).toHaveTextContent('network error');
  });
});
