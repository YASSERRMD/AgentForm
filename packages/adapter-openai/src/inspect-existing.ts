import { slugifyIdentifier, walkSourceFiles } from '@agentform/core';
import type { ImportCandidate, ImportContext, ImportInspection } from '@agentform/plugin-sdk';

const SOURCE_EXTENSIONS = ['.py', '.ts', '.tsx', '.js', '.jsx'];

/** Any one of these appearing anywhere in a scanned file is enough to say "this project uses the OpenAI Agents SDK" — deliberately loose (an import line, not a specific API call), since the goal here is only "is it worth trying," not "is it definitely this framework." */
const RECOGNITION_SIGNALS = [
  /from\s+agents\s+import/,
  /^\s*import\s+agents\b/m,
  /from\s+['"]@openai\/agents['"]/,
  /require\(\s*['"]@openai\/agents['"]\s*\)/,
];

/** `Agent(` not immediately preceded by an identifier character — excludes `class TriageAgent(Agent):`'s inheritance-list paren (preceded by "Triage") while still matching both `new Agent(` (TS) and bare `Agent(` (Python). */
const AGENT_CALL_SITE = /(?<![A-Za-z0-9_])Agent\s*\(/g;
const TOOL_CALL_SITE = /(?<![A-Za-z0-9_])tool\s*\(/g;
const PY_FUNCTION_TOOL = /@function_tool[^\n]*\n\s*(?:async\s+)?def\s+(\w+)\s*\(/g;

/**
 * Finds the text between `text[openParenIndex]` (assumed to be `(`) and
 * its matching `)`, skipping over quoted-string contents (so a `)`
 * inside an instructions string doesn't end the block early). Only
 * `(`/`)` depth is tracked — any `{}`/`[]` nested inside naturally
 * balances on its own before the matching `)` is reached, so tracking
 * every bracket type isn't necessary to find where one call expression
 * ends.
 */
function extractBalancedCall(text: string, openParenIndex: number): string | undefined {
  let depth = 0;
  let quote: string | undefined;
  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i++;
      } else if (ch === quote) {
        quote = undefined;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return text.slice(openParenIndex + 1, i);
      }
    }
  }
  return undefined;
}

function firstStringField(block: string, field: string): string | undefined {
  const match = new RegExp(`\\b${field}\\s*[:=]\\s*['"]([^'"]*)['"]`).exec(block);
  return match?.[1];
}

interface RecognizedAgent {
  readonly name?: string;
  readonly instructions?: string;
  readonly model?: string;
}

function findAgentBlocks(content: string): readonly RecognizedAgent[] {
  const agents: RecognizedAgent[] = [];
  for (const match of content.matchAll(AGENT_CALL_SITE)) {
    const openParenIndex = (match.index ?? 0) + match[0].length - 1;
    const block = extractBalancedCall(content, openParenIndex);
    if (block === undefined) {
      continue;
    }
    agents.push({
      name: firstStringField(block, 'name'),
      instructions: firstStringField(block, 'instructions'),
      model: firstStringField(block, 'model'),
    });
  }
  return agents;
}

function findToolNames(content: string): readonly string[] {
  const names: string[] = [];
  for (const match of content.matchAll(TOOL_CALL_SITE)) {
    const openParenIndex = (match.index ?? 0) + match[0].length - 1;
    const block = extractBalancedCall(content, openParenIndex);
    const name = block ? firstStringField(block, 'name') : undefined;
    if (name) {
      names.push(name);
    }
  }
  for (const match of content.matchAll(PY_FUNCTION_TOOL)) {
    if (match[1]) {
      names.push(match[1]);
    }
  }
  return names;
}

/**
 * Limited, heuristic recognition of a raw OpenAI Agents SDK project
 * (§15.12's initial import scope) — regex-based source scanning, not a
 * real Python/TypeScript parser, so it only ever recovers what a
 * `new Agent({...})`/`Agent(...)` call spells out as a literal string
 * argument. Anything computed at runtime (an f-string, a template
 * literal, a variable, a value built in a loop) is invisible to it. This
 * is a deliberate scope choice, not an oversight — §15.12 "never claim
 * perfect reverse engineering."
 */
export async function inspectOpenAiAgentsProject(
  context: ImportContext,
): Promise<ImportInspection> {
  const files = walkSourceFiles(context.rootDir, { extensions: SOURCE_EXTENSIONS });
  const recognized = files.some((file) =>
    RECOGNITION_SIGNALS.some((signal) => signal.test(file.content)),
  );
  if (!recognized) {
    return { recognized: false, candidates: [], unsupportedConstructs: [], manualActions: [] };
  }

  const candidates: ImportCandidate[] = [];
  const seenAddresses = new Set<string>();

  function addCandidate(candidate: ImportCandidate): void {
    if (seenAddresses.has(candidate.resourceAddress)) {
      return;
    }
    seenAddresses.add(candidate.resourceAddress);
    candidates.push(candidate);
  }

  let anonymousAgentCount = 0;
  let anonymousToolCount = 0;

  for (const file of files) {
    for (const agent of findAgentBlocks(file.content)) {
      anonymousAgentCount += 1;
      const agentId = slugifyIdentifier(agent.name ?? 'agent', `agent_${anonymousAgentCount}`);
      let modelId: string | undefined;
      if (agent.model) {
        modelId = slugifyIdentifier(agent.model, 'model_primary');
        addCandidate({
          resourceAddress: `model.${modelId}`,
          kind: 'model',
          value: { provider: 'openai', model: agent.model },
          confidence: 0.4,
          detail: `Model name "${agent.model}" recovered from ${file.path}; provider assumed "openai" and not verified against the source.`,
        });
      }
      addCandidate({
        resourceAddress: `agent.${agentId}`,
        kind: 'agent',
        value: {
          role: 'assistant',
          instructions: {
            text:
              agent.instructions ??
              'TODO: instructions were not recovered from source — fill in manually.',
          },
          ...(modelId ? { model: modelId } : {}),
        },
        confidence: agent.name && agent.instructions ? 0.5 : 0.3,
        detail: `Recognized an Agent(...) call in ${file.path}${agent.name ? ` (name: "${agent.name}")` : ' (no literal name argument found)'}.`,
      });
    }

    for (const toolName of findToolNames(file.content)) {
      anonymousToolCount += 1;
      const toolId = slugifyIdentifier(toolName, `tool_${anonymousToolCount}`);
      addCandidate({
        resourceAddress: `tool.${toolId}`,
        kind: 'tool',
        value: { type: 'function', handler: 'TODO: point this at your tool implementation' },
        confidence: 0.3,
        detail: `Recognized a tool function named "${toolName}" in ${file.path}; its parameters and implementation were not translated.`,
      });
    }
  }

  return {
    recognized: true,
    candidates,
    unsupportedConstructs: [
      'Tool implementation logic and parameter/return schemas were not translated — only tool names were recognized.',
      'Agent handoffs/delegation, guardrails, and structured output (outputType) schemas were not reconstructed.',
      'Orchestration logic (Runner.run call sites, loops, conditional branching) was not translated into an Agentform workflow graph.',
    ],
    manualActions: [
      'Review every recovered instructions string against the original source — only a literal string argument could be recovered; f-strings, template literals, and concatenated/multi-line strings were not.',
      "Fill in each tool's inputSchema/outputSchema and sideEffect classification by hand — import never recovers these.",
      'Add a workflow wiring the recovered agents together — Agentform requires an explicit workflow graph, which the OpenAI Agents SDK does not expose directly.',
      'Run "agentform validate" and resolve whatever the schema/semantic checks flag before relying on this candidate specification.',
    ],
  };
}
