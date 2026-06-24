import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { calculateGlobalRunwayData } from '../../ai/skills';

export class ScenarioForecastingTool implements AIToolHandler {
  name = 'scenario_forecasting';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const runwayData = await calculateGlobalRunwayData();

    const incomeAdjustment = Number(actionObj.incomeAdjustment) || 0;
    const budgetAdjustment = Number(actionObj.budgetAdjustment) || 0;
    
    // Original metrics
    const originalNetCash = runwayData.netCash;
    const originalOutflow = runwayData.monthlyOutflow;
    const originalRunway = runwayData.runwayMonths;

    // Adjusted metrics
    const newNetCash = Math.max(0, originalNetCash + incomeAdjustment);
    const newOutflow = Math.max(0, originalOutflow + budgetAdjustment);
    const newRunway = newOutflow > 0 ? newNetCash / newOutflow : 0;

    const systemResultsMsg = `Scenario Forecasting Results:
- Original Net Cash: $${originalNetCash.toFixed(2)}
- Original Monthly Outflow: $${originalOutflow.toFixed(2)}
- Original Runway: ${originalRunway.toFixed(1)} months

Adjustments Applied:
- Income/Cash Adjustment: $${incomeAdjustment.toFixed(2)}
- Budget/Outflow Adjustment: $${budgetAdjustment.toFixed(2)}

New Forecast:
- New Net Cash: $${newNetCash.toFixed(2)}
- New Monthly Outflow: $${newOutflow.toFixed(2)}
- New Runway: ${newRunway.toFixed(1)} months

Please summarize these findings in the 'body' field. Tell the user their new adjusted runway. Set 'agent_action.action' to 'none'. ALL numbers MUST be bolded and formatted correctly.`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'scenario_forecasting',
        originalRunway,
        newRunway,
        incomeAdjustment,
        budgetAdjustment
      }
    };
  }
}
