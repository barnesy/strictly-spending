import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { invoke } from '@tauri-apps/api/core';

export class CategorizeTransactionsTool implements AIToolHandler {
  name = 'categorize_transactions';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    try {
      const result: any = await invoke('ai_categorize_transactions', {
        demoMode: context.filters?.demoMode || false,
        modelName: 'llama3:8b' // default model or ideally from store
      });

      if (result.processed_count > 0) {
        return {
          systemResultsMsg: `Categorization Proposed Report Generated:\n- Total Transactions Analyzed: ${result.processed_count}\n- Status: ${result.interrupted ? 'Interrupted (Partial Report)' : 'Complete'}\n- Report ID: ${result.report_id}\n\nInform the user that you have generated a categorization proposal report for **${result.processed_count}.00** transactions. Bold all numbers and format to exactly the second decimal place (.00) (e.g. **12.00** transactions). Explain that they can review, edit, and approve these changes before they are applied.`,
          actionResult: {
            action: 'categorize_transactions',
            processedCount: result.processed_count,
            reportId: result.report_id,
            interrupted: result.interrupted
          }
        };
      } else {
        return {
          systemResultsMsg: `Categorization Results:\n- Total Uncategorized Transactions Processed: 0\n- Status: No categorization suggestions generated.\n\nInform the user that no suggestions could be generated.`,
          actionResult: { action: 'categorize_transactions', processedCount: 0 }
        };
      }
    } catch (e: any) {
      console.error('AI categorization failed natively:', e);
      return { feedbackError: `Error: Failed to categorize transactions: ${e.message || e}` };
    }
  }
}
