import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';

export class UpdateDeductionStatusTool implements AIToolHandler {
  name = 'update_deduction_status';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const isBusiness = actionObj.isBusiness;
    const taxCategory = actionObj.taxCategory;
    const deductionStatus = actionObj.deductionStatus || 'confirmed';
    const filter = actionObj.filter || {};

    if (actionObj.confirmed !== true) {
      return { 
        feedbackError: 'SECURITY EXCEPTION: You attempted to modify financial records without user confirmation. You MUST call the `request_user_confirmation` tool first. Only after the user confirms should you call this tool again with `confirmed: true`.' 
      };
    }

    let updatedCount = 0;
    const txns = await api.getTransactions();
    const matched = txns.filter(t => {
      if (filter.transactionId && t.id !== filter.transactionId) return false;
      if (filter.accountId && t.accountId !== filter.accountId) return false;
      if (filter.category && t.category !== filter.category) return false;
      if (filter.search && !t.description.toLowerCase().includes(filter.search.toLowerCase())) return false;
      return true;
    });

    const updates: Record<string, any> = {};
    if (isBusiness !== undefined) updates.isBusiness = isBusiness;
    if (taxCategory !== undefined) updates.taxCategory = taxCategory;
    if (isBusiness === false) updates.taxCategory = null; // Clear category if not business
    updates.deductionStatus = deductionStatus;

    if (matched.length > 0) {
      const toUpdate = matched.map((t) => ({ ...t, ...updates }));
      await api.bulkUpdateTransactions(toUpdate);
      updatedCount = matched.length;
    }

    return {
      actionResult: { action: 'update_deduction_status', updatedCount }
    };
  }
}
