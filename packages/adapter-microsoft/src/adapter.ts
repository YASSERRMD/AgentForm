import { buildManifest, toPascalCase } from '@agentform/compiler';
import { resourceAddress, type AgentformIR } from '@agentform/ir';
import type {
  AgentformPluginManifest,
  CompatibilityReport,
  FrameworkAdapter,
  GeneratedFile,
  GeneratedProject,
  GenerationContext,
} from '@agentform/plugin-sdk';
import { validateMicrosoftCompatibility } from './compatibility.js';
import { generateAgentFile } from './generate-agent.js';
import { generateModelFile } from './generate-model.js';
import {
  generateCsproj,
  generateEnvExample,
  generateProgramFile,
  generateReadme,
} from './generate-project-files.js';
import { generateToolFile } from './generate-tool.js';
import { generateWorkflowFile, isSingleAgentWorkflow } from './generate-workflow.js';

export const MICROSOFT_ADAPTER_MANIFEST: AgentformPluginManifest = {
  name: '@agentform/adapter-microsoft',
  version: '0.1.0',
  apiVersion: 'agentform.dev/v1alpha1',
  type: 'FrameworkAdapter',
  capabilities: [
    'chat-client-agents',
    'handoff-workflows',
    'sequential-workflows',
    'tool-registration',
  ],
  supportedSpecVersions: ['v1alpha1'],
};

/**
 * `@agentform/adapter-microsoft`'s `FrameworkAdapter` implementation — the
 * only C#-targeting adapter among Phase 9's four (§4's other five targets
 * are TypeScript or Python). Layout mirrors the Python adapters'
 * `src/{agents,tools,models,workflows}/` convention, translated to C#
 * idiom: `PascalCase` directories and file names matching each generated
 * class name, a top-level `.csproj` (the C# analog of `pyproject.toml`),
 * and a top-level-statements `Program.cs` (the analog of `src/main.py`) —
 * no `__init__.py` equivalents, since C# namespaces need no per-directory
 * marker file the way Python packages do. Writing files to disk is the
 * CLI's job — this only ever builds and returns them.
 */
export const microsoftAdapter: FrameworkAdapter = {
  manifest: MICROSOFT_ADAPTER_MANIFEST,

  async validateCompatibility(ir: AgentformIR): Promise<CompatibilityReport> {
    return validateMicrosoftCompatibility(ir);
  },

  async generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject> {
    const files: GeneratedFile[] = [];

    for (const [id, model] of ir.models) {
      files.push({
        path: `Models/${toPascalCase(id)}Model.cs`,
        content: generateModelFile(id, model),
        sourceResourceAddresses: [resourceAddress('model', id)],
      });
    }

    for (const [id, agent] of ir.agents) {
      files.push({
        path: `Agents/${toPascalCase(id)}Agent.cs`,
        content: generateAgentFile(id, agent, ir),
        sourceResourceAddresses: [resourceAddress('agent', id)],
      });
    }

    for (const [id, tool] of ir.tools) {
      files.push({
        path: `Tools/${toPascalCase(id)}Tool.cs`,
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
        path: `Workflows/${toPascalCase(id)}Workflow.cs`,
        content: generateWorkflowFile(id, workflow, ir),
        sourceResourceAddresses: [resourceAddress('workflow', id)],
      });
    }

    files.push({ path: 'Program.cs', content: generateProgramFile(workflowSummaries) });
    files.push({
      path: `${toPascalCase(ir.application.name)}.csproj`,
      content: generateCsproj(ir),
    });
    files.push({ path: '.env.example', content: generateEnvExample(ir) });
    files.push({ path: 'README.md', content: generateReadme(ir) });

    const manifest = buildManifest({
      adapter: MICROSOFT_ADAPTER_MANIFEST,
      agentformVersion: context.agentformVersion,
      specVersion: 'v1alpha1',
      sourceHash: context.sourceHash ?? ir.contentHash,
      irHash: ir.contentHash,
    });

    return { target: 'microsoft', files, manifest };
  },
};
