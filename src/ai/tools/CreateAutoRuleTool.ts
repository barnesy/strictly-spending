import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import type { CategoryRule } from '../../types';

export class CreateAutoRuleTool implements AIToolHandler {
  name = 'create_auto_rule';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    if (actionObj.confirmed !== true) {
      return { 
        feedbackError: 'SECURITY EXCEPTION: You attempted to create an auto-categorization rule without user confirmation. You MUST call the `request_user_confirmation` tool first. Only after the user confirms should you call this tool again with `confirmed: true`.' 
      };
    }

    const { pattern, category, priority } = actionObj;

    if (!pattern || !category) {
      return { feedbackError: 'Missing required fields (pattern, category)' };
    }

    const newRule: CategoryRule = {
      pattern,
      category,
      priority: typeof priority === 'number' ? priority : 50,
      createdAt: new Date().toISOString()
    };

    const newId = await api.addRule(newRule);

    return {
      actionResult: { action: 'create_auto_rule', id: newId, pattern, category },
      data: { createdRule: { ...newRule, id: newId } }
    };
  }
}
