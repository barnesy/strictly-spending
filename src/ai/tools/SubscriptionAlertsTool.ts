import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import { detectSubscriptionAlerts } from '../../copilotAnalytics';

export class SubscriptionAlertsTool implements AIToolHandler {
  name = 'subscription_alerts';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const currentFilters = context.filters;
    const searchVal = currentFilters.searchQuery;
    const minPriceVal = currentFilters.minPrice;
    const maxPriceVal = currentFilters.maxPrice;
    const enabledSet = new Set(currentFilters.enabledAccountIds);

    const allTxns = await api.getTransactions();
    const filteredTxns = allTxns.filter((t) => {
      if (enabledSet.size > 0 && t.accountId && !enabledSet.has(t.accountId)) return false;
      if (searchVal) {
        const q = searchVal.toLowerCase();
        if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) return false;
      }
      if (minPriceVal !== undefined && Math.abs(t.amount) < minPriceVal) return false;
      if (maxPriceVal !== undefined && Math.abs(t.amount) > maxPriceVal) return false;
      return true;
    });
    const store = context.dataStore;
    const overrides = store.merchantOverrides;
    const alerts = detectSubscriptionAlerts(filteredTxns as any, overrides);

    const systemResultsMsg = `Subscription Alerts Scan Results:
- Price Spikes Detected: ${alerts.priceSpikes.length}
- Duplicate Charges: ${alerts.duplicateCharges.length}
- Overlapping Subscriptions: ${alerts.overlappingSubscriptions.length}

If these results are sufficient to answer the user's question, explain them to the user in a detailed response in the 'body' field and set 'agent_action.action' to 'none'. Cite the exact numbers of spikes, duplicates, and overlaps found. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **1.00** spike, **2.00** duplicates).`;

    return {
      systemResultsMsg,
      actionResult: {
        action: 'subscription_alerts',
        categories: ['Subscriptions'],
        customStart: '',
        customEnd: '',
        alerts
      }
    };
  }
}
