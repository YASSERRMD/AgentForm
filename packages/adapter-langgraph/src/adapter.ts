import { buildManifest, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type AgentformIR } from '@agentform/ir';
import type {
  AgentformPluginManifest,
  CompatibilityReport,
  FrameworkAdapter,
  GeneratedFile,
  GeneratedProject,
  GenerationContext,
} from '@agentform/plugin-sdk';
import { validateLangGraphCompatibility } from './compatibility.js';
import { generateAgentFile } from './generate-agent.js';
import { generateEnvExample, generateMainFile, generatePyprojectToml, generateReadme } from './generate-project-files.js';
import { generateStateFile } from './generate-state.js';
import { generateToolFile } from './generate-tool.js';
import { generateWorkflowFile } from './generate-workflow.js';

export const LANGGRAPH_ADAPTER_MANIFEST: AgentformPluginManifest = {
  name: '@agentform/adapter-langgraph',
  version: '0.1.0',
  apiVersion: 'agentform.dev/v1alpha1',
  type: 'FrameworkAdapter',
  capabilities: [
    'state-graph',
    'agent-node',
    'tool-node',
    'conditional-edge',
    'human-approval',
    'loop-limit',
    'typed-state',
  ],
  supportedSpecVersions: ['v1alpha1'],
};

/**
 * `@agentform/adapter-langgraph`'s `FrameworkAdapter` implementation. Every
 * generated file's path is relative to the project root (§13.2's layout:
 * `src/agents/`, `src/tools/`, `src/workflows/`, `src/state.py`,
 * `src/main.py`, plus `pyproject.toml`/`.env.example`/`README.md`). `__init__.py`
 * files aren't in that layout diagram but are added anyway — Python
 * relative imports (`from ..state import State`, used throughout the
 * agent/tool/workflow files) require every directory in the chain to be a
 * real package. Writing files to disk is the CLI's job — this only ever
 * builds and returns them (`compile()`, `@agentform/compiler`, scans the
 * result for secret leaks before any caller writes anything).
 */
export const langGraphAdapter: FrameworkAdapter = {
  manifest: LANGGRAPH_ADAPTER_MANIFEST,

  async validateCompatibility(ir: AgentformIR): Promise<CompatibilityReport> {
    return validateLangGraphCompatibility(ir);
  },

  async generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject> {
    const files: GeneratedFile[] = [];

    files.push({ path: 'src/__init__.py', content: '' });
    files.push({ path: 'src/agents/__init__.py', content: '' });
    files.push({ path: 'src/tools/__init__.py', content: '' });
    files.push({ path: 'src/workflows/__init__.py', content: '' });

    files.push({ path: 'src/state.py', content: generateStateFile(ir) });

    for (const [id, agent] of ir.agents) {
      files.push({
        path: `src/agents/${toIdentifier(id)}.py`,
        content: generateAgentFile(id, agent),
        sourceResourceAddresses: [resourceAddress('agent', id)],
      });
    }

    for (const [id, tool] of ir.tools) {
      files.push({
        path: `src/tools/${toIdentifier(id)}.py`,
        content: generateToolFile(id, tool),
        sourceResourceAddresses: [resourceAddress('tool', id)],
      });
    }

    const workflowIds = [...ir.workflows.keys()];
    for (const [id, workflow] of ir.workflows) {
      files.push({
        path: `src/workflows/${toIdentifier(id)}.py`,
        content: generateWorkflowFile(id, workflow),
        sourceResourceAddresses: [resourceAddress('workflow', id)],
      });
    }

    files.push({ path: 'src/main.py', content: generateMainFile(workflowIds) });
    files.push({ path: 'pyproject.toml', content: generatePyprojectToml(ir) });
    files.push({ path: '.env.example', content: generateEnvExample(ir) });
    files.push({ path: 'README.md', content: generateReadme(ir) });

    const manifest = buildManifest({
      adapter: LANGGRAPH_ADAPTER_MANIFEST,
      agentformVersion: context.agentformVersion,
      specVersion: 'v1alpha1',
      sourceHash: context.sourceHash ?? ir.contentHash,
      irHash: ir.contentHash,
    });

    return { target: 'langgraph', files, manifest };
  },
};
