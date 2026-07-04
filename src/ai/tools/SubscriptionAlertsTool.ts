import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { api } from '../../api';
import { detectSubscriptionAlerts } from '../../copilotAnalytics';

export class SubscriptionAlertsTool implements AIToolHandler {
  name = 'subscription_alerts';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const currentFilters = context.filters;
    const searchVal = actionObj.search ?? currentFilters.searchQuery;
    const minPriceVal = actionObj.minPrice ?? currentFilters.minPrice;
    const maxPriceVal = actionObj.maxPrice ?? currentFilters.maxPrice;
    const enabledSet = new Set(currentFilters.enabledAccountIds);

    const allTxns = await api.getTransactions();
    const filteredTxns = allTxns.filter((t) => {
      if (enabledSet.size > 0 && t.accountId && !enabledSet.has(t.accountId)) return false;
      if (searchVal) {
        const q = searchVal.toLowerCase();
        if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const store = context.dataStore;
    const overrides = store.merchantOverrides;
    const alerts = detectSubscriptionAlerts(filteredTxns as any, overrides);

    if (minPriceVal !== undefined || maxPriceVal !== undefined) {
      alerts.activeSubscriptions = alerts.activeSubscriptions.filter((sub) => {
        if (minPriceVal !== undefined && sub.estMonthlyCost < minPriceVal) return false;
        if (maxPriceVal !== undefined && sub.estMonthlyCost > maxPriceVal) return false;
        return true;
      });
    }

    const systemResultsMsg = `Subscription Alerts Scan Results:
- Price Spikes Detected: ${alerts.priceSpikes.length}
- Duplicate Charges: ${alerts.duplicateCharges.length}
- Overlapping Subscriptions: ${alerts.overlappingSubscriptions.length}
- Active Subscriptions Matching Criteria: ${alerts.activeSubscriptions.length}

${alerts.activeSubscriptions.length > 0 ? `Matching Subscriptions:\n${alerts.activeSubscriptions.map(s => `- ${s.name}: $${s.estMonthlyCost.toFixed(2)}/mo`).join('\n')}\n` : ''}
If you need to perform more actions, use the appropriate tool. If these results are sufficient to answer the user's question, explain them to the user in a detailed response. Cite the exact numbers of spikes, duplicates, and overlaps found, and list the active subscriptions if requested. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **1.00** spike, **2.00** duplicates).`;

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
