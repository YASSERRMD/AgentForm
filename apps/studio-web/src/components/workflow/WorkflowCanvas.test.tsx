import type { AgenticApplication, Workflow } from '@agentform/studio-core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { WorkflowCanvas } from './WorkflowCanvas';

/** WorkflowCanvas is fully controlled (parent owns `value`, reacts via `onChange`) — this wrapper behaves like a real parent so tests can observe post-edit UI state, not just the raw onChange payload. */
function ControlledWorkflowCanvas({
  initialValue,
  application,
  onChange,
}: {
  readonly initialValue: unknown;
  readonly application: AgenticApplication;
  readonly onChange?: (value: Workflow) => void;
}) {
  const [value, setValue] = useState<unknown>(initialValue);
  return (
    <WorkflowCanvas
      workflowId="main"
      value={value}
      application={application}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const APPLICATION: AgenticApplication = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'development' },
    models: {},
    agents: {},
    tools: {},
    workflows: {},
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const WORKFLOW: Workflow = {
  entrypoint: 'assistant',
  nodes: {
    assistant: { type: 'agent', agent: 'assistant' },
    lookup: { type: 'tool', tool: 'lookupRecord' },
  },
  edges: [{ from: 'assistant', to: 'lookup' }],
};

describe('WorkflowCanvas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads saved canvas positions for this workflow on mount', async () => {
    const getDesignMock = vi.spyOn(client, 'getDesign').mockResolvedValue({
      design: {
        binding: { resourceType: 'workflows', resourceId: 'main' },
        designVersion: '1',
        specVersionTarget: 'sha256:aaa',
        contentHash: 'sha256:bbb',
        positions: { assistant: { x: 500, y: 500 } },
      },
    });

    render(
      <WorkflowCanvas
        workflowId="main"
        value={WORKFLOW}
        onChange={vi.fn()}
        application={APPLICATION}
      />,
    );

    await waitFor(() => expect(getDesignMock).toHaveBeenCalledWith('workflows', 'main'));
    expect(await screen.findByLabelText('Workflow node assistant')).toBeInTheDocument();
  });

  it('renders normally (auto-layout) when the design fetch fails, never blocking the editor', async () => {
    vi.spyOn(client, 'getDesign').mockRejectedValue(new Error('network error'));

    render(
      <WorkflowCanvas
        workflowId="main"
        value={WORKFLOW}
        onChange={vi.fn()}
        application={APPLICATION}
      />,
    );

    expect(await screen.findByLabelText('Workflow node assistant')).toBeInTheDocument();
  });

  it('renders every workflow node id on the canvas', async () => {
    render(
      <WorkflowCanvas
        workflowId="main"
        value={WORKFLOW}
        onChange={vi.fn()}
        application={APPLICATION}
      />,
    );

    expect(await screen.findByLabelText('Workflow node assistant')).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow node lookup')).toBeInTheDocument();
  });

  it('opens the node editor when a node is clicked, showing its own real fields', async () => {
    render(
      <WorkflowCanvas
        workflowId="main"
        value={WORKFLOW}
        onChange={vi.fn()}
        application={APPLICATION}
      />,
    );

    fireEvent.click(await screen.findByLabelText('Workflow node assistant'));

    expect(await screen.findByLabelText('Edit workflow node assistant')).toBeInTheDocument();
    expect(screen.getByDisplayValue('assistant')).toBeInTheDocument();
  });

  it('propagates a field edit made in the node editor back through onChange', async () => {
    const onChange = vi.fn();
    render(
      <WorkflowCanvas
        workflowId="main"
        value={WORKFLOW}
        onChange={onChange}
        application={APPLICATION}
      />,
    );

    fireEvent.click(await screen.findByLabelText('Workflow node assistant'));
    const agentField = await screen.findByDisplayValue('assistant');
    fireEvent.change(agentField, { target: { value: 'reviewer' } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const nextWorkflow = onChange.mock.calls.at(-1)?.[0] as Workflow;
    expect(nextWorkflow.nodes.assistant).toEqual({ type: 'agent', agent: 'reviewer' });
  });

  it('adds a new node with the chosen id and type, becoming editable immediately', async () => {
    const onChange = vi.fn();
    render(
      <ControlledWorkflowCanvas
        initialValue={WORKFLOW}
        application={APPLICATION}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('New node id'), { target: { value: 'wait' } });
    fireEvent.change(screen.getByLabelText('New node type'), { target: { value: 'delay' } });
    fireEvent.click(screen.getByText('Add node'));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const nextWorkflow = onChange.mock.calls[0]?.[0] as Workflow;
    expect(nextWorkflow.nodes.wait).toEqual({ type: 'delay', duration: '1s' });
    expect(await screen.findByLabelText('Edit workflow node wait')).toBeInTheDocument();
  });

  it('disables deleting the entrypoint node', async () => {
    render(
      <WorkflowCanvas
        workflowId="main"
        value={WORKFLOW}
        onChange={vi.fn()}
        application={APPLICATION}
      />,
    );

    fireEvent.click(await screen.findByLabelText('Workflow node assistant'));
    expect(await screen.findByText('Delete node')).toBeDisabled();
  });

  it('deletes a non-entrypoint node and its connected edges', async () => {
    const onChange = vi.fn();
    render(
      <WorkflowCanvas
        workflowId="main"
        value={WORKFLOW}
        onChange={onChange}
        application={APPLICATION}
      />,
    );

    fireEvent.click(await screen.findByLabelText('Workflow node lookup'));
    fireEvent.click(await screen.findByText('Delete node'));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const nextWorkflow = onChange.mock.calls[0]?.[0] as Workflow;
    expect(nextWorkflow.nodes.lookup).toBeUndefined();
    expect(nextWorkflow.edges).toEqual([]);
  });

  it('flags a node with an ungated destructive tool as unsafe', async () => {
    const application: AgenticApplication = {
      ...APPLICATION,
      spec: {
        ...APPLICATION.spec,
        tools: { deleteRecord: { type: 'function', handler: 'x.ts', sideEffect: 'destructive' } },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const workflow: Workflow = {
      entrypoint: 'assistant',
      nodes: {
        assistant: { type: 'agent', agent: 'assistant' },
        deleteRecord: { type: 'tool', tool: 'deleteRecord' },
      },
      edges: [{ from: 'assistant', to: 'deleteRecord' }],
    };

    render(
      <WorkflowCanvas
        workflowId="main"
        value={workflow}
        onChange={vi.fn()}
        application={application}
      />,
    );

    expect(await screen.findByText('⚠ ungated destructive tool')).toBeInTheDocument();
  });

  it('runs the real semantic validator live and shows an unreachable-node diagnostic', async () => {
    const workflow: Workflow = {
      entrypoint: 'assistant',
      nodes: {
        assistant: { type: 'agent', agent: 'assistant' },
        // Not reachable from the entrypoint — a real AGF3005 case, not a fake one.
        orphan: { type: 'terminate' },
      },
    };

    render(
      <WorkflowCanvas
        workflowId="main"
        value={workflow}
        onChange={vi.fn()}
        application={APPLICATION}
      />,
    );

    expect(await screen.findByText('AGF3005', {}, { timeout: 2000 })).toBeInTheDocument();
  });
});
