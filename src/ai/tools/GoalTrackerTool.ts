import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import { getMonthsInRange, aggregateTransactions } from '../../copilotMatcher';

export class GoalTrackerTool implements AIToolHandler {
  name = 'goal_tracking';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const targetAmount = Number(actionObj.targetAmount) || 0;
    
    if (targetAmount <= 0) {
      return {
        systemResultsMsg: "Error: No valid targetAmount provided for goal tracking.",
        actionResult: { action: 'goal_tracking' }
      };
    }

    const allTxns = await db.select().from(schema.transactions);
    
    // Sort transactions by date to find earliest and latest
    const sorted = [...allTxns].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) {
      return {
        systemResultsMsg: "No transaction data available to forecast savings rate.",
        actionResult: { action: 'goal_tracking' }
      };
    }

    const earliest = sorted[0].date;
    const latest = sorted[sorted.length - 1].date;
    const numMonths = getMonthsInRange(earliest, latest);

    // Get category types from store
    const store = context.dataStore;
    const catTypes = store.categories.reduce((acc, c) => ({ ...acc, [c.name.toLowerCase()]: c.type }), {} as Record<string, string>);

    const agg = aggregateTransactions(allTxns, catTypes, 0, numMonths);
    
    const monthlyIncome = agg.totalIncome / numMonths;
    const monthlySpend = agg.totalSpend / numMonths;
    const monthlySavings = monthlyIncome - monthlySpend;

    if (monthlySavings <= 0) {
      return {
        systemResultsMsg: `Goal Tracking Results:
- Target Goal: $${targetAmount.toFixed(2)}
- Average Monthly Income: $${monthlyIncome.toFixed(2)}
- Average Monthly Spend: $${monthlySpend.toFixed(2)}
- Average Net Savings Rate: $${monthlySavings.toFixed(2)}/month

The user is currently spending more than they earn (or breaking even). It is not mathematically possible to forecast a goal completion date. Please explain this gently to the user.`,
        actionResult: { action: 'goal_tracking', monthlySavings, achievable: false }
      };
    }

    const monthsToGoal = targetAmount / monthlySavings;

    const systemResultsMsg = `Goal Tracking Results:
- Target Goal: $${targetAmount.toFixed(2)}
- Average Monthly Income: $${monthlyIncome.toFixed(2)}
- Average Monthly Spend: $${monthlySpend.toFixed(2)}
- Average Net Savings Rate: $${monthlySavings.toFixed(2)}/month
- Projected Time to Reach Goal: ${monthsToGoal.toFixed(1)} months

Please summarize these findings in the 'body' field. Tell the user exactly how many months it will take to reach their goal based on their historical savings rate. Set 'agent_action.action' to 'none'. ALL numbers MUST be bolded and formatted correctly.`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'goal_tracking',
        targetAmount,
        monthlySavings,
        monthsToGoal,
        achievable: true
      }
    };
  }
}
