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
import { validateCrewAiCompatibility } from './compatibility.js';
import { generateAgentFile } from './generate-agent.js';
import {
  generateEnvExample,
  generateMainFile,
  generatePyprojectToml,
  generateReadme,
} from './generate-project-files.js';
import { generateToolFile } from './generate-tool.js';
import { generateWorkflowFile } from './generate-workflow.js';

export const CREWAI_ADAPTER_MANIFEST: AgentformPluginManifest = {
  name: '@agentform/adapter-crewai',
  version: '0.1.0',
  apiVersion: 'agentform.dev/v1alpha1',
  type: 'FrameworkAdapter',
  capabilities: ['role-based-agents', 'sequential-tasks', 'tool-registration', 'delegation'],
  supportedSpecVersions: ['v1alpha1'],
};

/**
 * `@agentform/adapter-crewai`'s `FrameworkAdapter` implementation. §13.6
 * gives no explicit generated-project layout diagram (unlike OpenAI/
 * LangGraph/Microsoft) — this mirrors every other Python adapter's layout
 * (`src/{agents,tools,workflows}/`), `pyproject.toml`/`.env.example`/
 * `README.md`, plus `__init__.py` files in every package directory (Python
 * relative imports require it). No `models/` directory, unlike
 * `@agentform/adapter-autogen`: like ADK, CrewAI's `llm` field is a plain
 * string, not an object needing its own stub-factory file. Writing files
 * to disk is the CLI's job — this only ever builds and returns them.
 */
export const crewAiAdapter: FrameworkAdapter = {
  manifest: CREWAI_ADAPTER_MANIFEST,

  async validateCompatibility(ir: AgentformIR): Promise<CompatibilityReport> {
    return validateCrewAiCompatibility(ir);
  },

  async generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject> {
    const files: GeneratedFile[] = [];

    files.push({ path: 'src/__init__.py', content: '' });
    files.push({ path: 'src/agents/__init__.py', content: '' });
    files.push({ path: 'src/tools/__init__.py', content: '' });
    files.push({ path: 'src/workflows/__init__.py', content: '' });

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

    const workflowIds = [...ir.workflows.keys()];
    for (const [id, workflow] of ir.workflows) {
      files.push({
        path: `src/workflows/${toIdentifier(id)}.py`,
        content: generateWorkflowFile(id, workflow, ir),
        sourceResourceAddresses: [resourceAddress('workflow', id)],
      });
    }

    files.push({
      path: 'src/main.py',
      content: generateMainFile(workflowIds.map((id) => ({ id }))),
    });
    files.push({ path: 'pyproject.toml', content: generatePyprojectToml(ir) });
    files.push({ path: '.env.example', content: generateEnvExample(ir) });
    files.push({ path: 'README.md', content: generateReadme(ir) });

    const manifest = buildManifest({
      adapter: CREWAI_ADAPTER_MANIFEST,
      agentformVersion: context.agentformVersion,
      specVersion: 'v1alpha1',
      sourceHash: context.sourceHash ?? ir.contentHash,
      irHash: ir.contentHash,
    });

    return { target: 'crewai', files, manifest };
  },
};
