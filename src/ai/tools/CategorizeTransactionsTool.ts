import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { localAI } from '../../ai';
import { useChatStore } from '../../chatStore';

export class CategorizeTransactionsTool implements AIToolHandler {
  name = 'categorize_transactions';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const licenseSetting = await (await db.select().from(schema.settings).where(eq(schema.settings.key, 'license')))[0];
    const license = licenseSetting?.value as { active: boolean } | undefined;
    if (!license?.active) {
      return { feedbackError: "Error: A license key is required to use AI features. Please activate your license on the Local Model page first." };
    }

    const currentFilters = context.filters;
    const store = context.dataStore;
    const uncategorizedAll = store.transactions.filter(t => t.category === 'Uncategorized');
    const uncategorized = currentFilters.demoMode
      ? uncategorizedAll.filter((t) => t.source === 'demo')
      : uncategorizedAll.filter((t) => t.source !== 'demo');

    const totalCount = uncategorized.length;
    if (totalCount === 0) {
      return {
        systemResultsMsg: `Categorization Results:\n- Total Uncategorized Transactions Processed: 0\n- Status: No uncategorized transactions to classify.\n\nExplain to the user that there are no uncategorized transactions to classify in the current view.`,
        actionResult: { action: 'categorize_transactions', processedCount: 0 }
      };
    }

    const allCats = store.categories;
    const catNames = allCats.map((c) => c.name);
    const chunkSize = 12;
    const chunksCount = Math.ceil(totalCount / chunkSize);

    const proposedItems: any[] = [];
    const reportId = `report-${Date.now()}`;
    let aborted = false;
    
    const { addMessage } = useChatStore.getState();
    const signal = (context as any).signal;

    try {
      for (let c = 0; c < chunksCount; c++) {
        if (signal?.aborted) {
          aborted = true;
          break;
        }

        const startIdx = c * chunkSize;
        const endIdx = Math.min(startIdx + chunkSize, totalCount);
        const chunk = uncategorized.slice(startIdx, endIdx);

        // Optional: Could send status message here via chatStore if desired, 
        // but we'll let the loop finish for the tool result.
        
        const toReview = chunk.map((t) => ({
          desc: t.description,
          ruleCategory: t.category,
        }));

        const aiResults = await localAI.reviewTransactions(toReview, catNames, signal);

        if (signal?.aborted) {
          aborted = true;
          break;
        }

        for (let i = 0; i < chunk.length; i++) {
          const cat = aiResults[i];
          if (cat && catNames.includes(cat)) {
            proposedItems.push({
              transactionId: chunk[i].id!,
              description: chunk[i].description,
              amount: chunk[i].amount,
              date: chunk[i].date,
              originalCategory: chunk[i].category,
              proposedCategory: cat,
              approved: true,
            });
          }
        }

        await db.insert(schema.settings).values({
          key: 'app:pendingCategorizationReport',
          value: {
            id: reportId,
            createdAt: new Date().toISOString(),
            items: proposedItems
          }
        }).onConflictDoNothing();
      }
    } catch (chunkErr: any) {
      if (chunkErr.name === 'AbortError' || chunkErr.message?.includes('aborted')) {
        aborted = true;
      } else {
        console.error('AI chunk categorization failed:', chunkErr);
        throw chunkErr;
      }
    }

    if (proposedItems.length > 0) {
      return {
        systemResultsMsg: `Categorization Proposed Report Generated:\n- Total Transactions Analyzed: ${proposedItems.length}\n- Status: ${aborted ? 'Interrupted (Partial Report)' : 'Complete'}\n- Report ID: ${reportId}\n\nInform the user that you have generated a categorization proposal report for **${proposedItems.length}.00** transactions. Bold all numbers and format to exactly the second decimal place (.00) (e.g. **12.00** transactions). Explain that they can review, edit, and approve these changes before they are applied.`,
        actionResult: {
          action: 'categorize_transactions',
          processedCount: proposedItems.length,
          reportId: reportId,
          interrupted: aborted
        }
      };
    } else {
      return {
        systemResultsMsg: `Categorization Results:\n- Total Uncategorized Transactions Processed: 0\n- Status: No categorization suggestions generated.\n\nInform the user that no suggestions could be generated.`,
        actionResult: { action: 'categorize_transactions', processedCount: 0 }
      };
    }
  }
}
