import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';

export class ReadArtifactTool implements AIToolHandler {
  name = 'read_artifact';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const { id } = actionObj;

    if (!id) {
      return { feedbackError: 'Missing required parameter: id' };
    }

    try {
      const artifacts = await api.getArtifacts();
      let artifact = artifacts.find(a => a.id === id);

      if (!artifact) {
        const searchLower = id.toLowerCase();
        artifact = artifacts.find(a => a.title.toLowerCase() === searchLower);
        
        if (!artifact) {
          const matches = artifacts.filter(a => a.title.toLowerCase().includes(searchLower));
          if (matches.length === 1) {
            artifact = matches[0];
          } else if (matches.length > 1) {
            return { feedbackError: `Multiple artifacts match '${id}'. Please be more specific. Matches: ${matches.map(m => `ID: ${m.id} (Title: ${m.title})`).join(', ')}` };
          }
        }
      }

      if (!artifact) {
         return { feedbackError: `Artifact with ID or Title matching '${id}' not found.` };
      }

      return {
        systemResultsMsg: `Artifact Content for ID '${id}' (${artifact.title}):\n\n${artifact.content}`,
        actionResult: { action: 'read_artifact', id }
      };
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { feedbackError: `Error reading artifact: ${errMsg}` };
    }
  }
}
