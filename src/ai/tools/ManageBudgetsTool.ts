import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import type { Budget } from '../../types';

export class ManageBudgetsTool implements AIToolHandler {
  name = 'manage_budgets';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    if (actionObj.confirmed !== true && actionObj.action !== 'get') {
      return { 
        feedbackError: 'SECURITY EXCEPTION: You attempted to modify a budget without user confirmation. You MUST call the `request_user_confirmation` tool first. Only after the user confirms should you call this tool again with `confirmed: true`.' 
      };
    }

    const { action, budgetData } = actionObj;

    if (action === 'get') {
      const budgets = await api.getBudgets();
      return {
        actionResult: { action: 'get_budgets' },
        data: { budgets }
      };
    }

    if (action === 'put') {
      if (!budgetData || !budgetData.category || typeof budgetData.monthlyAmount !== 'number') {
        return { feedbackError: 'Missing required budget fields (category, monthlyAmount)' };
      }
      
      const budget: Budget = {
        category: budgetData.category,
        monthlyAmount: budgetData.monthlyAmount,
        userSet: true
      };
      
      await api.putBudget(budget);
      return {
        actionResult: { action: 'put_budget', category: budget.category },
      };
    }

    return { feedbackError: 'Invalid action. Must be get or put.' };
  }
}
