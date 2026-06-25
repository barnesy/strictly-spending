import { AGENT_TOOLS } from './ai/architecture';

export interface AITool {
  name: string;
  description: string;
}

export const AVAILABLE_TOOLS: AITool[] = AGENT_TOOLS.map(t => ({
  name: t.name,
  description: t.desc
}));

export function getToolsXmlBlock(): string {
  const toolsList = AVAILABLE_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n');
  return `<allowed_actions>\n${toolsList}\n</allowed_actions>`;
}
