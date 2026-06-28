import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { invoke } from '@tauri-apps/api/core';
import { resolveDateRange } from '../../store';
import { useBudgetStore } from '../../budgetStore';
import { buildRecurrenceMap } from '../../recurrence';
import { buildForecast } from '../../forecast';
import { matchCategories, matchAccounts, getMonthsInRange, calculateBudgetStatus } from '../../copilotMatcher';

export class QueryDataTool implements AIToolHandler {
  name = 'query_data';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const currentFilters = context.filters;
    let start = actionObj.customStart;
    let end = actionObj.customEnd;

    if (!start && !end) {
      let effectivePreset = actionObj.preset || currentFilters.preset;
      if (effectivePreset === 'current') effectivePreset = currentFilters.preset;
      const range = resolveDateRange({ ...currentFilters, preset: effectivePreset });
      start = range.start.toISOString().slice(0, 10);
      end = range.end.toISOString().slice(0, 10);
    } else {
      start = start || currentFilters.earliestTransactionDate || '2000-01-01';
      end = end || currentFilters.latestTransactionDate || new Date().toISOString().slice(0, 10);
    }

    let queryCats = actionObj.categories || actionObj.category || [];
    let queryAccts = actionObj.accounts || actionObj.account || [];
    if (!Array.isArray(queryCats)) queryCats = [queryCats];
    if (!Array.isArray(queryAccts)) queryAccts = [queryAccts];

    const store = context.dataStore;
    const allCats = store.categories;
    const allAccts = store.accounts;

    let resolvedCats: string[];
    if (!queryCats || (queryCats.length === 1 && queryCats[0] === 'current')) {
      const disabledSet = new Set(currentFilters.disabledCategories);
      resolvedCats = allCats.filter(c => !disabledSet.has(c.name)).map(c => c.name);
    } else {
      resolvedCats = queryCats.includes('all') || queryCats.length === 0
        ? allCats.map(c => c.name)
        : matchCategories(queryCats, allCats);
    }

    let resolvedAccts: number[];
    if (!queryAccts || (queryAccts.length === 1 && queryAccts[0] === 'current')) {
      const enabledSet = new Set(currentFilters.enabledAccountIds);
      resolvedAccts = enabledSet.size > 0 
          ? Array.from(enabledSet)
          : allAccts.map(a => a.id).filter((id): id is number => id !== undefined);
    } else {
      resolvedAccts = queryAccts.includes('all') || queryAccts.length === 0
        ? allAccts.map(a => a.id).filter((id): id is number => id !== undefined)
        : matchAccounts(queryAccts, allAccts);
    }

    const hasCatsQuery = queryCats.length > 0 && !queryCats.includes('all');
    const hasAcctsQuery = queryAccts.length > 0 && !queryAccts.includes('all');

    if (hasCatsQuery && resolvedCats.length === 0) {
      return { feedbackError: `Error: The requested categories [${queryCats.join(', ')}] could not be matched. \nAvailable Categories: [${allCats.map(c => c.name).join(', ')}]. \nPlease correct the category names and try again.` };
    } else if (hasAcctsQuery && resolvedAccts.length === 0) {
      return { feedbackError: `Error: The requested accounts [${queryAccts.join(', ')}] could not be matched. \nAvailable Accounts: [${allAccts.map(a => a.name).join(', ')}]. \nPlease correct the account names and try again.` };
    }

    const categoryTypes: Record<string, string> = {};
    for (const c of allCats) {
      categoryTypes[c.name.toLowerCase()] = c.type;
    }

    const budgets = store.budgets || [];
    const recurrenceMapObj = await buildRecurrenceMap(false);
    const recurrenceMap = new Map(Object.entries(recurrenceMapObj));
    const forecast = await buildForecast(false);
    const recurring = forecast.filter((f) => f.kind === 'recurring');

    const budgetStore = useBudgetStore.getState();
    const excludedMerchants = budgetStore.excludedMerchants;
    const excludedBudgetCategories = budgetStore.excludedBudgetCategories;

    let monthlyBudget = 0;
    for (const catName of resolvedCats) {
      const catNameLower = catName.toLowerCase();
      if (!excludedBudgetCategories.has(catName)) {
        const b = budgets.find(x => x.category.toLowerCase() === catNameLower);
        if (b) {
          monthlyBudget += b.monthlyAmount;
        }
      }
      const catRecurring = recurring.filter(
        r => r.category.toLowerCase() === catNameLower && !excludedMerchants.has(r.merchantKey)
      );
      const recurringSum = catRecurring.reduce((sum, r) => sum + r.monthlyEstimate, 0);
      monthlyBudget += recurringSum;
    }

    const minPriceVal = actionObj.minPrice !== undefined && actionObj.minPrice !== null
      ? actionObj.minPrice
      : currentFilters.minPrice;
    const maxPriceVal = actionObj.maxPrice !== undefined && actionObj.maxPrice !== null
      ? actionObj.maxPrice
      : currentFilters.maxPrice;
    const searchVal = actionObj.search !== undefined && actionObj.search !== null && actionObj.search !== ''
      ? actionObj.search
      : currentFilters.searchQuery;

    const numMonths = getMonthsInRange(start, end);

    const result: any = await invoke('ai_query_data', {
      params: {
        start,
        end,
        resolvedCats: resolvedCats,
        resolvedAccts: resolvedAccts,
        searchVal: searchVal || null,
        minPrice: minPriceVal !== undefined ? Number(minPriceVal) : null,
        maxPrice: maxPriceVal !== undefined ? Number(maxPriceVal) : null,
        queryCats: queryCats,
        queryAccts: queryAccts
      }
    });

    const totalSpend = result.total_spend;
    const totalIncome = result.total_income;
    const spendCount = result.spend_count;
    const incomeCount = result.income_count;

    const spendAverage = spendCount > 0 ? totalSpend / spendCount : 0;
    const incomeAverage = incomeCount > 0 ? totalIncome / incomeCount : 0;

    const { scaledBudget, difference, isOverBudget, statusText } = calculateBudgetStatus(
      totalSpend,
      monthlyBudget,
      numMonths
    );

    const metrics = {
      totalSpend,
      totalIncome,
      spendCount,
      incomeCount,
      spendAverage,
      incomeAverage,
      totalBudget: monthlyBudget,
      numMonths,
      scaledBudget,
      difference,
      isOverBudget,
      budgetStatusText: statusText,
      resolvedCategoryNames: resolvedCats,
      isAll: queryCats.includes('all') || queryCats.length === 0,
    };

    let breakdownText = '';
    
    if (numMonths > 1.0) {
      const monthlyTable = [
        '| Month | Spend Amount |',
        '| :--- | ---: |',
        ...result.monthly_breakdown.map((row: any) => {
          const formattedLabel = new Date(row.month + '-02').toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
          return `| ${formattedLabel} | $${row.amount.toFixed(2)} |`;
        })
      ].join('\\n');

      const yearlyTable = [
        '| Year | Spend Amount |',
        '| :--- | ---: |',
        ...result.yearly_breakdown.map((row: any) => `| ${row.year} | $${row.amount.toFixed(2)} |`)
      ].join('\\n');

      breakdownText = `\\n\\nMonthly Spend Breakdown:\\n${monthlyTable}\\n\\nYearly Spend Breakdown:\\n${yearlyTable}`;
    }

    if (resolvedCats.length > 1 || queryCats.includes('all') || queryCats.length === 0) {
      const catTable = [
        '| Category | Spend Amount |',
        '| :--- | ---: |',
        ...result.category_breakdown.map((row: any) => `| ${row.category} | $${row.amount.toFixed(2)} |`)
      ].join('\\n');
      breakdownText += `\\n\\nCategory Breakdown:\\n${catTable}`;
    }

    if (result.recent_transactions.length > 0) {
      const recentList = result.recent_transactions.map((t: any) => `- ${t.date} | ${t.description} | ${t.category} | $${Math.abs(t.amount).toFixed(2)}`).join('\\n');
      breakdownText += `\\n\\nRecent Transactions (Top 10):\\n${recentList}`;
    }

    const systemResultsMsg = `Database Query Results for categories [${queryCats.join(', ')}] between ${start} and ${end}:
- Total Spent: $${metrics.totalSpend.toFixed(2)}
- Number of Transactions: ${metrics.spendCount}
- Average Transaction: $${metrics.spendAverage.toFixed(2)}
- Total Monthly Budget Limit: $${metrics.totalBudget.toFixed(2)}${breakdownText}

Analyze these results and determine your next step. If you need to perform more actions, use the appropriate tool. If you are ready to provide a final response, do so.
When providing your final answer, it MUST be detailed and insightful, using the exact aggregated numbers returned above (dollar amounts, averages). Focus on summarizing the high-level insights. Do NOT output a list or table of the Recent Transactions. Explicitly compute differences and percentages when comparing periods.
ALL numbers in your final answer MUST be bolded (e.g. **$391.29**, **6.00** transactions, **+56.50%**).`;

    const actionResult = {
      action: 'query_data',
      categories: queryCats,
      accounts: queryAccts,
      search: searchVal,
      minPrice: minPriceVal,
      maxPrice: maxPriceVal,
      customStart: start,
      customEnd: end,
      metrics
    };

    return {
      systemResultsMsg,
      actionResult,
      lastQueryState: {
        start,
        end,
        cats: resolvedCats,
        accts: resolvedAccts,
        search: searchVal || '',
        minPrice: minPriceVal,
        maxPrice: maxPriceVal,
      }
    };
  }
}
