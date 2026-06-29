import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import { useChatStore } from '../../chatStore';

export class CreateArtifactTool implements AIToolHandler {
  name = 'create_artifact';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    let { title, type, content, identifier, summary, associatedChecklistId } = actionObj;
    if (!type) {
      type = 'markdown';
    }
    if (!content) {
      return { feedbackError: 'Missing required parameter: content is required.' };
    }

    try {
      const artifactId = identifier || `art_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();
      
      let oldArtifact = null;
      if (identifier) {
        const artifacts = await api.getArtifacts();
        oldArtifact = artifacts.find(a => a.id === identifier);
      }

      // VULNERABILITY PATCH: Prevent HITL bypass.
      if (oldArtifact) {
        return { 
          feedbackError: 'SECURITY EXCEPTION: Artifact already exists. You must use the `update_artifact` tool to modify it, which requires explicit user confirmation.' 
        };
      }

      const newArtifact = {
        id: artifactId,
        type: type as 'skill' | 'markdown' | 'spreadsheet',
        title: title || 'Untitled Document',
        content,
        summary,
        associatedChecklistId,
        createdAt: now,
        updatedAt: now,
      };

      await api.putArtifact(newArtifact);

      if (associatedChecklistId) {
        try {
          const currentSettings = await api.getSetting<any>('app:taxSettings');
          if (currentSettings) {
            const checklist = currentSettings.checklist || {};
            await api.putSetting('app:taxSettings', {
              ...currentSettings,
              checklist: { ...checklist, [associatedChecklistId]: true }
            });
            // Also invalidate queries so the Tax page re-renders the green checkmark
            const { queryClient } = await import('../../queryClient');
            queryClient.invalidateQueries({ queryKey: ['settings'] });
          }
        } catch (err) {
          console.error('Failed to link artifact to tax checklist:', err);
        }
      }

      // Set it as active so the user sees it immediately
      useChatStore.getState().setActiveArtifact(newArtifact);

      return {
        systemResultsMsg: `Successfully created artifact '${title}' with ID: ${artifactId}.`,
        actionResult: { action: 'create_artifact', artifactId, title, type },
        data: { artifactId }
      };
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { feedbackError: `Error creating artifact: ${errMsg}` };
    }
  }
}
