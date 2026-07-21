import { buildManifest, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type AgentformIR } from '@agentform/ir';
import type {
  AgentformPluginManifest,
  CompatibilityReport,
  FrameworkAdapter,
  GeneratedFile,
  GeneratedProject,
  GenerationContext,
  ImportContext,
  ImportInspection,
} from '@agentform/plugin-sdk';
import { validateOpenAiCompatibility } from './compatibility.js';
import { generateAgentFile } from './generate-agent.js';
import { generateGuardrailsFile } from './generate-guardrails.js';
import {
  generateEnvExample,
  generateIndexFile,
  generateObservabilityStub,
  generatePackageJson,
  generateReadme,
  generateTsconfig,
  generateWorkflowsIndexFile,
} from './generate-project-files.js';
import { generateToolFile } from './generate-tool.js';
import { generateWorkflowFile } from './generate-workflow.js';
import { inspectOpenAiAgentsProject } from './inspect-existing.js';

export const OPENAI_ADAPTER_MANIFEST: AgentformPluginManifest = {
  name: '@agentform/adapter-openai',
  version: '0.1.0',
  apiVersion: 'agentform.dev/v1alpha1',
  type: 'FrameworkAdapter',
  capabilities: [
    'agent',
    'tool',
    'handoff',
    'structured-output',
    'guardrails',
    'basic-multi-agent-workflow',
  ],
  supportedSpecVersions: ['v1alpha1'],
};

/**
 * `@agentform/adapter-openai`'s `FrameworkAdapter` implementation. Every
 * generated file's path is relative to the project root (§13.1's layout:
 * `src/agents/`, `src/tools/`, `src/workflows/`, `src/policies/`,
 * `src/observability/`, `src/index.ts`, plus `package.json`/`tsconfig.json`/
 * `.env.example`/`README.md`). Writing these to disk is the CLI's job —
 * this only ever builds and returns them (`compile()`, `@agentform/compiler`,
 * scans the result for secret leaks before any caller writes anything).
 */
export const openAiAdapter: FrameworkAdapter = {
  manifest: OPENAI_ADAPTER_MANIFEST,

  async validateCompatibility(ir: AgentformIR): Promise<CompatibilityReport> {
    return validateOpenAiCompatibility(ir);
  },

  async generate(ir: AgentformIR, context: GenerationContext): Promise<GeneratedProject> {
    const files: GeneratedFile[] = [];

    for (const [id, agent] of ir.agents) {
      files.push({
        path: `src/agents/${toIdentifier(id)}.ts`,
        content: generateAgentFile(id, agent, ir),
        sourceResourceAddresses: [resourceAddress('agent', id)],
      });
    }

    for (const [id, tool] of ir.tools) {
      files.push({
        path: `src/tools/${toIdentifier(id)}.ts`,
        content: generateToolFile(id, tool),
        sourceResourceAddresses: [resourceAddress('tool', id)],
      });
    }

    const workflowIds = [...ir.workflows.keys()];
    for (const [id, workflow] of ir.workflows) {
      files.push({
        path: `src/workflows/${toIdentifier(id)}.ts`,
        content: generateWorkflowFile(id, workflow),
        sourceResourceAddresses: [resourceAddress('workflow', id)],
      });
    }
    if (workflowIds.length > 0) {
      files.push({
        path: 'src/workflows/index.ts',
        content: generateWorkflowsIndexFile(workflowIds.map(toIdentifier)),
      });
    }

    const guardrailsFile = generateGuardrailsFile(ir);
    if (guardrailsFile) {
      files.push({ path: 'src/policies/guardrails.ts', content: guardrailsFile });
    }

    files.push({ path: 'src/observability/tracing.ts', content: generateObservabilityStub() });
    files.push({
      path: 'src/index.ts',
      content: generateIndexFile(workflowIds.map((id) => toIdentifier(`run_${id}`))),
    });
    files.push({ path: 'package.json', content: generatePackageJson(ir) });
    files.push({ path: 'tsconfig.json', content: generateTsconfig() });
    files.push({ path: '.env.example', content: generateEnvExample() });
    files.push({ path: 'README.md', content: generateReadme(ir) });

    const manifest = buildManifest({
      adapter: OPENAI_ADAPTER_MANIFEST,
      agentformVersion: context.agentformVersion,
      specVersion: 'v1alpha1',
      sourceHash: context.sourceHash ?? ir.contentHash,
      irHash: ir.contentHash,
    });

    return { target: 'openai', files, manifest };
  },

  async inspectExisting(context: ImportContext): Promise<ImportInspection> {
    return inspectOpenAiAgentsProject(context);
  },
};
