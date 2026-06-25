import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { db } from '../../db/drizzle';
import * as schema from '../../db/schema';
import { inArray, sql, and } from 'drizzle-orm';
import { detectSubscriptionAlerts } from '../../copilotAnalytics';

export class SubscriptionAlertsTool implements AIToolHandler {
  name = 'subscription_alerts';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const currentFilters = context.filters;
    const searchVal = currentFilters.searchQuery;
    const minPriceVal = currentFilters.minPrice;
    const maxPriceVal = currentFilters.maxPrice;
    const enabledSet = new Set(currentFilters.enabledAccountIds);

    const conditions = [];
    if (enabledSet.size > 0) {
      conditions.push(inArray(schema.transactions.accountId, Array.from(enabledSet)));
    }
    if (searchVal) {
      const q = `%${searchVal}%`;
      conditions.push(sql`(LOWER(${schema.transactions.description}) LIKE LOWER(${q}) OR LOWER(${schema.transactions.merchantKey}) LIKE LOWER(${q}))`);
    }
    if (minPriceVal !== undefined) {
      conditions.push(sql`ABS(${schema.transactions.amount}) >= ${minPriceVal}`);
    }
    if (maxPriceVal !== undefined) {
      conditions.push(sql`ABS(${schema.transactions.amount}) <= ${maxPriceVal}`);
    }

    // We still fetch the transactions here because the alert detection logic is complex and looks at sequences of dates
    // However, we only fetch the relevant ones filtered by SQL
    const query = conditions.length > 0 
      ? db.select().from(schema.transactions).where(and(...conditions))
      : db.select().from(schema.transactions);

    const filteredTxns = await query;
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
