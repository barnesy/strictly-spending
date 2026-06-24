import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { calculateGlobalRunwayData } from '../../ai/skills';

export class CashFlowPredictorTool implements AIToolHandler {
  name = 'cashflow_prediction';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const runwayData = await calculateGlobalRunwayData();

    // The runway calculation exports activeBudgets and recurringProjected.
    // Safe to spend could be defined as Cash Balance minus upcoming recurring outflow for the month.
    const upcomingRecurring = runwayData.monthlyOutflow; 
    const cashBalance = runwayData.cashBalance;
    const safeToSpend = cashBalance - upcomingRecurring;

    const systemResultsMsg = `Cash Flow Prediction Results:
- Current Liquid Cash Balance: $${cashBalance.toFixed(2)}
- Projected Monthly Recurring Outflow (Bills & Budgets): $${upcomingRecurring.toFixed(2)}
- Safe to Spend (Surplus): $${safeToSpend.toFixed(2)}

Please summarize these findings in the 'body' field. Tell the user exactly how much "Safe to Spend" cash they have left for the month after accounting for all recurring bills and budgets. Set 'agent_action.action' to 'none'. ALL numbers MUST be bolded and formatted to exactly the second decimal place (.00).`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'cashflow_prediction',
        cashBalance,
        upcomingRecurring,
        safeToSpend
      }
    };
  }
}
