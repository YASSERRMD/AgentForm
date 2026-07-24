import type { AgenticApplication } from '@agentform/studio-core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpecViewer } from './SpecViewer';

const APPLICATION = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'support-bot', version: '1.0.0', description: 'A support bot.' },
  spec: {
    runtime: { target: 'openai', environment: 'development' },
    models: { primary: { provider: 'openai', model: 'gpt-5' } },
    agents: {
      assistant: { model: 'primary', role: 'assistant', instructions: { text: 'Help.' } },
    },
    workflows: {
      main: {
        entrypoint: 'assistant',
        nodes: { assistant: { type: 'agent', agent: 'assistant' } },
      },
    },
  },
} as unknown as AgenticApplication;

describe('SpecViewer', () => {
  it('renders the spec name, version, runtime target, and resource ids', () => {
    render(<SpecViewer application={APPLICATION} />);

    expect(screen.getByText('support-bot')).toBeInTheDocument();
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/target: openai/)).toBeInTheDocument();
    expect(screen.getByText('A support bot.')).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
    expect(screen.getByText('assistant')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('Tools (0)')).toBeInTheDocument();
  });
});
