import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from './api/client';
import { App } from './App';

const EMPTY_FORM_SCHEMAS = {
  models: { resourceType: 'models' as const, jsonSchema: { type: 'object', properties: {} } },
  tools: { resourceType: 'tools' as const, jsonSchema: { oneOf: [] } },
  agents: { resourceType: 'agents' as const, jsonSchema: { type: 'object', properties: {} } },
  workflows: { resourceType: 'workflows' as const, jsonSchema: { type: 'object', properties: {} } },
};

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the spec viewer and diagnostics panel for a valid spec', async () => {
    vi.spyOn(client, 'getFormSchemas').mockResolvedValue(EMPTY_FORM_SCHEMAS);
    vi.spyOn(client, 'getAudit').mockResolvedValue({ entries: [] });
    vi.spyOn(client, 'getSpec').mockResolvedValue({
      application: {
        apiVersion: 'agentform.dev/v1alpha1',
        kind: 'AgenticApplication',
        metadata: { name: 'support-bot', version: '1.0.0' },
        spec: {
          runtime: { target: 'openai', environment: 'development' },
          models: {},
          agents: {},
          workflows: {},
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      diagnostics: [],
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText('support-bot')).toBeInTheDocument());
    expect(screen.getByText('No diagnostics.')).toBeInTheDocument();
    expect(screen.getByLabelText('Chat with AI')).toBeInTheDocument();
  });

  it('renders diagnostics only when the spec failed to validate', async () => {
    vi.spyOn(client, 'getFormSchemas').mockResolvedValue(EMPTY_FORM_SCHEMAS);
    vi.spyOn(client, 'getAudit').mockResolvedValue({ entries: [] });
    vi.spyOn(client, 'getSpec').mockResolvedValue({
      diagnostics: [{ code: 'AGF1001', severity: 'error', message: 'Missing required field.' }],
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText('AGF1001')).toBeInTheDocument());
    expect(screen.queryByLabelText('Specification')).not.toBeInTheDocument();
  });

  it('opens a resource editor when a resource id is clicked, and closes it on save', async () => {
    vi.spyOn(client, 'getFormSchemas').mockResolvedValue(EMPTY_FORM_SCHEMAS);
    vi.spyOn(client, 'getAudit').mockResolvedValue({ entries: [] });
    vi.spyOn(client, 'getSpec').mockResolvedValue({
      application: {
        apiVersion: 'agentform.dev/v1alpha1',
        kind: 'AgenticApplication',
        metadata: { name: 'support-bot', version: '1.0.0' },
        spec: {
          runtime: { target: 'openai', environment: 'development' },
          models: { primary: { provider: 'openai', model: 'gpt-5' } },
          agents: {},
          workflows: {},
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      diagnostics: [],
    });
    vi.spyOn(client, 'patchSpec').mockResolvedValue({ success: true, diagnostics: [] });

    render(<App />);
    await waitFor(() => expect(screen.getByText('primary')).toBeInTheDocument());

    fireEvent.click(screen.getByText('primary'));
    expect(screen.getByLabelText('Edit models.primary')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(screen.queryByLabelText('Edit models.primary')).not.toBeInTheDocument(),
    );
  });

  it('opens the real workflow canvas (not raw JSON) when a workflow resource is clicked', async () => {
    vi.spyOn(client, 'getFormSchemas').mockResolvedValue(EMPTY_FORM_SCHEMAS);
    vi.spyOn(client, 'getAudit').mockResolvedValue({ entries: [] });
    vi.spyOn(client, 'getSpec').mockResolvedValue({
      application: {
        apiVersion: 'agentform.dev/v1alpha1',
        kind: 'AgenticApplication',
        metadata: { name: 'support-bot', version: '1.0.0' },
        spec: {
          runtime: { target: 'openai', environment: 'development' },
          models: {},
          agents: { assistant: { model: 'primary', role: 'assistant' } },
          workflows: {
            main: {
              entrypoint: 'assistant',
              nodes: { assistant: { type: 'agent', agent: 'assistant' } },
            },
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      diagnostics: [],
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument());

    fireEvent.click(screen.getByText('main'));

    expect(await screen.findByLabelText('Workflow node assistant')).toBeInTheDocument();
    expect(screen.getByLabelText('New node id')).toBeInTheDocument();
  });
});
