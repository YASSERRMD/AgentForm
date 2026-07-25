import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { AuditPanel } from './AuditPanel';

describe('AuditPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "No changes yet." for an empty log', async () => {
    vi.spyOn(client, 'getAudit').mockResolvedValue({ entries: [] });

    render(<AuditPanel />);

    expect(await screen.findByText('No changes yet.')).toBeInTheDocument();
  });

  it('lists entries with their source and target', async () => {
    vi.spyOn(client, 'getAudit').mockResolvedValue({
      entries: [
        {
          timestamp: '2026-07-25T00:00:00.000Z',
          source: 'chat',
          summary: 'Added a lookup tool.',
          target: { kind: 'spec' },
        },
        {
          timestamp: '2026-07-24T23:00:00.000Z',
          source: 'manual',
          summary: 'Updated layout for agents.assistant',
          target: { kind: 'design', resourceType: 'agents', resourceId: 'assistant' },
        },
      ],
    });

    render(<AuditPanel />);

    const list = await screen.findByLabelText('Audit entries');
    expect(list).toHaveTextContent('chat');
    expect(list).toHaveTextContent('Added a lookup tool.');
    expect(list).toHaveTextContent('spec');
    expect(list).toHaveTextContent('manual');
    expect(list).toHaveTextContent('design: agents.assistant');
  });

  it('re-fetches when Refresh is clicked', async () => {
    const getAuditMock = vi.spyOn(client, 'getAudit').mockResolvedValue({ entries: [] });
    render(<AuditPanel />);
    await screen.findByText('No changes yet.');
    expect(getAuditMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Refresh'));

    await waitFor(() => expect(getAuditMock).toHaveBeenCalledTimes(2));
  });

  it('shows an error alert when the fetch fails', async () => {
    vi.spyOn(client, 'getAudit').mockRejectedValue(new Error('network error'));

    render(<AuditPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('network error');
  });
});
