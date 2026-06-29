import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import { useChatStore } from '../../chatStore';

export class UpdateArtifactTool implements AIToolHandler {
  name = 'update_artifact';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const { id, content, confirmed, summary } = actionObj;
    if (!id || !content) {
      return { feedbackError: 'Missing required parameters: id and content are required.' };
    }
    
    if (confirmed !== true) {
      return { 
        feedbackError: 'SECURITY EXCEPTION: You attempted to overwrite an artifact without user confirmation. You MUST call the `request_user_confirmation` tool first to ask the user if they want to proceed with the artifact update. Only after the user confirms should you call this tool again with `confirmed: true`.' 
      };
    }

    try {
      // We need to fetch the existing artifact to preserve its title and type
      const existingArtifacts = await api.getArtifacts();
      const existing = existingArtifacts.find(a => a.id === id);

      if (!existing) {
        return { feedbackError: `Artifact with ID ${id} not found.` };
      }

      const updatedArtifact = {
        ...existing,
        content,
        summary: summary !== undefined ? summary : existing.summary,
        updatedAt: new Date().toISOString(),
      };

      await api.putArtifact(updatedArtifact);

      // Set it as active so the user sees it immediately
      useChatStore.getState().setActiveArtifact(updatedArtifact);

      return {
        systemResultsMsg: `Successfully updated artifact '${existing.title}'.`,
        actionResult: { action: 'update_artifact', artifactId: id },
        data: { artifactId: id }
      };
    } catch (e: any) {
      return { feedbackError: `Error updating artifact: ${e.message}` };
    }
  }
}
