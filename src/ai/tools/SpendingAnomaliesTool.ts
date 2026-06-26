import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import { resolveDateRange } from '../../store';
import { matchCategories } from '../../copilotMatcher';
import { detectSpendingAnomalies } from '../../copilotAnalytics';

export class SpendingAnomaliesTool implements AIToolHandler {
  name = 'spending_anomalies';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const currentFilters = context.filters;
    let queryCats = actionObj.categories || actionObj.category || [];
    if (!Array.isArray(queryCats)) queryCats = [queryCats];
    
    const store = context.dataStore;
    const allCats = store.categories;
    let resolvedCats: string[];
    if (!queryCats || (queryCats.length === 1 && queryCats[0] === 'current')) {
      const disabledSet = new Set(currentFilters.disabledCategories);
      resolvedCats = allCats.filter(c => !disabledSet.has(c.name)).map(c => c.name);
    } else {
      resolvedCats = queryCats.includes('all') || queryCats.length === 0
        ? allCats.map(c => c.name)
        : matchCategories(queryCats, allCats);
    }
    
    const hasCatsQuery = queryCats.length > 0 && !queryCats.includes('all');
    if (hasCatsQuery && resolvedCats.length === 0) {
      return { feedbackError: `Error: The requested categories [${queryCats.join(', ')}] could not be matched for spending_anomalies. \\nAvailable Categories: [${allCats.map(c => c.name).join(', ')}]. \\nPlease correct the category names and try again.` };
    }

    const enabledSet = new Set(currentFilters.enabledAccountIds);

    let effectivePreset = actionObj.preset || currentFilters.preset;
    if (effectivePreset === 'current') effectivePreset = currentFilters.preset;
    const range = resolveDateRange({ ...currentFilters, preset: effectivePreset });

    const allTxns = await api.getTransactions();
    const filteredTxns = allTxns.filter((t) => {
      if (enabledSet.size > 0 && t.accountId && !enabledSet.has(t.accountId)) return false;
      if (resolvedCats.length > 0 && !resolvedCats.includes(t.category)) return false;
      return true;
    });

    const anomalies = detectSpendingAnomalies(filteredTxns as any, resolvedCats, range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10), store.budgets);

    const systemResultsMsg = `Spending Anomalies Scan Results for period ${range.start.toISOString().slice(0, 10)} to ${range.end.toISOString().slice(0, 10)}:
- Outlier Transactions: ${anomalies.outliers.length}
- High Growth Categories: ${anomalies.categorySpikes.length}

If these results are sufficient to answer the user's question, explain them to the user in a detailed response in the 'body' field and set 'agent_action.action' to 'none'. Cite the exact numbers of outliers and growth categories found. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **1.00** outlier, **2.00** categories).`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'spending_anomalies',
        categories: queryCats,
        customStart: range.start.toISOString().slice(0, 10),
        customEnd: range.end.toISOString().slice(0, 10),
        anomalies
      }
    };
  }
}
