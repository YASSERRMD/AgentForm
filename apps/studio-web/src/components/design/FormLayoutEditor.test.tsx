import type { Agent } from '@agentform/studio-core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { FormLayoutEditor } from './FormLayoutEditor';

const AGENT: Agent = {
  model: 'primary',
  role: 'assistant',
  instructions: { text: 'Be helpful.' },
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' }, age: { type: 'number' } },
  },
  outputSchema: { type: 'object', properties: { summary: {} } },
};

describe('FormLayoutEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads an existing design and renders its already-placed fields', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({
      design: {
        binding: { resourceType: 'agents', resourceId: 'assistant' },
        designVersion: '1',
        specVersionTarget: 'sha256:aaa',
        contentHash: 'sha256:bbb',
        layout: { input: [{ id: 'name', type: 'field', fieldPath: 'name', label: 'Name' }] },
      },
    });

    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);

    expect(await screen.findByLabelText('Layout field name')).toBeInTheDocument();
  });

  it('shows a loading state before the design fetch resolves', () => {
    vi.spyOn(client, 'getDesign').mockReturnValue(new Promise(() => {}));
    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    expect(screen.getByText('Loading layout…')).toBeInTheDocument();
  });

  it('starts with an empty layout when none exists yet, offering every schema field to add', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({ design: null });

    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    await waitFor(() => expect(screen.queryByText('Loading layout…')).not.toBeInTheDocument());

    const inputFieldset = screen.getByLabelText('Input fields layout');
    expect(inputFieldset).toHaveTextContent('name');
    expect(inputFieldset).toHaveTextContent('age');
  });

  it('adds a field to the layout via the "Add field" picker', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({ design: null });
    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    await waitFor(() => expect(screen.queryByText('Loading layout…')).not.toBeInTheDocument());

    const inputFieldset = screen.getByLabelText('Input fields layout');
    const picker = inputFieldset.querySelector('select')!;
    fireEvent.change(picker, { target: { value: 'name' } });

    expect(screen.getByLabelText('Layout field name')).toBeInTheDocument();
  });

  it('reorders a placed field with the up/down controls', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({
      design: {
        binding: { resourceType: 'agents', resourceId: 'assistant' },
        designVersion: '1',
        specVersionTarget: 'sha256:aaa',
        contentHash: 'sha256:bbb',
        layout: {
          input: [
            { id: 'name', type: 'field', fieldPath: 'name' },
            { id: 'age', type: 'field', fieldPath: 'age' },
          ],
        },
      },
    });
    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    await screen.findByLabelText('Layout field name');

    const ageRow = screen.getByLabelText('Layout field age');
    fireEvent.click(within(ageRow).getByText('↑'));

    const fieldRows = screen
      .getAllByRole('listitem')
      .filter((li) => li.getAttribute('aria-label')?.startsWith('Layout field'));
    expect(fieldRows[0]).toHaveAttribute('aria-label', 'Layout field age');
  });

  it('saves the layout and shows a confirmation on success', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({ design: null });
    const putDesignMock = vi.spyOn(client, 'putDesign').mockResolvedValue({
      success: true,
      diagnostics: [],
    });
    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    await waitFor(() => expect(screen.queryByText('Loading layout…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('Save layout'));

    await screen.findByText('Layout saved.');
    expect(putDesignMock).toHaveBeenCalledWith('agents', 'assistant', {
      binding: { resourceType: 'agents', resourceId: 'assistant' },
      layout: { input: [], output: [] },
    });
  });

  it('shows diagnostics instead of a confirmation when the save is rejected', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({ design: null });
    vi.spyOn(client, 'putDesign').mockResolvedValue({
      success: false,
      diagnostics: [{ code: 'AGF8003', severity: 'error', message: 'Dangling field path.' }],
    });
    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    await waitFor(() => expect(screen.queryByText('Loading layout…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('Save layout'));

    expect(await screen.findByText('Dangling field path.')).toBeInTheDocument();
    expect(screen.queryByText('Layout saved.')).not.toBeInTheDocument();
  });

  it('accepting a chat-proposed layout loads it into the editable draft, without saving', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({ design: null });
    const chatDesignMock = vi.spyOn(client, 'chatDesign').mockResolvedValue({
      success: true,
      message: "I've laid out the name field.",
      design: {
        binding: { resourceType: 'agents', resourceId: 'assistant' },
        designVersion: '1',
        specVersionTarget: 'sha256:aaa',
        contentHash: 'sha256:bbb',
        layout: { input: [{ id: 'name', type: 'field', fieldPath: 'name', widget: 'text' }] },
      },
      diagnostics: [],
    });
    const putDesignMock = vi.spyOn(client, 'putDesign');
    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    await waitFor(() => expect(screen.queryByText('Loading layout…')).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'lay it out' } });
    fireEvent.click(screen.getByText('Send'));
    await screen.findByLabelText('Layout proposal');

    fireEvent.click(screen.getByText('Accept'));

    expect(chatDesignMock).toHaveBeenCalledWith('assistant', 'lay it out', []);
    expect(screen.getByLabelText('Layout field name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Layout proposal')).not.toBeInTheDocument();
    expect(putDesignMock).not.toHaveBeenCalled();
  });

  it('disables Accept and shows diagnostics for a layout proposal that fails validation', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({ design: null });
    vi.spyOn(client, 'chatDesign').mockResolvedValue({
      success: false,
      message: 'That field does not exist.',
      design: {
        binding: { resourceType: 'agents', resourceId: 'assistant' },
        designVersion: '1',
        specVersionTarget: 'sha256:aaa',
        contentHash: 'sha256:bbb',
        layout: { input: [{ id: 'x', type: 'field', fieldPath: 'not-declared' }] },
      },
      diagnostics: [{ code: 'AGF8003', severity: 'error', message: 'Dangling field path.' }],
    });
    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    await waitFor(() => expect(screen.queryByText('Loading layout…')).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'lay it out' } });
    fireEvent.click(screen.getByText('Send'));

    expect(await screen.findByText('Dangling field path.')).toBeInTheDocument();
    const proposal = screen.getByLabelText('Layout proposal');
    expect(within(proposal).getByText('Accept')).toBeDisabled();
  });

  it('rejecting a layout proposal discards it, leaving the current draft untouched', async () => {
    vi.spyOn(client, 'getDesign').mockResolvedValue({ design: null });
    vi.spyOn(client, 'chatDesign').mockResolvedValue({
      success: true,
      message: "I've laid out the name field.",
      design: {
        binding: { resourceType: 'agents', resourceId: 'assistant' },
        designVersion: '1',
        specVersionTarget: 'sha256:aaa',
        contentHash: 'sha256:bbb',
        layout: { input: [{ id: 'name', type: 'field', fieldPath: 'name' }] },
      },
      diagnostics: [],
    });
    render(<FormLayoutEditor agentId="assistant" agent={AGENT} />);
    await waitFor(() => expect(screen.queryByText('Loading layout…')).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'lay it out' } });
    fireEvent.click(screen.getByText('Send'));
    await screen.findByLabelText('Layout proposal');

    fireEvent.click(screen.getByText('Reject'));

    expect(screen.queryByLabelText('Layout proposal')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Layout field name')).not.toBeInTheDocument();
  });
});
