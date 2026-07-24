import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from './api/client';
import { App } from './App';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the spec viewer and diagnostics panel for a valid spec', async () => {
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
  });

  it('renders diagnostics only when the spec failed to validate', async () => {
    vi.spyOn(client, 'getSpec').mockResolvedValue({
      diagnostics: [{ code: 'AGF1001', severity: 'error', message: 'Missing required field.' }],
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText('AGF1001')).toBeInTheDocument());
    expect(screen.queryByLabelText('Specification')).not.toBeInTheDocument();
  });
});
