import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import { useChatStore } from '../../chatStore';

export class CreateArtifactTool implements AIToolHandler {
  name = 'create_artifact';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    let { title, type, content, identifier } = actionObj;
    if (!type) {
      type = 'markdown';
    }
    if (!content) {
      return { feedbackError: 'Missing required parameter: content is required.' };
    }

    try {
      const artifactId = identifier || crypto.randomUUID();
      const now = new Date().toISOString();
      
      let oldArtifact = null;
      if (identifier) {
        const artifacts = await api.getArtifacts();
        oldArtifact = artifacts.find(a => a.id === identifier);
      }

      const newArtifact = {
        id: artifactId,
        type: type as 'skill' | 'markdown' | 'spreadsheet',
        title: title || oldArtifact?.title || 'Untitled Document',
        content,
        createdAt: oldArtifact?.createdAt || now,
        updatedAt: now,
      };

      await api.putArtifact(newArtifact);

      // Set it as active so the user sees it immediately
      useChatStore.getState().setActiveArtifact(newArtifact);

      return {
        systemResultsMsg: `Successfully created artifact '${title}' with ID: ${artifactId}.`,
        actionResult: { action: 'create_artifact', artifactId, title, type },
        data: { artifactId }
      };
    } catch (e: any) {
      return { feedbackError: `Error creating artifact: ${e.message}` };
    }
  }
}
