import { commonFiles, readme, type ProjectTemplate, type TemplateContext } from './types.js';

export const basicAgentTemplate: ProjectTemplate = {
  id: 'basic',
  title: 'Basic assistant',
  description:
    'A single agent with no tools and no workflow branching — the smallest valid Agentform project.',
  files(context: TemplateContext) {
    const agentform = [
      'apiVersion: agentform.dev/v1alpha1',
      'kind: AgenticApplication',
      '',
      'metadata:',
      `  name: ${context.name}`,
      '  version: 1.0.0',
      '  description: A minimal single-agent assistant with no tools.',
      '',
      'spec:',
      '  runtime:',
      `    target: ${context.target}`,
      '    environment: development',
      '',
      '  models:',
      '    primary:',
      '      provider: openai',
      '      model: gpt-5',
      '      temperature: 0',
      '',
      '  agents:',
      '    assistant:',
      '      model: primary',
      '      role: assistant',
      '      instructions:',
      '        text: You are a helpful, concise assistant. Answer only from what the user provides.',
      '      limits:',
      '        maxSteps: 4',
      '        timeout: 15s',
      '        maxCostUsd: 0.05',
      '',
      '  workflows:',
      '    main:',
      '      entrypoint: assistant',
      '      nodes:',
      '        assistant:',
      '          type: agent',
      '          agent: assistant',
      '',
    ].join('\n');

    return {
      ...commonFiles(basicAgentTemplate),
      'agentform.yaml': agentform,
      'README.md': readme(context, basicAgentTemplate),
    };
  },
};
