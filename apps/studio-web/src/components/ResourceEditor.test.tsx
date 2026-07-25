import type { ResourceFormSchema } from '@agentform/studio-core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { ResourceEditor } from './ResourceEditor';

const MODEL_FORM_SCHEMA: ResourceFormSchema = {
  resourceType: 'models',
  jsonSchema: { type: 'object', properties: { provider: { type: 'string' } } },
};

const TOOL_FORM_SCHEMA: ResourceFormSchema = {
  resourceType: 'tools',
  jsonSchema: {
    oneOf: [
      { type: 'object', properties: { type: { const: 'function' }, handler: { type: 'string' } } },
      { type: 'object', properties: { type: { const: 'mcp' }, server: { type: 'string' } } },
    ],
  },
};

describe('ResourceEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a replace patch for an existing resource and calls onSaved on success', async () => {
    const patchSpecMock = vi.spyOn(client, 'patchSpec').mockResolvedValue({
      success: true,
      diagnostics: [],
    });
    const onSaved = vi.fn();

    render(
      <ResourceEditor
        resourceType="models"
        resourceId="primary"
        formSchema={MODEL_FORM_SCHEMA}
        initialValue={{ provider: 'openai' }}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patchSpecMock).toHaveBeenCalledWith([
      { op: 'replace', path: ['spec', 'models', 'primary'], value: { provider: 'openai' } },
    ]);
  });

  it('sends an add patch for a new resource (initialValue undefined)', async () => {
    const patchSpecMock = vi.spyOn(client, 'patchSpec').mockResolvedValue({
      success: true,
      diagnostics: [],
    });

    render(
      <ResourceEditor
        resourceType="models"
        resourceId="secondary"
        formSchema={MODEL_FORM_SCHEMA}
        initialValue={undefined}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(patchSpecMock).toHaveBeenCalledWith([
        { op: 'add', path: ['spec', 'models', 'secondary'], value: {} },
      ]),
    );
  });

  it('shows returned diagnostics and does not call onSaved when the patch is rejected', async () => {
    vi.spyOn(client, 'patchSpec').mockResolvedValue({
      success: false,
      diagnostics: [{ code: 'AGF3001', severity: 'error', message: 'Invalid model.' }],
    });
    const onSaved = vi.fn();

    render(
      <ResourceEditor
        resourceType="models"
        resourceId="primary"
        formSchema={MODEL_FORM_SCHEMA}
        initialValue={{ provider: 'openai' }}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('AGF3001')).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("renders a variant picker for tools' real discriminated union and includes the chosen type in the patch", async () => {
    const patchSpecMock = vi.spyOn(client, 'patchSpec').mockResolvedValue({
      success: true,
      diagnostics: [],
    });

    render(
      <ResourceEditor
        resourceType="tools"
        resourceId="lookup"
        formSchema={TOOL_FORM_SCHEMA}
        initialValue={{ type: 'function', handler: 'lookup.js' }}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('lookup.js')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(patchSpecMock).toHaveBeenCalledWith([
        {
          op: 'replace',
          path: ['spec', 'tools', 'lookup'],
          value: { type: 'function', handler: 'lookup.js' },
        },
      ]),
    );
  });

  it('calls onCancel when Cancel is clicked, without patching anything', () => {
    const patchSpecMock = vi.spyOn(client, 'patchSpec');
    const onCancel = vi.fn();

    render(
      <ResourceEditor
        resourceType="models"
        resourceId="primary"
        formSchema={MODEL_FORM_SCHEMA}
        initialValue={{ provider: 'openai' }}
        onSaved={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
    expect(patchSpecMock).not.toHaveBeenCalled();
  });
});
