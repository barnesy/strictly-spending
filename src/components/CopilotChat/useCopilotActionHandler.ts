import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFilters, resolveDateRange } from '../../store';
import { useChatStore, formatModelName } from '../../chatStore';
import { useShallow } from 'zustand/react/shallow';
import { useDataStore } from '../../dataStore';
import { localAI, type ChatMessage, parseAIResponse, calculateGlobalRunwayData, COPILOT_RESPONSE_SCHEMA } from '../../ai';
import { db } from '../../db';
import { detectSubscriptionAlerts, detectSpendingAnomalies } from '../../copilotAnalytics';
import { generateAccessibilityReport } from '../../accessibilityAuditor';
import { executeCopilotCommand, matchCategories, matchAccounts, getMonthsInRange, aggregateTransactions } from '../../copilotMatcher';
import { buildRecurrenceMap } from '../../recurrence';
import { buildForecast } from '../../forecast';
import { useBudgetStore } from '../../budgetStore';
import type { ProposedCategorizationItem } from '../../types';

import { generatePnlData, generateBalanceSheetData, generateLedgerData, generateExpenseSummaryData } from '../../pnlGenerator';

function findMatchingSkillForPrompt(prompt: string, skills: any[]): any | null {
  const normPrompt = prompt.toLowerCase();
  
  if (
    normPrompt.includes('p&l') || 
    normPrompt.includes('profit and loss') || 
    normPrompt.includes('profit & loss') || 
    normPrompt.includes('income statement')
  ) {
    const matched = skills.find(s => s.id === 'builtin:pnl' || s.name.toLowerCase().includes('profit'));
    if (matched) return matched;
  }
  
  if (
    normPrompt.includes('runway') || 
    normPrompt.includes('rundown') || 
    normPrompt.includes('reserves') || 
    normPrompt.includes('cash projection')
  ) {
    const matched = skills.find(s => s.id === 'builtin:runway' || s.name.toLowerCase().includes('runway'));
    if (matched) return matched;
  }
  
  if (
    normPrompt.includes('categorize') || 
    normPrompt.includes('sort') || 
    normPrompt.includes('classify') || 
    normPrompt.includes('organize')
  ) {
    const matched = skills.find(s => s.id === 'builtin:categorization' || s.name.toLowerCase().includes('categoriz'));
    if (matched) return matched;
  }

  if (
    normPrompt.includes('balance sheet') || 
    normPrompt.includes('assets liabilities') || 
    normPrompt.includes('equity statement')
  ) {
    const matched = skills.find(s => s.id === 'builtin:balance_sheet');
    if (matched) return matched;
  }

  if (
    normPrompt.includes('ledger') || 
    normPrompt.includes('general ledger') || 
    normPrompt.includes('transaction log')
  ) {
    const matched = skills.find(s => s.id === 'builtin:ledger');
    if (matched) return matched;
  }

  if (
    normPrompt.includes('expense summary') || 
    normPrompt.includes('expenses by category') || 
    normPrompt.includes('schedule c category') ||
    normPrompt.includes('schedule c categories')
  ) {
    const matched = skills.find(s => s.id === 'builtin:expense_summary');
    if (matched) return matched;
  }

  if (
    normPrompt.includes('mileage') || 
    normPrompt.includes('travel log') || 
    normPrompt.includes('mileage log') || 
    normPrompt.includes('odometer')
  ) {
    const matched = skills.find(s => s.id === 'builtin:mileage_log');
    if (matched) return matched;
  }

  if (
    normPrompt.includes('asset log') || 
    normPrompt.includes('asset purchase') || 
    normPrompt.includes('asset purchases') || 
    normPrompt.includes('equipment purchase') || 
    normPrompt.includes('depreciation')
  ) {
    const matched = skills.find(s => s.id === 'builtin:assets');
    if (matched) return matched;
  }

  if (
    normPrompt.includes('estimated payment') || 
    normPrompt.includes('estimated payments') || 
    normPrompt.includes('estimated tax') || 
    normPrompt.includes('1040-es') || 
    normPrompt.includes('1040 es')
  ) {
    const matched = skills.find(s => s.id === 'builtin:payments_estimated');
    if (matched) return matched;
  }

  if (
    normPrompt.includes('w2') || 
    normPrompt.includes('w-2') || 
    normPrompt.includes('w3') || 
    normPrompt.includes('w-3') || 
    normPrompt.includes('employee summary') || 
    normPrompt.includes('payroll summary')
  ) {
    const matched = skills.find(s => s.id === 'builtin:w2_w3');
    if (matched) return matched;
  }

  if (
    normPrompt.includes('1099 nec') || 
    normPrompt.includes('1099-nec') || 
    normPrompt.includes('1099 issued') || 
    normPrompt.includes('issued 1099')
  ) {
    const matched = skills.find(s => s.id === 'builtin:1099_issued');
    if (matched) return matched;
  }

  for (const skill of skills) {
    if (!skill.enabled) continue;
    const normName = skill.name.toLowerCase();
    if (normPrompt.includes(normName) || normName.includes(normPrompt)) {
      return skill;
    }
    if (skill.testCases) {
      for (const tc of skill.testCases) {
        const normTc = tc.prompt.toLowerCase();
        if (normPrompt.includes(normTc) || normTc.includes(normPrompt)) {
          return skill;
        }
      }
    }
  }

  return null;
}

export function useCopilotActionHandler() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const abortControllerRef = useRef<AbortController | null>(null);

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
  } = useFilters(useShallow((s) => ({
    preset: s.preset,
    setPreset: s.setPreset,
    setCustomRange: s.setCustomRange,
    customStart: s.customStart,
    customEnd: s.customEnd,
    searchQuery: s.searchQuery,
    setSearchQuery: s.setSearchQuery,
    disabledCategories: s.disabledCategories,
    setDisabledCategories: s.setDisabledCategories,
    enabledAccountIds: s.enabledAccountIds,
    setEnabledAccounts: s.setEnabledAccounts,
    earliestTransactionDate: s.earliestTransactionDate,
    latestTransactionDate: s.latestTransactionDate,
    minPrice: s.minPrice,
    maxPrice: s.maxPrice,
    setMinPrice: s.setMinPrice,
    setMaxPrice: s.setMaxPrice,
  })));

  const {
    messages,
    addMessage,
    startStreamingMessage,
    appendStreamingToken,
    updateStreamingMetadata,
    finalizeStreamingMessage,
    modelName,
  } = useChatStore(useShallow((s) => ({
    messages: s.messages,
    addMessage: s.addMessage,
    startStreamingMessage: s.startStreamingMessage,
    appendStreamingToken: s.appendStreamingToken,
    updateStreamingMetadata: s.updateStreamingMetadata,
    finalizeStreamingMessage: s.finalizeStreamingMessage,
    modelName: s.modelName,
  })));

  const getExecutorContext = async () => {
    const store = useDataStore.getState();
    const categories = store.categories;
    const accounts = store.accounts;
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

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    const userMsg: ChatMessage = { role: 'user', content: textToSubmit.trim() };
    addMessage(userMsg);
    setLoading(true);

    let totalPrompt = 0;
    let totalCompletion = 0;
    const currentSteps = ['Analyzing request intent...'];
    
    let currentSkillId: string | undefined;
    let currentCompletedStages: string[] = [];

    try {
      if (!localAI.isLoaded) {
        addMessage({
          role: 'assistant',
          content: `Please initialize ${formatModelName(modelName)} first!`,
        });
        return;
      }

      const store = useDataStore.getState();
      const categories = store.categories;
      const accounts = store.accounts;
      
      const enabledAccounts = accounts.filter((a) => a.enabled);
      let currentCash = enabledAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
      if (currentCash === 0) {
        currentCash = 10000;
      }

      const incomeSetting = await db.settings.get('monthlyIncome');
      let monthlyIncome = incomeSetting ? Number(incomeSetting.value) : 0;

      if (monthlyIncome === 0) {
        const allTxns = store.transactions;
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

      // Multi-Step Skill Tracking
      const allSkills = ((await db.settings.get('app:agentSkills'))?.value as any[]) || [];
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.activeSkillId);
      
      const matchedSkill = findMatchingSkillForPrompt(textToSubmit, allSkills);
      if (matchedSkill) {
        currentSkillId = matchedSkill.id;
        currentCompletedStages = [];
      } else {
        const activeSkill = allSkills.find(s => s.id === lastAssistantMsg?.activeSkillId);
        let lastAction = 'none';
        if (lastAssistantMsg) {
          try {
            const parsed = parseAIResponse(lastAssistantMsg.content);
            lastAction = parsed?.agent_action?.action || 'none';
          } catch {}
        }
        
        const hasUncompletedStages = activeSkill && activeSkill.stages && activeSkill.stages.length > 0 &&
          lastAssistantMsg?.completedStages && lastAssistantMsg.completedStages.length < activeSkill.stages.length;
          
        const isStillRunningActions = activeSkill && lastAction !== 'none';
        
        if (hasUncompletedStages || isStillRunningActions) {
          currentSkillId = lastAssistantMsg.activeSkillId;
          currentCompletedStages = lastAssistantMsg.completedStages || [];
        } else {
          currentSkillId = undefined;
          currentCompletedStages = [];
        }
      }

      let pnlReportMarkdown = '';
      let pnlSpreadsheetCsv = '';
      let pnlSpreadsheetDocId = '';
      let lastQueryStart = '';
      let lastQueryEnd = '';
      let lastQueryCats: string[] = [];
      let lastQueryAccts: number[] = [];
      let lastQuerySearch = '';
      let lastQueryMinPrice: number | undefined = undefined;
      let lastQueryMaxPrice: number | undefined = undefined;
      while (loops < maxLoops) {
        if (signal.aborted) {
          throw new DOMException('aborted', 'AbortError');
        }
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

        // Load active skill definitions (without system enforcement overrides)
        const activeSkill = allSkills.find(s => s.id === currentSkillId);

        let customSchema: any = undefined;
        if (isLastLoop) {
          customSchema = JSON.parse(JSON.stringify(COPILOT_RESPONSE_SCHEMA));
          if (customSchema.properties?.agent_action?.properties?.action) {
            customSchema.properties.agent_action.properties.action.enum = ['none'];
          }
        } else if (activeSkill && activeSkill.stages) {
          const expectedStage = activeSkill.stages[currentCompletedStages.length];
          if (expectedStage) {
            customSchema = JSON.parse(JSON.stringify(COPILOT_RESPONSE_SCHEMA));
            if (customSchema.properties?.agent_action?.properties?.action) {
              customSchema.properties.agent_action.properties.action.enum = [expectedStage.requiredAction];
            }
          } else {
            customSchema = JSON.parse(JSON.stringify(COPILOT_RESPONSE_SCHEMA));
            if (customSchema.properties?.agent_action?.properties?.action) {
              customSchema.properties.agent_action.properties.action.enum = ['none'];
            }
          }
        }

        currentResponse = await localAI.chatCopilot(
          activeHistory,
          stateContext,
          undefined,
          customSchema,
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
          },
          signal
        );

        const parsedJson = parseAIResponse(currentResponse);

        if (!parsedJson) {
          currentSteps.push('Plain-text response completed.');
          await finalizeStreamingMessage(
            currentResponse,
            null,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation',
            currentSkillId,
            currentCompletedStages
          );
          break;
        }

        const actionObj = parsedJson.agent_action || parsedJson;
        let action = actionObj.action || 'none';
        if (isLastLoop) {
          action = 'none';
        }

        let feedbackError: string | null = null;

        // Dynamic Stage Completion check:
        if (activeSkill && activeSkill.stages) {
          const expectedStage = activeSkill.stages[currentCompletedStages.length];
          if (expectedStage && action === expectedStage.requiredAction) {
            currentSteps.push(`Skill Stage: ${expectedStage.title}`);
            currentCompletedStages = [...currentCompletedStages, action];
          }
        }

        // Safety net: Force data query before P&L document generation
        if (action === 'generate_document' && actionObj.documentType === 'business_pnl') {
          if (!pnlReportMarkdown) {
            console.warn("Safety net triggered: LLM tried to generate P&L document without querying data first.");
            feedbackError = "Error: You cannot generate a Profit & Loss document without querying the transaction data first. You must first call 'query_data' with categories: ['all'] and preset: 'ytd' to fetch the real numbers.";
            action = 'none';
          }
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
            'tool_select',
            currentSkillId,
            currentCompletedStages
          );

          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: currentResponse,
            steps: [...currentSteps],
            tokenUsage: { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            purpose: 'tool_select',
            activeSkillId: currentSkillId,
            completedStages: currentCompletedStages
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

        if (action === 'query_data') {
          let queryCats = actionObj.categories || actionObj.category || [];
          let queryAccts = actionObj.accounts || actionObj.account || [];
          if (!Array.isArray(queryCats)) queryCats = [queryCats];
          if (!Array.isArray(queryAccts)) queryAccts = [queryAccts];

          const store = useDataStore.getState();
          const allCats = store.categories;
          const allAccts = store.accounts;

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
          const allCats = useDataStore.getState().categories;
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
            'tool_select',
            currentSkillId,
            currentCompletedStages
          );

          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: currentResponse,
            steps: [...currentSteps],
            tokenUsage: { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            purpose: 'tool_select',
            activeSkillId: currentSkillId,
            completedStages: currentCompletedStages
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
            'explanation',
            currentSkillId,
            currentCompletedStages
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
            start = start || currentFilters.earliestTransactionDate || '2000-01-01';
            end = end || currentFilters.latestTransactionDate || new Date().toISOString().slice(0, 10);
          }
          
          let queryCats = actionObj.categories || actionObj.category || [];
          let queryAccts = actionObj.accounts || actionObj.account || [];
          if (!Array.isArray(queryCats)) queryCats = [queryCats];
          if (!Array.isArray(queryAccts)) queryAccts = [queryAccts];

          const store = useDataStore.getState();
          const allCats = store.categories;
          const allAccts = store.accounts;
          const allTxns = store.transactions;

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

          const budgets = store.budgets;
          const overrides = store.merchantOverrides;
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

            const monthlyTable = [
              '| Month | Spend Amount |',
              '| :--- | ---: |',
              ...Array.from(monthsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mKey, amt]) => {
                const formattedLabel = new Date(mKey + '-02').toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                return `| ${formattedLabel} | $${amt.toFixed(2)} |`;
              })
            ].join('\n');

            const yearlyTable = [
              '| Year | Spend Amount |',
              '| :--- | ---: |',
              ...Array.from(yearsMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([yKey, amt]) => {
                return `| ${yKey} | $${amt.toFixed(2)} |`;
              })
            ].join('\n');

            breakdownText = `\n\nMonthly Spend Breakdown:\n${monthlyTable}\n\nYearly Spend Breakdown:\n${yearlyTable}`;
          }

          const categorySpendMap = new Map<string, number>();
          for (const t of matchedTxns) {
            categorySpendMap.set(t.category, (categorySpendMap.get(t.category) || 0) + (t.category.toLowerCase() === 'income' ? t.amount : -t.amount));
          }

          if (resolvedCats.length > 1 || queryCats.includes('all') || queryCats.length === 0) {
            const catTable = [
              '| Category | Spend Amount |',
              '| :--- | ---: |',
              ...Array.from(categorySpendMap.entries())
                .sort((a,b) => b[1] - a[1])
                .map(([cat, amt]) => `| ${cat} | $${amt.toFixed(2)} |`)
            ].join('\n');
            breakdownText += `\n\nCategory Breakdown:\n${catTable}`;
          }

          // Pre-calculate a beautiful, structured P&L markdown statement in a table if we have global transaction details.
          const hasIncome = resolvedCats.some(c => c.toLowerCase() === 'income');
          const isGlobalQuery = queryCats.includes('all') || queryCats.length === 0;
          if (hasIncome || isGlobalQuery) {
            pnlSpreadsheetDocId = crypto.randomUUID();
            const mdDocId = crypto.randomUUID();
            const { pnlReportMarkdown: compiledMd, pnlSpreadsheetCsv: compiledCsv } = await generatePnlData({
              start,
              end,
              resolvedCats,
              resolvedAccts,
              search: searchVal || undefined,
              minPrice: minPriceVal,
              maxPrice: maxPriceVal,
              markdownDocId: mdDocId,
              spreadsheetDocId: pnlSpreadsheetDocId
            });
            pnlReportMarkdown = compiledMd;
            pnlSpreadsheetCsv = compiledCsv;
          }

          systemResultsMsg = {
            role: 'system',
            content: `Database Query Results for categories [${queryCats.join(', ')}] between ${start} and ${end}:
- Total Spent: $${metrics.totalSpend.toFixed(2)}
- Number of Transactions: ${metrics.spendCount}
- Average Transaction: $${metrics.spendAverage.toFixed(2)}
- Total Monthly Budget Limit: $${metrics.totalBudget.toFixed(2)}${breakdownText}

If these results provide the data you need to fulfill the user's request, proceed with your final response (e.g. set 'action' to 'none') OR your next tool action (e.g. 'generate_document').
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

          lastQueryStart = start;
          lastQueryEnd = end;
          lastQueryCats = resolvedCats;
          lastQueryAccts = resolvedAccts;
          lastQuerySearch = searchVal || '';
          lastQueryMinPrice = minPriceVal;
          lastQueryMaxPrice = maxPriceVal;

          currentSteps.push(`Tool Call: query_data (categories: ${resolvedCats.join(', ')})`);

        } else if (action === 'subscription_alerts') {
          const currentFilters = useFilters.getState();
          const searchVal = currentFilters.searchQuery;
          const minPriceVal = currentFilters.minPrice;
          const maxPriceVal = currentFilters.maxPrice;
          const enabledSet = new Set(currentFilters.enabledAccountIds);

          const store = useDataStore.getState();
          const allTxns = store.transactions;
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

          const overrides = store.merchantOverrides;
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
            start = start || currentFilters.earliestTransactionDate || '2000-01-01';
            end = end || currentFilters.latestTransactionDate || new Date().toISOString().slice(0, 10);
          }
          let queryCats = actionObj.categories || [];
          if (!Array.isArray(queryCats)) queryCats = [queryCats];

          const store = useDataStore.getState();
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

          const searchVal = currentFilters.searchQuery;
          const minPriceVal = currentFilters.minPrice;
          const maxPriceVal = currentFilters.maxPrice;
          const enabledSet = new Set(currentFilters.enabledAccountIds);

          const allTxns = store.transactions;
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

          const budgets = store.budgets;
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

        } else if (action === 'categorize_transactions') {
          const licenseSetting = await db.settings.get('license');
          const license = licenseSetting?.value as { active: boolean } | undefined;
          if (!license?.active) {
            feedbackError = "Error: A license key is required to use AI features. Please activate your license on the Local Model page first.";
          } else {
            const currentFilters = useFilters.getState();
            const store = useDataStore.getState();
            const uncategorizedAll = store.transactions.filter(t => t.category === 'Uncategorized');
            const uncategorized = currentFilters.demoMode
              ? uncategorizedAll.filter((t) => t.source === 'demo')
              : uncategorizedAll.filter((t) => t.source !== 'demo');

            const totalCount = uncategorized.length;
            if (totalCount === 0) {
              systemResultsMsg = {
                role: 'system',
                content: `Categorization Results:
- Total Uncategorized Transactions Processed: 0
- Status: No uncategorized transactions to classify.

Explain to the user that there are no uncategorized transactions to classify in the current view.`
              };
              actionResult = {
                action: 'categorize_transactions',
                processedCount: 0,
              };
              currentSteps.push('Tool Call: categorize_transactions (0 transactions)');
            } else {
              const allCats = store.categories;
              const catNames = allCats.map((c) => c.name);
              const chunkSize = 12;
              const chunksCount = Math.ceil(totalCount / chunkSize);

              currentSteps.push(`Starting AI classification for ${totalCount} transactions...`);
              updateStreamingMetadata(currentSteps);

              const proposedItems: ProposedCategorizationItem[] = [];
              const reportId = `report-${Date.now()}`;
              let aborted = false;

              try {
                for (let c = 0; c < chunksCount; c++) {
                  if (signal.aborted) {
                    aborted = true;
                    break;
                  }

                  const startIdx = c * chunkSize;
                  const endIdx = Math.min(startIdx + chunkSize, totalCount);
                  const chunk = uncategorized.slice(startIdx, endIdx);

                  const chunkMsg = `Classifying chunk ${c + 1}/${chunksCount} (transactions ${startIdx + 1} to ${endIdx})...`;
                  currentSteps.push(chunkMsg);
                  startStreamingMessage(currentSteps, 'tool_select');

                  const toReview = chunk.map((t) => ({
                    desc: t.description,
                    ruleCategory: t.category,
                  }));

                  const aiResults = await localAI.reviewTransactions(toReview, catNames, signal);

                  if (signal.aborted) {
                    aborted = true;
                    break;
                  }

                  for (let i = 0; i < chunk.length; i++) {
                    const cat = aiResults[i];
                    if (cat && catNames.includes(cat)) {
                      proposedItems.push({
                        transactionId: chunk[i].id!,
                        description: chunk[i].description,
                        amount: chunk[i].amount,
                        date: chunk[i].date,
                        originalCategory: chunk[i].category,
                        proposedCategory: cat,
                        approved: true,
                      });
                    }
                  }

                  // Save partial report to database settings
                  await db.settings.put({
                    key: 'app:pendingCategorizationReport',
                    value: {
                      id: reportId,
                      createdAt: new Date().toISOString(),
                      items: proposedItems
                    }
                  });
                }
              } catch (chunkErr: any) {
                if (chunkErr.name === 'AbortError' || chunkErr.message?.includes('aborted')) {
                  aborted = true;
                } else {
                  console.error('AI chunk categorization failed:', chunkErr);
                  throw chunkErr;
                }
              }

              if (aborted) {
                currentSteps.push('Categorization stopped by user.');
              }

              if (proposedItems.length > 0) {
                systemResultsMsg = {
                  role: 'system',
                  content: `Categorization Proposed Report Generated:
- Total Transactions Analyzed: ${proposedItems.length}
- Status: ${aborted ? 'Interrupted (Partial Report)' : 'Complete'}
- Report ID: ${reportId}

Inform the user that you have generated a categorization proposal report for **${proposedItems.length}.00** transactions. Bold all numbers and format to exactly the second decimal place (.00) (e.g. **12.00** transactions). Explain that they can review, edit, and approve these changes before they are applied.`
                };

                actionResult = {
                  action: 'categorize_transactions',
                  processedCount: proposedItems.length,
                  reportId: reportId,
                  interrupted: aborted
                };

                currentSteps.push(`Tool Call: categorize_transactions (${proposedItems.length} transaction suggestions generated${aborted ? ' - partial' : ''})`);
              } else {
                systemResultsMsg = {
                  role: 'system',
                  content: `Categorization Results:
- Total Uncategorized Transactions Processed: 0
- Status: No categorization suggestions generated.

Inform the user that no suggestions could be generated.`
                };

                actionResult = {
                  action: 'categorize_transactions',
                  processedCount: 0,
                };

                currentSteps.push(`Tool Call: categorize_transactions (0 suggestions generated)`);
              }
            }
          }

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

        } else if (action === 'update_tax_settings') {
          const currentSettings = await db.settings.get('app:taxSettings');
          const baseValue = (currentSettings?.value as any) || { checklist: {}, hasBusiness: false, taxYear: new Date().getFullYear() };
          
          if (actionObj.taxData) {
            const merged = { ...baseValue };
            for (const key of Object.keys(actionObj.taxData)) {
              if (typeof actionObj.taxData[key] === 'object' && !Array.isArray(actionObj.taxData[key]) && actionObj.taxData[key] !== null) {
                merged[key] = { ...(merged[key] || {}), ...actionObj.taxData[key] };
              } else {
                merged[key] = actionObj.taxData[key];
              }
            }
            await db.settings.put({ key: 'app:taxSettings', value: merged });
          }

          actionResult = { action: 'update_tax_settings', taxData: actionObj.taxData };
          currentSteps.push(`Tool Call: update_tax_settings`);

          await finalizeStreamingMessage(
            currentResponse,
            actionResult,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation',
            currentSkillId,
            currentCompletedStages
          );
          break;

        } else if (action === 'update_deduction_status') {
          const isBusiness = actionObj.isBusiness;
          const taxCategory = actionObj.taxCategory;
          const deductionStatus = actionObj.deductionStatus || 'confirmed';
          const filter = actionObj.filter || {};

          let updatedCount = 0;
          await db.transaction('rw', db.transactions, async () => {
            const txns = await db.transactions.toArray();
            const matched = txns.filter(t => {
              if (filter.transactionId && t.id !== filter.transactionId) return false;
              if (filter.accountId && t.accountId !== filter.accountId) return false;
              if (filter.category && t.category !== filter.category) return false;
              if (filter.search && !t.description.toLowerCase().includes(filter.search.toLowerCase())) return false;
              return true;
            });

            const updates: Record<string, any> = {};
            if (isBusiness !== undefined) updates.isBusiness = isBusiness;
            if (taxCategory !== undefined) {
              // If it's a label, normalize it to the Schedule C ID, otherwise keep as is
              updates.taxCategory = taxCategory;
            }
            if (isBusiness === false) {
              updates.taxCategory = null; // Clear category if not business
            }
            updates.deductionStatus = deductionStatus;

            const matchedIds = matched.map(t => t.id!).filter(Boolean);
            if (matchedIds.length > 0) {
              await db.transactions.where('id').anyOf(matchedIds).modify(updates);
              updatedCount = matchedIds.length;
            }
          });

          actionResult = { action: 'update_deduction_status', updatedCount };
          currentSteps.push(`Tool Call: update_deduction_status (updated ${updatedCount} transactions)`);

          await finalizeStreamingMessage(
            currentResponse,
            actionResult,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation',
            currentSkillId,
            currentCompletedStages
          );
          break;

        } else if (action === 'generate_document') {
          const rawDocType = actionObj.documentType || '';
          const isPnl =
            currentSkillId === 'builtin:pnl' ||
            rawDocType === 'business_pnl' ||
            rawDocType === 'pnl' ||
            rawDocType === 'profit_loss' ||
            (rawDocType === '' && (
              actionObj.documentContent?.toLowerCase().includes('profit & loss') ||
              actionObj.documentContent?.toLowerCase().includes('profit and loss') ||
              actionObj.documentContent?.toLowerCase().includes('profit &amp; loss') ||
              actionObj.documentContent?.toLowerCase().includes('income statement') ||
              (actionObj.documentContent?.toLowerCase().includes('income') && actionObj.documentContent?.toLowerCase().includes('total income')) ||
              (actionObj.documentContent?.toLowerCase().includes('revenue') && actionObj.documentContent?.toLowerCase().includes('total revenue')) ||
              actionObj.documentContent?.toLowerCase().includes('net income') ||
              actionObj.documentContent?.toLowerCase().includes('net profit') ||
              actionObj.documentContent?.toLowerCase().includes('operating expenses')
            ));
          const docType = isPnl ? 'business_pnl' : rawDocType;
          let content = actionObj.documentContent || '';

          
          let generatedCsv: string | null = null;
          const isNativeDualFormat = ['business_pnl', 'business_balance_sheet', 'business_ledger', 'deduction_expense_summary'].includes(docType);

          if (isNativeDualFormat) {
            const store = useDataStore.getState();
            const allAccts = store.accounts;
            const resolvedAccts = lastQueryAccts.length > 0 ? lastQueryAccts : allAccts.map(a => a.id).filter((id): id is number => id !== undefined);
            const start = actionObj.customStart || lastQueryStart || `${new Date().getFullYear()}-01-01`;
            const end = actionObj.customEnd || lastQueryEnd || `${new Date().getFullYear()}-12-31`;
            const mdDocId = crypto.randomUUID();
            const spreadsheetDocId = crypto.randomUUID();

            if (docType === 'business_pnl') {
              if (!pnlReportMarkdown) {
                const allCats = store.categories;
                const resolvedCats = lastQueryCats.length > 0 ? lastQueryCats : allCats.map(c => c.name);
                pnlSpreadsheetDocId = spreadsheetDocId;
                const { pnlReportMarkdown: compiledMd, pnlSpreadsheetCsv: compiledCsv } = await generatePnlData({
                  start,
                  end,
                  resolvedCats,
                  resolvedAccts,
                  search: actionObj.search || lastQuerySearch || undefined,
                  minPrice: actionObj.minPrice !== undefined ? actionObj.minPrice : lastQueryMinPrice,
                  maxPrice: actionObj.maxPrice !== undefined ? actionObj.maxPrice : lastQueryMaxPrice,
                  markdownDocId: mdDocId,
                  spreadsheetDocId
                });
                pnlReportMarkdown = compiledMd;
                pnlSpreadsheetCsv = compiledCsv;
              }
              content = pnlReportMarkdown;
              generatedCsv = pnlSpreadsheetCsv;
            } else if (docType === 'business_balance_sheet') {
              const { balanceSheetMarkdown, balanceSheetCsv } = await generateBalanceSheetData({
                start,
                end,
                resolvedAccts,
                markdownDocId: mdDocId,
                spreadsheetDocId
              });
              content = balanceSheetMarkdown;
              generatedCsv = balanceSheetCsv;
            } else if (docType === 'business_ledger') {
              const { ledgerMarkdown, ledgerCsv } = await generateLedgerData({
                start,
                end,
                resolvedAccts,
                markdownDocId: mdDocId,
                spreadsheetDocId
              });
              content = ledgerMarkdown;
              generatedCsv = ledgerCsv;
            } else if (docType === 'deduction_expense_summary') {
              const { summaryMarkdown, summaryCsv } = await generateExpenseSummaryData({
                start,
                end,
                resolvedAccts,
                markdownDocId: mdDocId,
                spreadsheetDocId
              });
              content = summaryMarkdown;
              generatedCsv = summaryCsv;
            }
          }

          if (!docType || !content) {
            systemResultsMsg = {
              role: 'system',
              content: `Error: 'documentType' and 'documentContent' are required to generate a tax document.`
            };
          } else {
            try {
              let filePath: string | null = null;
              if (isNativeDualFormat && generatedCsv) {
                let baseName = 'Document';
                if (docType === 'business_pnl') baseName = 'P&L_Statement';
                if (docType === 'business_balance_sheet') baseName = 'Balance_Sheet';
                if (docType === 'business_ledger') baseName = 'General_Ledger';
                if (docType === 'deduction_expense_summary') baseName = 'Expense_Summary';

                const defaultMdFilename = `Tax_${baseName}_${new Date().getFullYear()}.md`;

                filePath = `~/Documents/${defaultMdFilename}`;

                if (filePath) {
                  const filename = filePath.split(/[\\/]/).pop() || defaultMdFilename;
                  const docId = crypto.randomUUID();

                  const store = useDataStore.getState();
                  const allCats = store.categories;
                  const allAccts = store.accounts;
                  const resolvedCats = lastQueryCats.length > 0 ? lastQueryCats : allCats.map(c => c.name);
                  const resolvedAccts = lastQueryAccts.length > 0 ? lastQueryAccts : allAccts.map(a => a.id).filter((id): id is number => id !== undefined);

                  const metadata = {
                    start: actionObj.customStart || lastQueryStart || `${new Date().getFullYear()}-01-01`,
                    end: actionObj.customEnd || lastQueryEnd || `${new Date().getFullYear()}-12-31`,
                    resolvedCats,
                    resolvedAccts,
                    docType,
                    search: actionObj.search || lastQuerySearch || undefined,
                    minPrice: actionObj.minPrice !== undefined ? actionObj.minPrice : lastQueryMinPrice,
                    maxPrice: actionObj.maxPrice !== undefined ? actionObj.maxPrice : lastQueryMaxPrice,
                  };

                  await db.documents.put({
                    id: docId,
                    name: filename,
                    path: filePath,
                    type: 'text/markdown',
                    source: 'generated',
                    associatedChecklistId: docType,
                    createdAt: new Date().toISOString(),
                    metadata
                  });

                  await db.documentContents.put({
                    id: docId,
                    content
                  });

                  const currentSettings = await db.settings.get('app:taxSettings');
                  const taxSettings = (currentSettings?.value as any) || { checklist: {}, hasBusiness: false, taxYear: new Date().getFullYear() };
                  taxSettings.checklist[docType] = true;
                  await db.settings.put({ key: 'app:taxSettings', value: taxSettings });

                  systemResultsMsg = {
                    role: 'system',
                    content: `Document successfully generated. The document has been automatically attached to the tax checklist item '${docType}' and stored in the Documents tab.`
                  };

                  actionResult = {
                    action: 'generate_document',
                    documentType: docType,
                    documentId: docId,
                    documentName: filename,
                    content,
                    path: filePath
                  };
                }
              } else {
                // Non-P&L / fallback documents
                const isCsv = content.trim().startsWith('Date') || content.trim().includes(',') || content.trim().startsWith('Category,');
                const defaultExt = isCsv ? 'csv' : 'md';
                
                let defaultFilename = `Tax_Document_${new Date().getFullYear()}.${defaultExt}`;
                if (docType === 'deduction_mileage_log') {
                  defaultFilename = `Tax_Mileage_Log_${new Date().getFullYear()}.${defaultExt}`;
                } else if (docType === 'deduction_assets') {
                  defaultFilename = `Tax_Asset_Log_${new Date().getFullYear()}.${defaultExt}`;
                } else if (docType === 'payments_estimated') {
                  defaultFilename = `Tax_Estimated_Payments_${new Date().getFullYear()}.${defaultExt}`;
                } else if (docType === 'deduction_w2_w3') {
                  defaultFilename = `Tax_W2_W3_Summary_${new Date().getFullYear()}.${defaultExt}`;
                } else if (docType === 'deduction_1099_issued') {
                  defaultFilename = `Tax_1099_NEC_Issued_${new Date().getFullYear()}.${defaultExt}`;
                }
                
                filePath = `~/Documents/${defaultFilename}`;

                if (filePath) {
                  const filename = filePath.split(/[\\/]/).pop() || 'Generated_Document';
                  const newDocId = crypto.randomUUID();

                  if (docType) {
                    await db.documents.put({
                      id: newDocId,
                      name: filename,
                      path: filePath,
                      type: isCsv ? 'text/csv' : 'text/markdown',
                      source: 'generated',
                      associatedChecklistId: docType,
                      createdAt: new Date().toISOString()
                    });

                    await db.documentContents.put({
                      id: newDocId,
                      content
                    });
                    
                    const currentSettings = await db.settings.get('app:taxSettings');
                    const taxSettings = (currentSettings?.value as any) || { checklist: {}, hasBusiness: false, taxYear: new Date().getFullYear() };
                    taxSettings.checklist[docType] = true;
                    await db.settings.put({ key: 'app:taxSettings', value: taxSettings });

                    systemResultsMsg = {
                      role: 'system',
                      content: `Document successfully generated. The document has been automatically attached to the tax checklist item '${docType}' and stored in the Documents tab.`
                    };
                  } else {
                    await db.documents.put({
                      id: newDocId,
                      name: filename,
                      path: filePath,
                      type: isCsv ? 'text/csv' : 'text/markdown',
                      source: 'generated',
                      createdAt: new Date().toISOString()
                    });

                    await db.documentContents.put({
                      id: newDocId,
                      content
                    });

                    systemResultsMsg = {
                      role: 'system',
                      content: `Document successfully generated and stored in the Documents tab.`
                    };
                  }

                  actionResult = {
                    action: 'generate_document',
                    documentType: docType,
                    documentId: newDocId,
                    documentName: filename,
                    content,
                    path: filePath
                  };
                }
              }
} catch (err: any) {
              systemResultsMsg = {
                role: 'system',
                content: `Failed to save document: ${err.message}`
              };
            }
          }
          currentSteps.push(`Tool Call: generate_document`);

          await finalizeStreamingMessage(
            currentResponse,
            actionResult,
            currentSteps,
            { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
            'explanation',
            currentSkillId,
            currentCompletedStages
          );
          break;

        } else if (action === 'dom_update') {
          executeCopilotCommand(actionObj, await getExecutorContext());
          const selector = actionObj.domSelector;
          let success = false;
          let errorMessage = '';
          if (selector) {
            try {
              const element = document.querySelector(selector) as HTMLElement;
              if (element) {
                element.click();
                success = true;
              } else {
                errorMessage = `Element with selector "${selector}" not found.`;
              }
            } catch (e: any) {
              errorMessage = e.message;
            }
          } else {
            errorMessage = 'No domSelector provided.';
          }

          actionResult = {
            action,
            domSelector: selector,
            success
          };

          currentSteps.push(`Tool Call: dom_update (${selector})`);

          systemResultsMsg = {
            role: 'system',
            content: success
              ? `Successfully clicked DOM element: "${selector}". The page state/UI has been updated. Please inspect the new state and provide your response or next action.`
              : `Failed to click DOM element: "${selector}". Error: ${errorMessage}`
          };

        } else if (
          action === 'navigate' ||
          action === 'search' ||
          action === 'filter'
        ) {
          executeCopilotCommand(actionObj, await getExecutorContext());

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
            'explanation',
            currentSkillId,
            currentCompletedStages
          );
          break;
        }

        // Finalize this turn's streaming message as 'tool_select'
        await finalizeStreamingMessage(
          currentResponse,
          actionResult,
          currentSteps,
          { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
          'tool_select',
          currentSkillId,
          currentCompletedStages
        );

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: currentResponse,
          actionResult,
          steps: [...currentSteps],
          tokenUsage: { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
          purpose: 'tool_select',
          activeSkillId: currentSkillId,
          completedStages: currentCompletedStages
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
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      if (isAbort) {
        currentSteps.push('Stopped by user.');
        await finalizeStreamingMessage(
          'Stopped by user.',
          null,
          currentSteps,
          undefined,
          'explanation',
          currentSkillId,
          currentCompletedStages
        );
      } else {
        currentSteps.push(`Error: ${err.message}`);
        await finalizeStreamingMessage(
          `Error: ${err.message}`,
          null,
          currentSteps,
          { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
          'explanation',
          currentSkillId,
          currentCompletedStages
        );
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const stopPromptExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  };

  return { sendPromptText, stopPromptExecution, loading };
}
