import { api } from '../../api';
import type { AIToolHandler, AIToolContext, ToolExecutionResult } from './index';
import type { Scenario } from '../../api/scenarios';
import { useForecastStore } from '../../stores/forecastStore';

interface ManageScenariosAction {
  action: 'list' | 'get' | 'create' | 'update' | 'delete';
  scenarioId?: number;
  scenarioData?: Scenario;
  confirmed?: boolean;
}

export class ManageScenariosTool implements AIToolHandler {
  name = 'manage_scenarios';

  async execute(actionObj: ManageScenariosAction, context: AIToolContext): Promise<ToolExecutionResult> {
    const { action, scenarioId, scenarioData, confirmed } = actionObj;

    if (action === 'list') {
      const scenarios = await api.scenariosApi.list();
      return { 
        actionResult: { status: 'success', scenarios },
        systemResultsMsg: `Successfully fetched scenarios:\n${JSON.stringify(scenarios, null, 2)}\n\nYou may now use this data to fulfill the user's request.`
      };
    }

    if (action === 'get') {
      if (!scenarioId) return { actionResult: { status: 'error', message: 'scenarioId is required for get' } };
      const scenarios = await api.scenariosApi.list();
      const scenario = scenarios.find(s => s.id === scenarioId);
      if (!scenario) return { actionResult: { status: 'error', message: 'Scenario not found' }, systemResultsMsg: 'Error: Scenario not found.' };
      
      useForecastStore.getState().loadScenario(scenario);
      return { 
        actionResult: { status: 'success', scenario, message: 'Scenario loaded into UI' },
        systemResultsMsg: `Successfully loaded scenario data:\n${JSON.stringify(scenario, null, 2)}\n\nYou may now use this data to fulfill the user's request.`
      };
    }

    if (['update', 'delete'].includes(action)) {
      if (!confirmed) {
        if (action === 'update' && scenarioData) {
          useForecastStore.getState().loadScenario(scenarioData);
        }
        return { 
          feedbackError: 'SECURITY EXCEPTION: You attempted to modify a scenario without user confirmation. You MUST call the `request_user_confirmation` tool first. Only after the user confirms should you call this tool again with `confirmed: true`.'
        };
      }
    }

    if (action === 'create') {
      if (!scenarioData || !scenarioData.name) return { actionResult: { status: 'error', message: 'scenarioData with name is required' } };
      
      scenarioData.startingBalance = scenarioData.startingBalance ?? 0;
      scenarioData.baseIncome = scenarioData.baseIncome ?? 0;
      scenarioData.taxRate = scenarioData.taxRate ?? 0;
      scenarioData.recurringBudget = scenarioData.recurringBudget ?? 0;
      scenarioData.variableBudget = scenarioData.variableBudget ?? 0;
      scenarioData.savingsBudget = scenarioData.savingsBudget ?? 0;
      scenarioData.extraLoanPayment = scenarioData.extraLoanPayment ?? 0;
      scenarioData.loanStrategy = scenarioData.loanStrategy || 'avalanche';

      const id = await api.scenariosApi.create(scenarioData);
      return { actionResult: { status: 'success', message: 'Scenario created', id } };
    }

    if (action === 'update') {
      if (!scenarioData || !scenarioId) return { actionResult: { status: 'error', message: 'scenarioId and scenarioData are required' } };
      await api.scenariosApi.update({ ...scenarioData, id: scenarioId });
      return { actionResult: { status: 'success', message: 'Scenario updated' } };
    }

    if (action === 'delete') {
      if (!scenarioId) return { actionResult: { status: 'error', message: 'scenarioId is required' } };
      await api.scenariosApi.delete(scenarioId);
      return { actionResult: { status: 'success', message: 'Scenario deleted' } };
    }

    return { actionResult: { status: 'error', message: 'Unknown action' } };
  }
}
