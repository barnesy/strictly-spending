import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFilters, resolveDateRange } from '../../store';
import { useChatStore, formatModelName } from '../../chatStore';
import { localAI, type ChatMessage, parseAIResponse, calculateGlobalRunwayData } from '../../ai';
import { db } from '../../db';
import { detectSubscriptionAlerts, detectSpendingAnomalies } from '../../copilotAnalytics';
import { generateAccessibilityReport } from '../../accessibilityAuditor';
import { executeCopilotCommand, matchCategories, matchAccounts, getMonthsInRange, aggregateTransactions } from '../../copilotMatcher';
import { buildRecurrenceMap } from '../../recurrence';
import { buildForecast } from '../../forecast';
import { useBudgetStore } from '../../budgetStore';

export function useCopilotActionHandler() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const {
    preset,
    setPreset,
    setCustomRange,
    customStart,
    customEnd,
    searchQuery,
    setSearchQuery,
    disabledCategories,
    setDisabledCategories,
    enabledAccountIds,
    setEnabledAccounts,
    earliestTransactionDate,
    latestTransactionDate,
    minPrice,
    maxPrice,
    setMinPrice,
    setMaxPrice,
  } = useFilters();

  const {
    messages,
    addMessage,
    startStreamingMessage,
    appendStreamingToken,
    updateStreamingMetadata,
    finalizeStreamingMessage,
    modelName,
  } = useChatStore();

  const getExecutorContext = async () => {
    const categories = await db.categories.toArray();
    const accounts = await db.accounts.toArray();
    return {
      categories,
      accounts,
      currentPath: location.pathname,
      navigate,
      setPreset,
      setCustomRange,
      setDisabledCategories,
      setEnabledAccounts,
      setSearchQuery,
      setMinPrice,
      setMaxPrice,
    };
  };

  const sendPromptText = async (textToSubmit: string) => {
    if (!textToSubmit.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: textToSubmit.trim() };
    addMessage(userMsg);
    setLoading(true);

    let totalPrompt = 0;
    let totalCompletion = 0;
    const currentSteps = ['Analyzing request intent...'];

    try {
      if (!localAI.isLoaded) {
        addMessage({
          role: 'assistant',
          content: `Please initialize ${formatModelName(modelName)} first!`,
        });
        return;
      }

      const categories = await db.categories.toArray();
      const accounts = await db.accounts.toArray();
      
      const enabledAccounts = accounts.filter((a) => a.enabled);
      let currentCash = enabledAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
      if (currentCash === 0) {
        currentCash = 10000;
      }

      const incomeSetting = await db.settings.get('monthlyIncome');
      let monthlyIncome = incomeSetting ? Number(incomeSetting.value) : 0;

      if (monthlyIncome === 0) {
        const allTxns = await db.transactions.toArray();
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const ninetyDaysAgoISO = ninetyDaysAgo.toISOString().slice(0, 10);

        const incomeCategoryNames = categories
          .filter((c) => c.type === 'income')
          .map((c) => c.name.toLowerCase());

        const positiveIncomeTxns = allTxns.filter((t) => {
          return (
            t.date >= ninetyDaysAgoISO &&
            t.amount > 0 &&
            incomeCategoryNames.includes(t.category.toLowerCase())
          );
        });

        const totalIncomeLast90Days = positiveIncomeTxns.reduce((sum, t) => sum + t.amount, 0);
        monthlyIncome = totalIncomeLast90Days / 3;
      }

      const runwayData = await calculateGlobalRunwayData();

      const stateContext = `Current Date: ${new Date().toISOString().slice(0, 10)} (${new Date().toLocaleDateString()})
Earliest Transaction Date: ${earliestTransactionDate || 'None'}
Latest Transaction Date: ${latestTransactionDate || 'None'}
Current Page: ${location.pathname}
Current Filter Preset: ${preset}
Current Custom Start Date: ${customStart || 'None'}
Current Custom End Date: ${customEnd || 'None'}
Current Search Query: "${searchQuery}"
Current Min Price Filter: ${minPrice !== undefined ? `$${minPrice}` : 'None'}
Current Max Price Filter: ${maxPrice !== undefined ? `$${maxPrice}` : 'None'}
Available Categories: ${categories.map((c) => c.name).join(', ')}
Available Accounts: ${accounts.map((a) => a.name).join(', ')}
Currently Disabled Categories: ${disabledCategories.join(', ')}
Currently Enabled Accounts: ${enabledAccountIds.join(', ')}
Current Cash Balance: $${runwayData.cashBalance.toFixed(2)}
Current Credit CC Debt: $${Math.abs(runwayData.creditDebt).toFixed(2)}
Net Cash starting reserves: $${runwayData.netCash.toFixed(2)}
Current Monthly Outflow: $${runwayData.monthlyOutflow.toFixed(2)}
Calculated Budget Runway: ${runwayData.runwayMonths.toFixed(1)} months
Expected Monthly Income: $${monthlyIncome.toFixed(2)}`;

      let conversationHistory = [...messages, userMsg];
      let loops = 0;
      const maxLoops = 4;
      let currentResponse = '';
      const executedActions = new Set<string>();

      while (loops < maxLoops) {
        loops++;
        const isLastLoop = loops === maxLoops;

        startStreamingMessage(currentSteps, 'tool_select');

        // Clear intermediate body fields in history to prevent repetition bias
        const cleanedHistory = conversationHistory.map((m) => {
          if (m.role === 'assistant') {
            try {
              const p = parseAIResponse(m.content);
              if (p && p.body) {
                return { ...m, content: JSON.stringify({ ...p, body: '' }) };
              }
            } catch {}
          }
          return m;
        });

        const activeHistory = isLastLoop
          ? [
              ...cleanedHistory,
              {
                role: 'system' as const,
                content: `This is the final turn. You MUST explain all the query results retrieved so far in the 'body' field. Ground your explanation strictly in actual numbers: cite the exact figures (dollar amounts, transaction counts, averages) and compute comparison calculations (differences and percentage changes). ALL numbers must be **bolded** (e.g. **$391.29**, **6.00** transactions, **+56.50%**). Numbers, counts, percentages, and currency values MUST never be rounded to a whole integer, except to the second decimal place (.00) (e.g. write **$250.00**, NEVER $250; write **6.00** transactions, NEVER 6). Do not query again. Set 'agent_action.action' to 'none'.`
              }
            ]
          : cleanedHistory;

        currentResponse = await localAI.chatCopilot(
          activeHistory,
          stateContext,
          undefined,
          undefined,
          (token, meta) => {
            if (meta) {
              totalPrompt += meta.promptTokens;
              totalCompletion += meta.completionTokens;
              updateStreamingMetadata(currentSteps, {
                prompt: totalPrompt,
                completion: totalCompletion,
                total: totalPrompt + totalCompletion
              });
            } else {
              appendStreamingToken(token);
            }
          }
        );

        const parsedJson = parseAIResponse(currentResponse);

        if (!parsedJson) {
          currentSteps.push('Plain-text response completed.');
          await finalizeStreamingMessage(
            currentResponse,
            null,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation'
          );
          break;
        }

        const actionObj = parsedJson.agent_action || parsedJson;
        let action = actionObj.action || 'none';
        if (isLastLoop) {
          action = 'none';
        }

        const actionKey = `${action}:${JSON.stringify(actionObj.categories || [])}:${actionObj.customStart || ''}:${actionObj.customEnd || ''}:${actionObj.preset || ''}:${actionObj.search || ''}`;

        if (action !== 'none' && executedActions.has(actionKey)) {
          console.warn("Duplicate action detected in loop. Forcing explanation.");
          currentSteps.push("Duplicate action detected. Forcing explanation...");

          await finalizeStreamingMessage(
            currentResponse,
            null,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'tool_select'
          );

          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: currentResponse,
            steps: [...currentSteps],
            tokenUsage: { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            purpose: 'tool_select'
          };
          await addMessage(assistantMsg);

          const forceExplainMsg: ChatMessage = {
            role: 'system',
            content: `Error: You have already executed this action (${action}) with these parameters in a previous turn. To prevent an infinite loop, you must explain the results to the user now. Set 'agent_action.action' to 'none' and write the explanation in the 'body' field.`
          };
          await addMessage(forceExplainMsg);

          conversationHistory = [
            ...conversationHistory,
            assistantMsg,
            forceExplainMsg
          ];
          continue;
        }

        if (action !== 'none') {
          executedActions.add(actionKey);
        }

        let feedbackError: string | null = null;

        if (action === 'query_data') {
          let queryCats = actionObj.categories || actionObj.category || [];
          let queryAccts = actionObj.accounts || actionObj.account || [];
          if (!Array.isArray(queryCats)) queryCats = [queryCats];
          if (!Array.isArray(queryAccts)) queryAccts = [queryAccts];

          const allCats = await db.categories.toArray();
          const allAccts = await db.accounts.toArray();

          const resolvedCats = queryCats.includes('all') || queryCats.length === 0
            ? allCats.map(c => c.name)
            : matchCategories(queryCats, allCats);

          const resolvedAccts = queryAccts.includes('all') || queryAccts.length === 0
            ? allAccts.map(a => a.id).filter((id): id is number => id !== undefined)
            : matchAccounts(queryAccts, allAccts);

          const hasCatsQuery = queryCats.length > 0 && !queryCats.includes('all');
          const hasAcctsQuery = queryAccts.length > 0 && !queryAccts.includes('all');

          if (hasCatsQuery && resolvedCats.length === 0) {
            feedbackError = `Error: The requested categories [${queryCats.join(', ')}] could not be matched. \nAvailable Categories: [${allCats.map(c => c.name).join(', ')}]. \nPlease correct the category names and try again.`;
          } else if (hasAcctsQuery && resolvedAccts.length === 0) {
            feedbackError = `Error: The requested accounts [${queryAccts.join(', ')}] could not be matched. \nAvailable Accounts: [${allAccts.map(a => a.name).join(', ')}]. \nPlease correct the account names and try again.`;
          }
        } else if (action === 'subscription_alerts' || action === 'spending_anomalies') {
          const currentFilters = useFilters.getState();
          let queryCats = actionObj.categories || actionObj.category || [];
          if (!Array.isArray(queryCats)) queryCats = [queryCats];
          const allCats = await db.categories.toArray();
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
            feedbackError = `Error: The requested categories [${queryCats.join(', ')}] could not be matched for ${action}. \nAvailable Categories: [${allCats.map(c => c.name).join(', ')}]. \nPlease correct the category names and try again.`;
          }
        } else if (action === 'dom_update') {
          const selector = actionObj.domSelector;
          if (!selector) {
            feedbackError = `Error: Action 'dom_update' requires a 'domSelector' field. Please specify a valid CSS selector.`;
          } else {
            try {
              const element = document.querySelector(selector);
              if (!element) {
                feedbackError = `Error: The CSS selector "${selector}" could not be found on the page. \nPlease verify the page hierarchy and provide a correct CSS selector that actually exists.`;
              }
            } catch (e: any) {
              feedbackError = `Error: The CSS selector "${selector}" is invalid. Error: ${e.message}`;
            }
          }
        }

        if (feedbackError) {
          console.warn("Self-correction triggered due to:", feedbackError);
          currentSteps.push(`Self-Correction (Attempt ${loops}): ${feedbackError.split('\n')[0]}`);
          
          await finalizeStreamingMessage(
            currentResponse,
            null,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'tool_select'
          );

          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: currentResponse,
            steps: [...currentSteps],
            tokenUsage: { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            purpose: 'tool_select'
          };
          await addMessage(assistantMsg);

          const systemMsg: ChatMessage = {
            role: 'system',
            content: feedbackError
          };
          await addMessage(systemMsg);

          conversationHistory = [
            ...conversationHistory,
            assistantMsg,
            systemMsg
          ];
          continue;
        }

        if (action === 'none' || isLastLoop) {
          currentSteps.push('Response complete.');
          await finalizeStreamingMessage(
            currentResponse,
            null,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation'
          );
          break;
        }

        let systemResultsMsg: ChatMessage | null = null;
        let actionResult: any = null;

        if (action === 'query_data') {
          const currentFilters = useFilters.getState();
          let start = actionObj.customStart;
          let end = actionObj.customEnd;
          if (!start && !end) {
            let effectivePreset = actionObj.preset || currentFilters.preset;
            if (effectivePreset === 'current') effectivePreset = currentFilters.preset;
            const range = resolveDateRange({ ...currentFilters, preset: effectivePreset });
            start = range.start.toISOString().slice(0, 10);
            end = range.end.toISOString().slice(0, 10);
          } else {
            start = start || '2000-01-01';
            end = end || new Date().toISOString().slice(0, 10);
          }
          
          let queryCats = actionObj.categories || actionObj.category || [];
          let queryAccts = actionObj.accounts || actionObj.account || [];
          if (!Array.isArray(queryCats)) queryCats = [queryCats];
          if (!Array.isArray(queryAccts)) queryAccts = [queryAccts];

          const allCats = await db.categories.toArray();
          const allAccts = await db.accounts.toArray();
          const allTxns = await db.transactions.toArray();

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

          const categoryTypes: Record<string, string> = {};
          for (const c of allCats) {
            categoryTypes[c.name.toLowerCase()] = c.type;
          }

          const budgets = await db.budgets.toArray();
          const overrides = await db.merchantOverrides.toArray();
          const recurrenceMap = buildRecurrenceMap(allTxns, overrides);
          const forecast = buildForecast(allTxns, recurrenceMap, allCats);
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
          const matchedTxns = allTxns.filter(t => {
            if (t.date < start || t.date > end) return false;
            
            const hasAcctsFilter = queryAccts.length > 0 && !queryAccts.includes('all');
            if (hasAcctsFilter && !resolvedAccts.includes(t.accountId)) return false;

            if (searchVal) {
              const q = searchVal.toLowerCase();
              if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) {
                return false;
              }
            }

            if (minPriceVal !== undefined) {
              if (Math.abs(t.amount) < minPriceVal) return false;
            }
            if (maxPriceVal !== undefined) {
              if (Math.abs(t.amount) > maxPriceVal) return false;
            }

            if (queryCats.includes('all') || queryCats.length === 0) return true;
            return resolvedCats.some(c => c.toLowerCase() === t.category.toLowerCase());
          });

          const aggregated = aggregateTransactions(matchedTxns, categoryTypes, monthlyBudget, numMonths);
          
          const metrics = {
            totalSpend: aggregated.totalSpend,
            totalIncome: aggregated.totalIncome,
            spendCount: aggregated.spendCount,
            incomeCount: aggregated.incomeCount,
            spendAverage: aggregated.spendAverage,
            incomeAverage: aggregated.incomeAverage,
            totalBudget: monthlyBudget,
            numMonths,
            scaledBudget: aggregated.scaledBudget,
            difference: aggregated.difference,
            isOverBudget: aggregated.isOverBudget,
            budgetStatusText: aggregated.statusText,
            resolvedCategoryNames: resolvedCats,
            isAll: queryCats.includes('all') || queryCats.length === 0,
          };

          let breakdownText = '';
          if (numMonths > 1.0) {
            const monthsMap = new Map<string, number>();
            for (const t of matchedTxns) {
              const isIncome = t.category.toLowerCase() === 'income';
              if (!isIncome) {
                const monthKey = t.date.slice(0, 7);
                monthsMap.set(monthKey, (monthsMap.get(monthKey) || 0) + -t.amount);
              }
            }

            const yearsMap = new Map<string, number>();
            for (const [mKey, amt] of monthsMap.entries()) {
              const yKey = mKey.slice(0, 4);
              yearsMap.set(yKey, (yearsMap.get(yKey) || 0) + amt);
            }

            breakdownText = `\n\nMonthly Spend Breakdown:\n${Array.from(monthsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mKey, amt]) => {
              const formattedLabel = new Date(mKey + '-02').toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
              return `- ${formattedLabel}: $${amt.toFixed(2)}`;
            }).join('\n')}

Yearly Spend Breakdown:\n${Array.from(yearsMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([yKey, amt]) => {
              return `- ${yKey}: $${amt.toFixed(2)}`;
            }).join('\n')}`;
          }

          systemResultsMsg = {
            role: 'system',
            content: `Database Query Results for categories [${queryCats.join(', ')}] between ${start} and ${end}:
- Total Spent: $${metrics.totalSpend.toFixed(2)}
- Number of Transactions: ${metrics.spendCount}
- Average Transaction: $${metrics.spendAverage.toFixed(2)}
- Total Monthly Budget Limit: $${metrics.totalBudget.toFixed(2)}${breakdownText}

If these results are sufficient to answer the user's question, explain them to the user in the 'body' field and set 'agent_action.action' to 'none'.
Your final answer MUST be detailed and insightful, using the exact numbers returned above (dollar amounts, averages, transactions). Never use placeholders like $XXX or generalize. Explicitly compute differences and percentages when comparing periods.
ALL numbers in your final answer MUST be bolded (e.g. **$391.29**, **6.00** transactions, **+56.50%**). Numbers, counts, percentages, and currency values MUST never be rounded to a whole integer, except to the second decimal place (.00) (e.g. write **$250.00**, NEVER $250; write **6.00** transactions, NEVER 6).
If you still need more data (e.g. to compare with a different period), query it in your next turn.`
          };

          actionResult = {
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

          currentSteps.push(`Tool Call: query_data (categories: ${resolvedCats.join(', ')})`);

        } else if (action === 'subscription_alerts') {
          const currentFilters = useFilters.getState();
          const searchVal = currentFilters.searchQuery;
          const minPriceVal = currentFilters.minPrice;
          const maxPriceVal = currentFilters.maxPrice;
          const enabledSet = new Set(currentFilters.enabledAccountIds);

          const allTxns = await db.transactions.toArray();
          const filteredTxns = allTxns.filter(t => {
            if (enabledSet.size > 0 && !enabledSet.has(t.accountId)) return false;
            if (searchVal) {
              const q = searchVal.toLowerCase();
              if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) return false;
            }
            if (minPriceVal !== undefined) {
              if (Math.abs(t.amount) < minPriceVal) return false;
            }
            if (maxPriceVal !== undefined) {
              if (Math.abs(t.amount) > maxPriceVal) return false;
            }
            return true;
          });

          const overrides = await db.merchantOverrides.toArray();
          const alerts = detectSubscriptionAlerts(filteredTxns, overrides);

          systemResultsMsg = {
            role: 'system',
            content: `Subscription Alerts Scan Results:
- Price Spikes Detected: ${alerts.priceSpikes.length}
- Duplicate Charges: ${alerts.duplicateCharges.length}
- Overlapping Subscriptions: ${alerts.overlappingSubscriptions.length}

If these results are sufficient to answer the user's question, explain them to the user in a detailed response in the 'body' field and set 'agent_action.action' to 'none'. Cite the exact numbers of spikes, duplicates, and overlaps found. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **1.00** spike, **2.00** duplicates).`
          };

          actionResult = {
            action: 'subscription_alerts',
            categories: ['Subscriptions'],
            customStart: '',
            customEnd: '',
            alerts
          };

          currentSteps.push('Tool Call: subscription_alerts');

        } else if (action === 'project_runway') {
          systemResultsMsg = {
            role: 'system',
            content: `Project Runway Results:
- Cash Balance: $${runwayData.cashBalance.toFixed(2)}
- Credit Debt: $${Math.abs(runwayData.creditDebt).toFixed(2)}
- Net Cash Starting Reserves: $${runwayData.netCash.toFixed(2)}
- Current Monthly Outflow: $${runwayData.monthlyOutflow.toFixed(2)}
- Calculated Budget Runway: ${runwayData.runwayMonths.toFixed(1)} months

If these results are sufficient to answer the user's question, explain them to the user in a detailed response in the 'body' field and set 'agent_action.action' to 'none'. You MUST report the cash balance, monthly outflow, and runway months explicitly in your response. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **$10000.00**, **2.50** months).`
          };

          actionResult = {
            action: 'project_runway',
            metrics: runwayData
          };

          currentSteps.push('Tool Call: project_runway');

        } else if (action === 'spending_anomalies') {
          const currentFilters = useFilters.getState();
          let start = actionObj.customStart;
          let end = actionObj.customEnd;
          if (!start && !end) {
            let effectivePreset = actionObj.preset || currentFilters.preset;
            if (effectivePreset === 'current') effectivePreset = currentFilters.preset;
            const range = resolveDateRange({ ...currentFilters, preset: effectivePreset });
            start = range.start.toISOString().slice(0, 10);
            end = range.end.toISOString().slice(0, 10);
          } else {
            start = start || '2000-01-01';
            end = end || new Date().toISOString().slice(0, 10);
          }
          let queryCats = actionObj.categories || [];
          if (!Array.isArray(queryCats)) queryCats = [queryCats];

          const allCats = await db.categories.toArray();
          let resolvedCats: string[];
          if (!queryCats || (queryCats.length === 1 && queryCats[0] === 'current')) {
            const disabledSet = new Set(currentFilters.disabledCategories);
            resolvedCats = allCats.filter(c => !disabledSet.has(c.name)).map(c => c.name);
          } else {
            resolvedCats = queryCats.includes('all') || queryCats.length === 0
              ? allCats.map(c => c.name)
              : matchCategories(queryCats, allCats);
          }

          const searchVal = currentFilters.searchQuery;
          const minPriceVal = currentFilters.minPrice;
          const maxPriceVal = currentFilters.maxPrice;
          const enabledSet = new Set(currentFilters.enabledAccountIds);

          const allTxns = await db.transactions.toArray();
          const filteredTxns = allTxns.filter(t => {
            if (enabledSet.size > 0 && !enabledSet.has(t.accountId)) return false;
            if (searchVal) {
              const q = searchVal.toLowerCase();
              if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) return false;
            }
            if (minPriceVal !== undefined) {
              if (Math.abs(t.amount) < minPriceVal) return false;
            }
            if (maxPriceVal !== undefined) {
              if (Math.abs(t.amount) > maxPriceVal) return false;
            }
            return true;
          });

          const budgets = await db.budgets.toArray();
          const anomalies = detectSpendingAnomalies(filteredTxns, resolvedCats, start, end, budgets);

          systemResultsMsg = {
            role: 'system',
            content: `Spending Anomalies Scan Results:
- Category Spikes: ${anomalies.categorySpikes.length}
- Outliers: ${anomalies.outliers.length}

If these results are sufficient to answer the user's question, explain them to the user in a detailed response in the 'body' field and set 'agent_action.action' to 'none'. Cite the exact number of spikes and outliers found. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **1.00** spike, **2.00** outliers).`
          };

          actionResult = {
            action: 'spending_anomalies',
            categories: queryCats,
            customStart: start,
            customEnd: end,
            anomalies
          };

          currentSteps.push(`Tool Call: spending_anomalies (categories: ${resolvedCats.join(', ')})`);

        } else if (action === 'audit_accessibility') {
          const accessibilityReport = generateAccessibilityReport(location.pathname);

          systemResultsMsg = {
            role: 'system',
            content: `Accessibility Audit Results for ${location.pathname}:
- Score: ${accessibilityReport.score}
- Errors: ${accessibilityReport.issues.filter(i => i.severity === 'error').length}
- Warnings: ${accessibilityReport.issues.filter(i => i.severity === 'warning').length}

Please summarize this accessibility report for the developer in the 'body' field and set 'agent_action.action' to 'none'. Cite the exact score, error counts, and warning counts. ALL numbers in your final answer MUST be bolded and formatted to exactly the second decimal place (.00) (e.g. **95.00** score, **2.00** errors).`
          };

          actionResult = {
            action: 'audit_accessibility',
            categories: [],
            customStart: '',
            customEnd: '',
            accessibilityReport
          };

          currentSteps.push('Tool Call: audit_accessibility');

        } else if (action === 'create_artifact') {
          const artId = actionObj.id || `art-${Date.now()}`;
          const newArtifact = {
            id: artId,
            type: actionObj.type || 'markdown',
            title: actionObj.title || 'Untitled Artifact',
            content: actionObj.content || '',
            explanation: actionObj.explanation || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          await db.artifacts.put(newArtifact);
          useChatStore.getState().setActiveArtifact(newArtifact);

          actionResult = {
            action: 'create_artifact',
            id: artId,
            type: newArtifact.type,
            title: newArtifact.title,
          };

          currentSteps.push(`Tool Call: create_artifact (${newArtifact.title})`);
          await finalizeStreamingMessage(
            currentResponse,
            actionResult,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation'
          );
          break;

        } else if (action === 'update_artifact') {
          const artId = actionObj.id;
          if (artId) {
            const existing = await db.artifacts.get(artId);
            const updatedArtifact = {
              id: artId,
              type: actionObj.type || existing?.type || 'markdown',
              title: actionObj.title || existing?.title || 'Untitled Artifact',
              content: actionObj.content !== undefined ? actionObj.content : (existing?.content || ''),
              explanation: actionObj.explanation || existing?.explanation || '',
              createdAt: existing?.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            await db.artifacts.put(updatedArtifact);
            useChatStore.getState().setActiveArtifact(updatedArtifact);

            actionResult = {
              action: 'update_artifact',
              id: artId,
              type: updatedArtifact.type,
              title: updatedArtifact.title,
            };
            currentSteps.push(`Tool Call: update_artifact (${updatedArtifact.title})`);
          }

          await finalizeStreamingMessage(
            currentResponse,
            actionResult,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation'
          );
          break;

        } else if (
          action === 'navigate' ||
          action === 'search' ||
          action === 'filter' ||
          action === 'dom_update'
        ) {
          executeCopilotCommand(actionObj, await getExecutorContext());

          if (action === 'dom_update' && actionObj.domSelector) {
            try {
              const element = document.querySelector(actionObj.domSelector) as HTMLElement;
              if (element) {
                element.click();
              }
            } catch (e) {
              console.error('Failed to click element:', e);
            }
          }

          actionResult = {
            action,
            preset: actionObj.preset,
            customStart: actionObj.customStart,
            customEnd: actionObj.customEnd,
            categories: actionObj.categories,
            accounts: actionObj.accounts,
          };

          currentSteps.push(`Tool Call: ${action}`);
          await finalizeStreamingMessage(
            currentResponse,
            actionResult,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation'
          );
          break;
        }

        // Finalize this turn's streaming message as 'tool_select'
        await finalizeStreamingMessage(
          currentResponse,
          actionResult,
          currentSteps,
          { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
          'tool_select'
        );

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: currentResponse,
          actionResult,
          steps: [...currentSteps],
          tokenUsage: { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
          purpose: 'tool_select'
        };

        if (systemResultsMsg) {
          await addMessage(systemResultsMsg);
          conversationHistory = [
            ...conversationHistory,
            assistantMsg,
            systemResultsMsg
          ];
        } else {
          break;
        }
      }
    } catch (err: any) {
      currentSteps.push(`Error: ${err.message}`);
      await finalizeStreamingMessage(
        `Error: ${err.message}`,
        null,
        currentSteps,
        { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
        'explanation'
      );
    } finally {
      setLoading(false);
    }
  };

  return { sendPromptText, loading };
}
