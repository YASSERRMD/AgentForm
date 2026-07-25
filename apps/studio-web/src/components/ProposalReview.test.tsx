import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProposalReview } from './ProposalReview';

describe('ProposalReview', () => {
  it('renders a summary, impact signal, changes, and diagnostics together', () => {
    render(
      <ProposalReview
        ariaLabel="Proposal"
        summary="Added a lookup tool."
        changes={[{ description: 'add spec.tools.lookup' }]}
        impact="low"
        diagnostics={[{ code: 'AGF3001', severity: 'error', message: 'Unknown model reference.' }]}
        canAccept={false}
        acceptBusy={false}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    const proposal = screen.getByLabelText('Proposal');
    expect(within(proposal).getByText('Added a lookup tool.')).toBeInTheDocument();
    expect(within(proposal).getByText('low')).toBeInTheDocument();
    expect(within(proposal).getByText('add spec.tools.lookup')).toBeInTheDocument();
    expect(within(proposal).getByText('Unknown model reference.')).toBeInTheDocument();
  });

  it('omits the impact line entirely when no impact is given', () => {
    render(
      <ProposalReview
        ariaLabel="Layout proposal"
        diagnostics={[]}
        canAccept
        acceptBusy={false}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Impact:/)).not.toBeInTheDocument();
  });

  it('shows skipped resources with their reason', () => {
    render(
      <ProposalReview
        ariaLabel="Proposal"
        skipped={[{ resourceType: 'models', resourceId: 'primary', reason: 'already exists' }]}
        diagnostics={[]}
        canAccept={false}
        acceptBusy={false}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText('models.primary: already exists')).toBeInTheDocument();
  });

  it('disables Accept when canAccept is false, and calls onAccept when enabled and clicked', () => {
    const onAccept = vi.fn();
    const { rerender } = render(
      <ProposalReview
        ariaLabel="Proposal"
        diagnostics={[]}
        canAccept={false}
        acceptBusy={false}
        onAccept={onAccept}
        onReject={vi.fn()}
      />,
    );
    expect(screen.getByText('Accept')).toBeDisabled();

    rerender(
      <ProposalReview
        ariaLabel="Proposal"
        diagnostics={[]}
        canAccept
        acceptBusy={false}
        onAccept={onAccept}
        onReject={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('shows "Applying…" and disables Reject while acceptBusy', () => {
    render(
      <ProposalReview
        ariaLabel="Proposal"
        diagnostics={[]}
        canAccept
        acceptBusy
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText('Applying…')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeDisabled();
  });

  it('calls onReject when Reject is clicked', () => {
    const onReject = vi.fn();
    render(
      <ProposalReview
        ariaLabel="Proposal"
        diagnostics={[]}
        canAccept={false}
        acceptBusy={false}
        onAccept={vi.fn()}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByText('Reject'));
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});
