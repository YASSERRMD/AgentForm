import type { Diagnostic } from '@agentform/studio-core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiagnosticsPanel } from './DiagnosticsPanel';

const DIAGNOSTICS: readonly Diagnostic[] = [
  {
    code: 'AGF1001',
    severity: 'error',
    message: 'Missing required field.',
    path: ['spec', 'agents', 'assistant'],
  },
  { code: 'AGF5001', severity: 'warning', message: 'Feature is partial.' },
  {
    code: 'AGF9001',
    severity: 'info',
    message: 'For your information.',
    location: { file: 'agentform.yaml', line: 3, column: 5 },
  },
];

describe('DiagnosticsPanel', () => {
  it('renders each diagnostic severity, code, message, path, and location', () => {
    render(<DiagnosticsPanel diagnostics={DIAGNOSTICS} />);

    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('AGF1001')).toBeInTheDocument();
    expect(screen.getByText('Missing required field.')).toBeInTheDocument();
    expect(screen.getByText(/spec\.agents\.assistant/)).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
    expect(screen.getByText('AGF5001')).toBeInTheDocument();
    expect(screen.getByText('info')).toBeInTheDocument();
    expect(screen.getByText(/agentform\.yaml:3:5/)).toBeInTheDocument();
  });

  it('renders a fallback message when there are no diagnostics', () => {
    render(<DiagnosticsPanel diagnostics={[]} />);

    expect(screen.getByText('No diagnostics.')).toBeInTheDocument();
  });
});
