/**
 * A canned result for a mocked tool call — §17 "Mock providers must make
 * offline tests deterministic." `failCount` simulates a tool that fails a
 * fixed number of times before succeeding, letting a scenario exercise an
 * agent's real, declared `retry.maxAttempts` without any actual flakiness.
 */
export interface MockToolResult {
  readonly return?: unknown;
  readonly error?: string;
  readonly failCount?: number;
  readonly costUsd?: number;
  readonly latencyMs?: number;
}

export interface ScenarioToolCall {
  readonly tool: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

/**
 * A scenario's per-node override — the mock analog of whatever a real
 * agent/router/condition would decide at run time. Agentform has no
 * expression evaluator for workflow edge `when` conditions (every
 * framework adapter's routing-function bodies are stubs for this exact
 * reason — see `docs/compiler-reference.md`), so a node with more than one
 * outgoing edge needs `next` to say which one a test scenario takes.
 */
export interface ScenarioNodeOverride {
  readonly next?: string;
  readonly toolCalls?: readonly ScenarioToolCall[];
  readonly approve?: boolean;
  readonly output?: unknown;
}

export interface Scenario {
  readonly workflow: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly mocks?: Readonly<Record<string, MockToolResult>>;
  readonly nodes?: Readonly<Record<string, ScenarioNodeOverride>>;
  /** Safety valve against a genuinely unbounded mock run — distinct from any single loop node's own real `maxIterations`, which the engine enforces independently. */
  readonly maxSteps?: number;
}

export type ExecutionEventType =
  | 'nodeVisited'
  | 'toolCalled'
  | 'toolCallFailed'
  | 'retryAttempted'
  | 'approvalRequested'
  | 'terminated';

export interface ExecutionEvent {
  readonly type: ExecutionEventType;
  readonly nodeId?: string;
  readonly nodeType?: string;
  readonly tool?: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly result?: unknown;
  readonly approved?: boolean;
  readonly reason?: string;
}

export interface ToolCallRecord {
  readonly nodeId: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly result: unknown;
}

export interface ApprovalRequestRecord {
  readonly nodeId: string;
  readonly approved: boolean;
}

export interface ExecutionTrace {
  readonly workflow: string;
  readonly events: readonly ExecutionEvent[];
  readonly visitedNodes: readonly string[];
  readonly toolCalls: readonly ToolCallRecord[];
  readonly approvalRequests: readonly ApprovalRequestRecord[];
  readonly retryCount: number;
  readonly terminationReason?: string;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly finalOutput?: unknown;
}
