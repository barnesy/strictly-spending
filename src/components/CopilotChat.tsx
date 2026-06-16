import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Stack,
  Paper,
  CircularProgress,
  LinearProgress,
  Button,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFilters, resolveDateRange } from '../store';
import { useChatStore, formatModelName } from '../chatStore';
import { localAI, type ChatMessage, parseAIResponse, getMessageDisplayContent, extractFieldUsingRegex, calculateGlobalRunwayData } from '../ai';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import CopilotQueryResult from './CopilotQueryResult';
import { detectSubscriptionAlerts, detectSpendingAnomalies } from '../copilotAnalytics';
import { generateAccessibilityReport } from '../accessibilityAuditor';
import { executeCopilotCommand, matchCategories, matchAccounts, getMonthsInRange, aggregateTransactions } from '../copilotMatcher';
import { buildRecurrenceMap } from '../recurrence';
import { buildForecast } from '../forecast';
import { useBudgetStore } from '../budgetStore';
import SimpleMarkdown from './SimpleMarkdown';

interface CopilotChatProps {
  onClose?: () => void;
  showCloseButton?: boolean;
  isEmbedded?: boolean;
}

function renderMessageContent(m: ChatMessage): string {
  if (m.role !== 'assistant') return m.content;
  try {
    const parsed = parseAIResponse(m.content);
    if (parsed) {
      return getMessageDisplayContent(parsed);
    }
  } catch {
    // Ignore and fall through
  }

  // Regex safety net
  const bodyField = extractFieldUsingRegex(m.content, 'body') || 
                    extractFieldUsingRegex(m.content, 'explanation') || 
                    extractFieldUsingRegex(m.content, 'message') || 
                    extractFieldUsingRegex(m.content, 'text');
  if (bodyField) return bodyField;

  // Last fallback if it looks like JSON but failed to parse/extract
  const trimmed = m.content.trim();
  if (trimmed.startsWith('{') || trimmed.includes('```json') || trimmed.includes('"body"')) {
    return "I processed your request, but encountered a formatting issue while rendering the response.";
  }

  return m.content;
}

interface GenUXConfirmationProps {
  options: string[];
  onConfirm: (text: string) => void;
  disabled?: boolean;
}

function GenUXConfirmation({ options, onConfirm, disabled }: GenUXConfirmationProps) {
  const [submitted, setSubmitted] = useState(false);
  const confirmText = options[0] || 'Confirm';
  const cancelText = options[1] || 'Cancel';

  const handleClick = (text: string) => {
    setSubmitted(true);
    onConfirm(text);
  };

  const isDisabled = disabled || submitted;

  return (
    <Box sx={{ width: '85%', mt: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <Stack direction="row" spacing={2} justifyContent="flex-start">
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => handleClick(confirmText)}
            disabled={isDisabled}
            sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
          >
            {confirmText}
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            onClick={() => handleClick(cancelText)}
            disabled={isDisabled}
            sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
          >
            {cancelText}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

interface GenUXFormProps {
  options: string[];
  onSubmit: (formattedResponse: string) => void;
  disabled?: boolean;
}

function GenUXForm({ options, onSubmit, disabled }: GenUXFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleFieldChange = (field: string, val: string) => {
    setValues(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const summary = `Submitted form details: ${options.map(opt => `${opt}: "${values[opt] || ''}"`).join(', ')}`;
    onSubmit(summary);
  };

  const isDisabled = disabled || submitted;

  return (
    <Box sx={{ width: '85%', mt: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            {options.map((opt) => (
              <TextField
                key={opt}
                label={opt}
                size="small"
                fullWidth
                value={values[opt] || ''}
                onChange={(e) => handleFieldChange(opt, e.target.value)}
                disabled={isDisabled}
                slotProps={{
                  inputLabel: { shrink: true }
                }}
              />
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="contained"
                size="small"
                disabled={isDisabled}
                sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
              >
                Submit Form
              </Button>
            </Box>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}

export default function CopilotChat({
  onClose,
  showCloseButton = false,
  isEmbedded = false,
}: CopilotChatProps) {
  const {
    preset,
    setPreset,
    setCustomRange,
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
    clearMessages,
    aiLoaded,
    aiStatus,
    aiProgress,
    aiProgressPercent,
    initializeAI,
    checkAIStatus,
    modelName,
    activeThreadId,
    threads,
    setActiveThreadId,
    loadThreads,
    createThread,
    deleteThread,
  } = useChatStore();

  useEffect(() => {
    checkAIStatus();
    loadThreads();
  }, [checkAIStatus, loadThreads]);

  useEffect(() => {
    if (threads.length > 0 && !activeThreadId) {
      setActiveThreadId(threads[0].id);
    } else if (threads.length === 0 && activeThreadId === null) {
      createThread();
    }
  }, [threads, activeThreadId, setActiveThreadId, createThread]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, aiStatus]);

  const getExecutorContext = () => ({
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
  });

  const handleApplyFilters = (actionResult: any) => {
    executeCopilotCommand({
      preset: actionResult.preset,
      customStart: actionResult.customStart,
      customEnd: actionResult.customEnd,
      categories: actionResult.categories,
      accounts: actionResult.accounts,
      minPrice: actionResult.minPrice,
      maxPrice: actionResult.maxPrice,
    }, getExecutorContext());
  };

  const sendPromptText = async (textToSubmit: string) => {
    if (!textToSubmit.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: textToSubmit.trim() };
    addMessage(userMsg);
    setLoading(true);

    try {
      if (!localAI.isLoaded) {
        addMessage({
          role: 'assistant',
          content: `Please initialize ${formatModelName(modelName)} first!`,
        });
        return;
      }

      // Calculate current cash reserves by summing currentBalance of all enabled accounts
      const activeDbAccounts = await db.accounts.toArray();
      const enabledAccounts = activeDbAccounts.filter((a) => a.enabled);
      let currentCash = enabledAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
      if (currentCash === 0) {
        currentCash = 10000;
      }

      const incomeSetting = await db.settings.get('monthlyIncome');
      let monthlyIncome = incomeSetting ? Number(incomeSetting.value) : 0;

      // Fallback: Calculate dynamic monthly income if expected income is 0 or unset
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

      const responseText = await localAI.chatCopilot(
        [...messages, userMsg],
        stateContext
      );

      let currentResponse = responseText;
      let conversationHistory = [...messages, userMsg];
      let loops = 0;
      const maxLoops = 2;

      while (loops < maxLoops) {
        loops++;
        const parsedJson = parseAIResponse(currentResponse);

        if (!parsedJson) {
          addMessage({ role: 'assistant', content: currentResponse });
          break;
        }

        const actionObj = parsedJson.agent_action || parsedJson;
        const action = actionObj.action;

        let feedbackError: string | null = null;

        if (action === 'query_data') {
          const queryCats = actionObj.categories || [];
          const queryAccts = actionObj.accounts || [];

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
            feedbackError = `Error: The requested categories [${queryCats.join(', ')}] could not be matched. 
Available Categories: [${allCats.map(c => c.name).join(', ')}]. 
Please correct the category names and try again.`;
          } else if (hasAcctsQuery && resolvedAccts.length === 0) {
            feedbackError = `Error: The requested accounts [${queryAccts.join(', ')}] could not be matched. 
Available Accounts: [${allAccts.map(a => a.name).join(', ')}]. 
Please correct the account names and try again.`;
          }
        } else if (action === 'spending_anomalies') {
          const queryCats = actionObj.categories || [];
          const allCats = await db.categories.toArray();
          const resolvedCats = queryCats.includes('all') || queryCats.length === 0
            ? allCats.map(c => c.name)
            : matchCategories(queryCats, allCats);

          const hasCatsQuery = queryCats.length > 0 && !queryCats.includes('all');

          if (hasCatsQuery && resolvedCats.length === 0) {
            feedbackError = `Error: The requested categories [${queryCats.join(', ')}] could not be matched for spending anomalies. 
Available Categories: [${allCats.map(c => c.name).join(', ')}]. 
Please correct the category names and try again.`;
          }
        } else if (action === 'dom_update') {
          const selector = actionObj.domSelector;
          if (!selector) {
            feedbackError = `Error: Action 'dom_update' requires a 'domSelector' field. Please specify a valid CSS selector.`;
          } else {
            try {
              const element = document.querySelector(selector);
              if (!element) {
                feedbackError = `Error: The CSS selector "${selector}" could not be found on the page. 
Please verify the page hierarchy and provide a correct CSS selector that actually exists.`;
              }
            } catch (e: any) {
              feedbackError = `Error: The CSS selector "${selector}" is invalid. Error: ${e.message}`;
            }
          }
        }

        if (feedbackError) {
          if (loops < maxLoops) {
            console.warn("Self-correction triggered due to:", feedbackError);
            conversationHistory = [
              ...conversationHistory,
              { role: 'assistant', content: currentResponse },
              { role: 'system', content: feedbackError }
            ];
            currentResponse = await localAI.chatCopilot(conversationHistory, stateContext);
            continue;
          } else {
            addMessage({
              role: 'assistant',
              content: `Execution failed. ${feedbackError}`,
            });
            break;
          }
        }

        if (action === 'query_data') {
          const currentFilters = useFilters.getState();
          let start = actionObj.customStart;
          let end = actionObj.customEnd;
          if (!start && !end) {
            const effectivePreset = actionObj.preset || currentFilters.preset;
            const range = resolveDateRange({
              ...currentFilters,
              preset: effectivePreset
            });
            start = range.start.toISOString().slice(0, 10);
            end = range.end.toISOString().slice(0, 10);
          } else {
            start = start || '2000-01-01';
            end = end || new Date().toISOString().slice(0, 10);
          }
          
          const queryCats = actionObj.categories || [];
          const queryAccts = actionObj.accounts || [];

          const allCats = await db.categories.toArray();
          const allAccts = await db.accounts.toArray();
          const allTxns = await db.transactions.toArray();

          const resolvedCats = queryCats.includes('all') || queryCats.length === 0
            ? allCats.map(c => c.name)
            : matchCategories(queryCats, allCats);

          const resolvedAccts = queryAccts.includes('all') || queryAccts.length === 0
            ? allAccts.map(a => a.id).filter((id): id is number => id !== undefined)
            : matchAccounts(queryAccts, allAccts);

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
            // Variable portion
            if (!excludedBudgetCategories.has(catName)) {
              const b = budgets.find(x => x.category.toLowerCase() === catNameLower);
              if (b) {
                monthlyBudget += b.monthlyAmount;
              }
            }
            // Recurring portion
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
            transactions: matchedTxns.map(t => ({
              id: t.id,
              accountId: t.accountId,
              date: t.date,
              description: t.description,
              amount: t.amount,
              category: t.category,
              source: t.source
            }))
          };

          // Calculate breakdowns for the LLM text explanation
          let breakdownText = '';
          if (numMonths > 1.0) {
            // Group txns by month
            const monthsMap = new Map<string, number>();
            for (const t of matchedTxns) {
              const isIncome = t.category.toLowerCase() === 'income';
              if (!isIncome) {
                const monthKey = t.date.slice(0, 7); // YYYY-MM
                monthsMap.set(monthKey, (monthsMap.get(monthKey) || 0) + -t.amount);
              }
            }

            // Group txns by year
            const yearsMap = new Map<string, number>();
            for (const [mKey, amt] of monthsMap.entries()) {
              const yKey = mKey.slice(0, 4);
              yearsMap.set(yKey, (yearsMap.get(yKey) || 0) + amt);
            }

            breakdownText = `\n\nMonthly Spend Breakdown:\n${Array.from(monthsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mKey, amt]) => {
              let scaledMonthBudget = monthlyBudget;
              const [y, m] = mKey.split('-').map(Number);
              const startDay = new Date(start + 'T00:00:00');
              const endDay = new Date(end + 'T00:00:00');
              const totalDays = new Date(y, m, 0).getDate();
              const mStart = new Date(y, m - 1, 1, 0, 0, 0);
              const mEnd = new Date(y, m - 1, totalDays, 0, 0, 0);
              const effStart = startDay > mStart ? startDay : mStart;
              const effEnd = endDay < mEnd ? endDay : mEnd;
              if (effStart <= effEnd) {
                const diffDays = Math.round((effEnd.getTime() - effStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                if (diffDays < totalDays) {
                  scaledMonthBudget = monthlyBudget * (diffDays / totalDays);
                }
              } else {
                scaledMonthBudget = 0;
              }
              const pct = scaledMonthBudget > 0 ? Math.round((amt / scaledMonthBudget) * 100) : 0;
              return `- ${mKey}: Spent $${amt.toFixed(2)} of Budget $${scaledMonthBudget.toFixed(2)} (${pct}% consumed)`;
            }).join('\n')}

Yearly Spend Breakdown:\n${Array.from(yearsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([yKey, amt]) => {
              let scaledYearBudget = 0;
              for (const [mKey, _] of monthsMap.entries()) {
                if (mKey.startsWith(yKey)) {
                  let scaledMonthBudget = monthlyBudget;
                  const [y, m] = mKey.split('-').map(Number);
                  const startDay = new Date(start + 'T00:00:00');
                  const endDay = new Date(end + 'T00:00:00');
                  const totalDays = new Date(y, m, 0).getDate();
                  const mStart = new Date(y, m - 1, 1, 0, 0, 0);
                  const mEnd = new Date(y, m - 1, totalDays, 0, 0, 0);
                  const effStart = startDay > mStart ? startDay : mStart;
                  const effEnd = endDay < mEnd ? endDay : mEnd;
                  if (effStart <= effEnd) {
                    const diffDays = Math.round((effEnd.getTime() - effStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    if (diffDays < totalDays) {
                      scaledMonthBudget = monthlyBudget * (diffDays / totalDays);
                    }
                  } else {
                    scaledMonthBudget = 0;
                  }
                  scaledYearBudget += scaledMonthBudget;
                }
              }
              const pct = scaledYearBudget > 0 ? Math.round((amt / scaledYearBudget) * 100) : 0;
              return `- ${yKey}: Spent $${amt.toFixed(2)} of Budget $${scaledYearBudget.toFixed(2)} (${pct}% consumed)`;
            }).join('\n')}`;
          }

          const systemResultsMsg: ChatMessage = {
            role: 'system',
            content: `Database Query Results for categories [${queryCats.join(', ')}] between ${start} and ${end}:
- Total Spent: $${metrics.totalSpend.toFixed(2)}
- Number of Transactions: ${metrics.spendCount}
- Average Transaction: $${metrics.spendAverage.toFixed(2)}
- Total Monthly Budget Limit: $${metrics.totalBudget.toFixed(2)}${breakdownText}
Please explain these numbers to the user in a natural, conversational response. Make sure to report the monthly and yearly breakdown of budget usage explicitly in your response.`
          };

          const finalResponseText = await localAI.chatCopilot(
            [...conversationHistory, { role: 'assistant', content: currentResponse }, systemResultsMsg],
            stateContext
          );

          addMessage({
            role: 'assistant',
            content: finalResponseText,
            actionResult: {
              action: 'query_data',
              categories: queryCats,
              customStart: start,
              customEnd: end,
              metrics
            }
          });
          break;

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

          const systemResultsMsg: ChatMessage = {
            role: 'system',
            content: `Subscription Alerts Scan Results:
- Price Spikes Detected: ${alerts.priceSpikes.length}
- Duplicate Charges: ${alerts.duplicateCharges.length}
- Overlapping Subscriptions: ${alerts.overlappingSubscriptions.length}
Please explain these findings to the user and suggest helpful next actions.`
          };

          const finalResponseText = await localAI.chatCopilot(
            [...conversationHistory, { role: 'assistant', content: currentResponse }, systemResultsMsg],
            stateContext
          );

          addMessage({
            role: 'assistant',
            content: finalResponseText,
            actionResult: {
              action: 'subscription_alerts',
              categories: ['Subscriptions'],
              customStart: '',
              customEnd: '',
              alerts
            }
          });
          break;

        } else if (action === 'spending_anomalies') {
          const currentFilters = useFilters.getState();
          let start = actionObj.customStart;
          let end = actionObj.customEnd;
          if (!start && !end) {
            const effectivePreset = actionObj.preset || currentFilters.preset;
            const range = resolveDateRange({
              ...currentFilters,
              preset: effectivePreset
            });
            start = range.start.toISOString().slice(0, 10);
            end = range.end.toISOString().slice(0, 10);
          } else {
            start = start || '2000-01-01';
            end = end || new Date().toISOString().slice(0, 10);
          }
          const queryCats = actionObj.categories || [];

          const allCats = await db.categories.toArray();
          const resolvedCats = queryCats.includes('all') || queryCats.length === 0
            ? allCats.map(c => c.name)
            : matchCategories(queryCats, allCats);

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

          const systemResultsMsg: ChatMessage = {
            role: 'system',
            content: `Spending Anomalies Scan Results:
- Category Spikes: ${anomalies.categorySpikes.length}
- Outliers: ${anomalies.outliers.length}
Please summarize these anomalies for the user.`
          };

          const finalResponseText = await localAI.chatCopilot(
            [...conversationHistory, { role: 'assistant', content: currentResponse }, systemResultsMsg],
            stateContext
          );

          addMessage({
            role: 'assistant',
            content: finalResponseText,
            actionResult: {
              action: 'spending_anomalies',
              categories: queryCats,
              customStart: start,
              customEnd: end,
              anomalies
            }
          });
          break;

        } else if (action === 'audit_accessibility') {
          const accessibilityReport = generateAccessibilityReport(location.pathname);

          const systemResultsMsg: ChatMessage = {
            role: 'system',
            content: `Accessibility Audit Results for ${location.pathname}:
- Score: ${accessibilityReport.score}
- Errors: ${accessibilityReport.issues.filter(i => i.severity === 'error').length}
- Warnings: ${accessibilityReport.issues.filter(i => i.severity === 'warning').length}
Please summarize this accessibility report for the developer, explaining what issues they should fix.`
          };

          const finalResponseText = await localAI.chatCopilot(
            [...conversationHistory, { role: 'assistant', content: currentResponse }, systemResultsMsg],
            stateContext
          );

          addMessage({
            role: 'assistant',
            content: finalResponseText,
            actionResult: {
              action: 'audit_accessibility',
              categories: [],
              customStart: '',
              customEnd: '',
              accessibilityReport
            }
          });
          break;

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

          addMessage({
            role: 'assistant',
            content: currentResponse,
            actionResult: {
              action: 'create_artifact',
              id: artId,
              type: newArtifact.type,
              title: newArtifact.title,
            }
          });
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

            addMessage({
              role: 'assistant',
              content: currentResponse,
              actionResult: {
                action: 'update_artifact',
                id: artId,
                type: updatedArtifact.type,
                title: updatedArtifact.title,
              }
            });
          } else {
            addMessage({ role: 'assistant', content: currentResponse });
          }
          break;

        } else if (
          action === 'navigate' ||
          action === 'search' ||
          action === 'filter' ||
          action === 'dom_update'
        ) {
          executeCopilotCommand(actionObj, getExecutorContext());

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

          addMessage({
            role: 'assistant',
            content: currentResponse,
            actionResult: {
              action,
              preset: actionObj.preset,
              customStart: actionObj.customStart,
              customEnd: actionObj.customEnd,
              categories: actionObj.categories,
              accounts: actionObj.accounts,
            }
          });
          break;
        } else {
          addMessage({ role: 'assistant', content: currentResponse });
          break;
        }
      }
    } catch (err: any) {
      addMessage({
        role: 'assistant',
        content: `Error: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    await sendPromptText(text);
  };


  return (
    <Box
      className="copilot-chat-container"
      sx={{
        width: isEmbedded ? '100%' : { xs: '100vw', sm: 400 },
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderLeft: isEmbedded ? '1px solid' : 'none',
        borderColor: 'divider',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <AutoAwesomeIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Strictly Copilot ({formatModelName(modelName)})
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          {aiLoaded && (
            <IconButton onClick={clearMessages} title="Clear conversation history">
              <DeleteIcon />
            </IconButton>
          )}
          {showCloseButton && onClose && (
            <IconButton onClick={onClose} title="Close copilot panel">
              <CloseIcon />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* Thread Session Selection & Management */}
      {aiLoaded && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50', flexShrink: 0 }}
        >
          <TextField
            select
            size="small"
            value={activeThreadId || ''}
            onChange={(e) => setActiveThreadId(e.target.value)}
            slotProps={{
              select: {
                native: true,
              }
            }}
            sx={{ flex: 1, mr: 1, '& .MuiOutlinedInput-root': { height: 32 } }}
          >
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </TextField>
          <Stack direction="row" spacing={0.5}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => createThread()}
              sx={{ minWidth: 32, height: 32, p: 0 }}
              title="Start a new chat thread"
            >
              +
            </Button>
            {activeThreadId && (
              <IconButton
                size="small"
                onClick={() => {
                  if (activeThreadId) {
                    deleteThread(activeThreadId);
                  }
                }}
                disabled={threads.length <= 1}
                title="Delete current thread"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
        </Stack>
      )}

      {/* Main Body */}
      {!aiLoaded ? (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            textAlign: 'center',
            gap: 3,
            overflowY: 'auto',
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 48, color: 'primary.main' }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Strictly Copilot Setup ({formatModelName(modelName)})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Unlock private, offline AI commands to filter, search, and navigate your spending. Runs 100% locally via the lightweight Ollama service.
            </Typography>
            {aiProgress && (
              <Typography variant="caption" color={aiStatus === 'error' ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 1, fontWeight: 500 }}>
                {aiProgress}
              </Typography>
            )}
          </Box>

          {aiStatus === 'checking' && (
            <CircularProgress size={32} />
          )}

          {aiStatus === 'pulling' && (
            <Box sx={{ width: '100%', mt: 1 }}>
              <LinearProgress variant="determinate" value={aiProgressPercent} sx={{ mb: 1.5, borderRadius: 1, height: 6 }} />
            </Box>
          )}

          {(aiStatus === 'uninstalled' || aiStatus === 'stopped' || aiStatus === 'running' || aiStatus === 'error') && (
            <Box>
              <Button variant="contained" onClick={initializeAI} startIcon={<AutoAwesomeIcon />}>
                {aiStatus === 'uninstalled' ? 'Install Local AI' :
                 aiStatus === 'stopped' ? 'Start Ollama' :
                 aiStatus === 'running' ? `Download ${formatModelName(modelName)}` :
                 'Retry Setup'}
              </Button>
            </Box>
          )}
        </Box>
      ) : (
        <>
          {/* Chat Stream */}
          <Box
            ref={scrollRef}
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {messages.length === 0 && (
              <Box sx={{ textAlign: 'center', mt: 4, color: 'text.secondary' }}>
                <Typography variant="body2">
                  Ask me to filter your spending, navigate to a different view, or search for a specific transaction!
                </Typography>
              </Box>
            )}
            {messages.map((m, i) => {
              const isUser = m.role === 'user';
              const showResult = m.actionResult && [
                'query_data',
                'subscription_alerts',
                'spending_anomalies',
                'audit_accessibility'
              ].includes(m.actionResult.action);

              const isArtifact = m.actionResult && [
                'create_artifact',
                'update_artifact'
              ].includes(m.actionResult.action);

              let parsedJson: any = null;
              if (m.role === 'assistant') {
                parsedJson = parseAIResponse(m.content);
              }

              const hasChoices = parsedJson?.gen_ux?.type === 'choices' && Array.isArray(parsedJson.gen_ux.options) && parsedJson.gen_ux.options.length > 0;
              const hasSuggestedActions = Array.isArray(parsedJson?.suggested_actions) && parsedJson.suggested_actions.length > 0;

              return (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    gap: 1,
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      maxWidth: '85%',
                      bgcolor: isUser ? 'primary.main' : 'grey.100',
                      color: isUser ? 'primary.contrastText' : 'text.primary',
                      borderRadius: 2,
                      width: !isUser && renderMessageContent(m).includes('|') ? '85%' : 'auto',
                    }}
                  >
                    {isUser ? (
                      <Typography className="copilot-msg-text" variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {m.content}
                      </Typography>
                    ) : (
                      <SimpleMarkdown content={renderMessageContent(m)} />
                    )}
                  </Paper>

                  {hasChoices && (
                    <Box sx={{ width: '85%', mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {parsedJson.gen_ux.options.map((opt: any, idx: number) => {
                        const optText = typeof opt === 'string'
                          ? opt
                          : (opt && typeof opt === 'object' && ('label' in opt || 'text' in opt || 'content' in opt))
                            ? (opt.label || opt.text || opt.content)
                            : JSON.stringify(opt);
                        return (
                          <Button
                            key={idx}
                            variant="outlined"
                            size="small"
                            fullWidth
                            onClick={() => sendPromptText(optText)}
                            disabled={loading}
                            sx={{
                              textTransform: 'none',
                              borderRadius: 2,
                              fontWeight: 600,
                              py: 1,
                              px: 2,
                              justifyContent: 'flex-start',
                              textAlign: 'left',
                              fontSize: '12px',
                              borderColor: 'divider',
                              color: 'text.primary',
                              '&:hover': {
                                bgcolor: 'action.hover',
                                borderColor: 'text.secondary',
                              }
                            }}
                          >
                            👉 {optText}
                          </Button>
                        );
                      })}
                    </Box>
                  )}

                  {parsedJson?.gen_ux?.type === 'confirmation' && (
                    <GenUXConfirmation
                      options={parsedJson.gen_ux.options || []}
                      onConfirm={(txt) => sendPromptText(txt)}
                      disabled={loading}
                    />
                  )}

                  {parsedJson?.gen_ux?.type === 'form' && Array.isArray(parsedJson.gen_ux.options) && parsedJson.gen_ux.options.length > 0 && (
                    <GenUXForm
                      options={parsedJson.gen_ux.options}
                      onSubmit={(txt) => sendPromptText(txt)}
                      disabled={loading}
                    />
                  )}

                  {hasSuggestedActions && (
                    <Box sx={{ width: '85%', mt: 0.5 }}>
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        {parsedJson.suggested_actions.map((act: any, idx: number) => {
                          const actText = typeof act === 'string'
                            ? act
                            : (act && typeof act === 'object' && ('label' in act || 'text' in act || 'content' in act))
                              ? (act.label || act.text || act.content)
                              : JSON.stringify(act);
                          return (
                            <Chip
                              key={idx}
                              label={actText}
                              size="small"
                              onClick={() => sendPromptText(actText)}
                              disabled={loading}
                              clickable
                              sx={{
                                fontSize: '11px',
                                fontWeight: 500,
                                height: 24,
                              }}
                            />
                          );
                        })}
                      </Stack>
                    </Box>
                  )}

                  {showResult && m.actionResult && (
                    <Box sx={{ width: '85%', mt: 0.5 }}>
                      <CopilotQueryResult
                        action={m.actionResult.action as any}
                        categories={m.actionResult.categories || []}
                        customStart={m.actionResult.customStart || ''}
                        customEnd={m.actionResult.customEnd || ''}
                        metrics={m.actionResult.metrics}
                        alerts={m.actionResult.alerts}
                        anomalies={m.actionResult.anomalies}
                        accessibilityReport={m.actionResult.accessibilityReport}
                        onApplyFilters={() => handleApplyFilters(m.actionResult)}
                      />
                    </Box>
                  )}

                  {isArtifact && m.actionResult && (
                    <Box sx={{ width: '85%', mt: 0.5 }}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          bgcolor: 'background.paper',
                          borderColor: 'divider',
                          borderRadius: 2,
                        }}
                      >
                        <Stack spacing={1}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            🎨 {m.actionResult.action === 'create_artifact' ? 'Artifact Created' : 'Artifact Updated'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                            <strong>Title:</strong> {m.actionResult.title}
                          </Typography>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={async () => {
                              if (m.actionResult?.id) {
                                const art = await db.artifacts.get(m.actionResult.id);
                                if (art) useChatStore.getState().setActiveArtifact(art);
                              }
                            }}
                            sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
                          >
                            Open Artifact
                          </Button>
                        </Stack>
                      </Paper>
                    </Box>
                  )}
                </Box>
              );
            })}
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'grey.100', borderRadius: 2 }}>
                  <CircularProgress size={20} />
                </Paper>
              </Box>
            )}
          </Box>

          {/* Text Input */}
          <Box
            sx={{
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
              bgcolor: 'background.default',
              flexShrink: 0,
            }}
          >
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                placeholder="E.g. Show me food spending..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                disabled={loading}
              />
              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={!input.trim() || loading}
              >
                <SendIcon />
              </IconButton>
            </Stack>
          </Box>
        </>
      )}
    </Box>
  );
}
