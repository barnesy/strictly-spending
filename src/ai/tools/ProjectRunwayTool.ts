import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { calculateGlobalRunwayData } from '../../ai';

export class ProjectRunwayTool implements AIToolHandler {
  name = 'project_runway';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const runwayData = await calculateGlobalRunwayData();
    const systemResultsMsg = `Project Runway Results:
- Cash Balance: $${runwayData.cashBalance.toFixed(2)}
- Credit Debt: $${Math.abs(runwayData.creditDebt).toFixed(2)}
- Net Cash Starting Reserves: $${runwayData.netCash.toFixed(2)}
- Current Monthly Outflow: $${runwayData.monthlyOutflow.toFixed(2)}
- Calculated Budget Runway: ${runwayData.runwayMonths.toFixed(1)} months

If these results are sufficient to answer the user's question, explain them to the user in a detailed response in the 'body' field and set 'agent_action.action' to 'none'. You MUST report the cash balance, monthly outflow, and runway months explicitly in your response. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **$10000.00**, **2.50** months).`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'project_runway',
        metrics: runwayData
      }
    };
  }
}
