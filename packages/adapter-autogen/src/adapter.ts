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
import { validateAutoGenCompatibility } from './compatibility.js';
import { generateAgentFile } from './generate-agent.js';
import { generateModelFile } from './generate-model.js';
import {
  generateEnvExample,
  generateMainFile,
  generatePyprojectToml,
  generateReadme,
} from './generate-project-files.js';
import { generateToolFile } from './generate-tool.js';
import { generateWorkflowFile, isSingleAgentWorkflow } from './generate-workflow.js';

export const AUTOGEN_ADAPTER_MANIFEST: AgentformPluginManifest = {
  name: '@agentform/adapter-autogen',
  version: '0.1.0',
  apiVersion: 'agentform.dev/v1alpha1',
  type: 'FrameworkAdapter',
  capabilities: [
    'assistant-agent',
    'user-proxy-agent',
    'team',
    'termination-conditions',
    'tool-registration',
    'multi-agent-conversation-flow',
  ],
  supportedSpecVersions: ['v1alpha1'],
};

/**
 * `@agentform/adapter-autogen`'s `FrameworkAdapter` implementation. §13.5
 * gives no explicit generated-project layout diagram (unlike OpenAI/
 * LangGraph/Microsoft) — this mirrors `@agentform/adapter-langgraph`'s
 * Python layout (`src/{agents,tools,workflows}/`, plus a `models/`
 * directory this adapter specifically needs — see `generate-model.ts`),
 * `pyproject.toml`/`.env.example`/`README.md`, plus `__init__.py` files in
 * every package directory (Python relative imports require it). Writing
 * files to disk is the CLI's job — this only ever builds and returns them.
 */
export const autoGenAdapter: FrameworkAdapter = {
  manifest: AUTOGEN_ADAPTER_MANIFEST,

  async validateCompatibility(ir: AgentformIR): Promise<CompatibilityReport> {
    return validateAutoGenCompatibility(ir);
  },

  async generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject> {
    const files: GeneratedFile[] = [];

    files.push({ path: 'src/__init__.py', content: '' });
    files.push({ path: 'src/agents/__init__.py', content: '' });
    files.push({ path: 'src/tools/__init__.py', content: '' });
    files.push({ path: 'src/models/__init__.py', content: '' });
    files.push({ path: 'src/workflows/__init__.py', content: '' });

    for (const [id, model] of ir.models) {
      files.push({
        path: `src/models/${toIdentifier(id)}.py`,
        content: generateModelFile(id, model),
        sourceResourceAddresses: [resourceAddress('model', id)],
      });
    }

    for (const [id, agent] of ir.agents) {
      files.push({
        path: `src/agents/${toIdentifier(id)}.py`,
        content: generateAgentFile(id, agent, ir),
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

    const workflowSummaries = [...ir.workflows.entries()].map(([id, workflow]) => ({
      id,
      isSingleAgent: isSingleAgentWorkflow(workflow),
    }));
    for (const [id, workflow] of ir.workflows) {
      files.push({
        path: `src/workflows/${toIdentifier(id)}.py`,
        content: generateWorkflowFile(id, workflow),
        sourceResourceAddresses: [resourceAddress('workflow', id)],
      });
    }

    files.push({ path: 'src/main.py', content: generateMainFile(workflowSummaries) });
    files.push({ path: 'pyproject.toml', content: generatePyprojectToml(ir) });
    files.push({ path: '.env.example', content: generateEnvExample(ir) });
    files.push({ path: 'README.md', content: generateReadme(ir) });

    const manifest = buildManifest({
      adapter: AUTOGEN_ADAPTER_MANIFEST,
      agentformVersion: context.agentformVersion,
      specVersion: 'v1alpha1',
      sourceHash: context.sourceHash ?? ir.contentHash,
      irHash: ir.contentHash,
    });

    return { target: 'autogen', files, manifest };
  },
};
