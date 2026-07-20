import { basicAgentTemplate } from './basic-agent.js';
import { governmentComplaintWorkflowTemplate } from './government-complaint-workflow.js';
import { humanApprovalWorkflowTemplate } from './human-approval-workflow.js';
import { multiAgentWorkflowTemplate } from './multi-agent-workflow.js';
import { toolUsingAgentTemplate } from './tool-using-agent.js';
import type { ProjectTemplate } from './types.js';

export const TEMPLATES: readonly ProjectTemplate[] = [
  basicAgentTemplate,
  toolUsingAgentTemplate,
  multiAgentWorkflowTemplate,
  humanApprovalWorkflowTemplate,
  governmentComplaintWorkflowTemplate,
];

export function findTemplate(id: string): ProjectTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

export type { ProjectTemplate, TemplateContext } from './types.js';
