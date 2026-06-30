import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import { useChatStore } from '../../chatStore';
import {
  generateBusinessLedgerCsv,
  generateBusinessPnlCsv,
  generatePersonalDeductionsCsv,
  generateTaxSummaryMarkdown
} from '../../taxDocumentGenerator';
import type { ChatArtifact } from '../../types';

export class CompileTaxDocumentTool implements AIToolHandler {
  name = 'compile_tax_document';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const { documentType, taxYear, associatedChecklistId } = actionObj;

    if (!documentType) {
      return { feedbackError: 'Missing required parameter: documentType' };
    }
    
    const year = taxYear ? parseInt(String(taxYear), 10) : new Date().getFullYear() - 1;

    try {
      // 1. Fetch Tax Settings
      const taxSettings = await api.getSetting<any>('app:taxSettings') || {};
      const artifacts = await api.getArtifacts();
      const transactions = context.dataStore.transactions || [];
      const accounts = context.dataStore.accounts || [];

      // Categorization and Empty Ledger Warnings
      if (!actionObj.ignoreWarnings) {
        const yearTxns = transactions.filter(t => t.date.startsWith(`${year}-`));
        if (yearTxns.length === 0) {
          return { feedbackError: `No transactions found for the year ${year}. Ask the user if they still want to generate an empty document, or if they need to import transactions first. If they want to proceed, call this tool again with 'ignoreWarnings: true'.` };
        }

        const uncategorized = yearTxns.filter(t => !t.category || t.category.toLowerCase() === 'uncategorized');
        // If more than 10% are uncategorized or there are over 20 uncategorized transactions
        if (uncategorized.length > 0 && (uncategorized.length > 20 || uncategorized.length / yearTxns.length > 0.1)) {
          return { feedbackError: `Warning: ${uncategorized.length} out of ${yearTxns.length} transactions for ${year} are uncategorized. A tax document will be inaccurate. It is highly recommended to run the 'categorize_transactions' tool first to propose categories to the user. If the user explicitly wants to proceed with uncategorized data, call this tool again with 'ignoreWarnings: true'.` };
        }
      }
      
      // We don't have activeDocuments easily, so we just mock REQUIRED_DOCUMENTS minimally 
      // since generateTaxSummaryMarkdown uses it just for the checklist.
      const activeDocuments = [
        { id: 'business_pnl', label: 'Year-End Profit & Loss Statement (P&L)' },
        { id: 'business_ledger', label: 'General Ledger / Bank Statements' },
        { id: 'deduction_expense_summary', label: 'Expense Summary by Category' },
        { id: 'tax_summary', label: 'Tax Summary Report' }
      ];

      let content = '';
      let title = '';
      let type: 'markdown' | 'spreadsheet' = 'spreadsheet';

      // 2. Generate Content
      switch (documentType) {
        case 'business_pnl':
          content = generateBusinessPnlCsv(transactions, year);
          title = `Profit & Loss Statement (${year})`;
          type = 'spreadsheet';
          break;
        case 'business_ledger':
          content = generateBusinessLedgerCsv(transactions, accounts, year);
          title = `Business Ledger (${year})`;
          type = 'spreadsheet';
          break;
        case 'deduction_expense_summary':
        case 'personal_deductions':
          content = generatePersonalDeductionsCsv(transactions, accounts, year);
          title = `Personal Deductions (${year})`;
          type = 'spreadsheet';
          break;
        case 'tax_summary':
          content = generateTaxSummaryMarkdown(transactions, accounts, { ...taxSettings, taxYear: year }, artifacts, activeDocuments);
          title = `Tax Summary (${year})`;
          type = 'markdown';
          break;
        default:
          return { feedbackError: `Unsupported documentType: ${documentType}` };
      }

      // 3. Save Artifact
      const artifactId = `art_tax_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();

      const newArtifact: ChatArtifact = {
        id: artifactId,
        type,
        title,
        content,
        summary: `Compiled ${title} using local securely processed tax data.`,
        associatedChecklistId,
        createdAt: now,
        updatedAt: now,
      };

      await api.putArtifact(newArtifact);

      // 4. Update Checklist Linkage
      if (associatedChecklistId) {
        try {
          const checklist = taxSettings.checklist || {};
          await api.putSetting('app:taxSettings', {
            ...taxSettings,
            checklist: { ...checklist, [associatedChecklistId]: true }
          });
          const { queryClient } = await import('../../queryClient');
          queryClient.invalidateQueries({ queryKey: ['settings'] });
          queryClient.invalidateQueries({ queryKey: ['artifacts'] });
        } catch (err) {
          console.error('Failed to link artifact to tax checklist:', err);
        }
      } else {
        const { queryClient } = await import('../../queryClient');
        queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      }

      useChatStore.getState().setActiveArtifact(newArtifact);

      return {
        systemResultsMsg: `Successfully compiled tax document '${title}' with ID: ${artifactId}.`,
        actionResult: { action: 'compile_tax_document', documentType, artifactId, title, type }
      };

    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { feedbackError: `Error compiling tax document: ${errMsg}` };
    }
  }
}
