import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import type { Loan } from '../../types';

export class ManageLoansTool implements AIToolHandler {
  name = 'manage_loans';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    if (actionObj.confirmed !== true && !['get', 'create'].includes(actionObj.action)) {
      return { 
        feedbackError: 'SECURITY EXCEPTION: You attempted to modify a loan without user confirmation. You MUST call the `request_user_confirmation` tool first. Only after the user confirms should you call this tool again with `confirmed: true`.' 
      };
    }

    let { action, loanId, loanData } = actionObj;

    if (action === 'get') {
      const loans = await api.getLoans();
      return {
        actionResult: { action: 'get_loans' },
        systemResultsMsg: `Loans data:\n${JSON.stringify(loans, null, 2)}`
      };
    }

    if (action === 'create') {
      loanData = loanData || {};
      loanData.name = loanData.name || 'New Loan';
      loanData.type = loanData.type || 'house';
      loanData.principal = loanData.principal ?? 0;
      loanData.rate = loanData.rate ?? 6.5;
      loanData.termYears = loanData.termYears ?? 30;
      loanData.startDate = loanData.startDate || new Date().toISOString().split('T')[0];
      loanData.category = loanData.category || 'Debt';

      if (!loanData.createdAt) {
        loanData.createdAt = new Date().toISOString();
      }
      const newId = await api.addLoan(loanData as Loan);
      return {
        actionResult: { action: 'create_loan', id: newId, title: loanData.name },
      };
    }

    if (action === 'update') {
      if (typeof loanId !== 'number' || !loanData) {
        return { feedbackError: 'Missing loanId (must be number) or loanData for update' };
      }
      await api.updateLoan(loanId, loanData as Loan);
      return {
        actionResult: { action: 'update_loan', id: loanId },
      };
    }
    
    if (action === 'delete') {
      if (typeof loanId !== 'number') return { feedbackError: 'Missing loanId for delete' };
      await api.deleteLoan(loanId);
      return {
        actionResult: { action: 'delete_loan', id: loanId }
      };
    }

    return { feedbackError: 'Invalid action. Must be create, update, delete, or get.' };
  }
}
