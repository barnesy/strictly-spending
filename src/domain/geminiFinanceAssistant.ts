import { api } from '../api';
import { queryClient } from '../queryClient';
import { useFilters } from '../stores/store';

const RECURRING_CATEGORIES = new Set([
  'Housing',
  'Utilities',
  'Subscriptions',
  'Insurance',
  'Debt & Loans',
  'Savings & Investments',
  'Taxes',
]);

export interface GeminiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolActions?: string[];
  createdAt: number;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast & Free Tier)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deep Reasoning)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
] as const;

const LS_API_KEY = 'strictly_gemini_api_key';
const LS_MODEL = 'strictly_gemini_model';
const SS_CHAT_HISTORY = 'strictly_gemini_chat_history_v1';

export function getGeminiConfig(): GeminiConfig {
  try {
    const apiKey = (localStorage.getItem(LS_API_KEY) || '').trim();
    const model = (localStorage.getItem(LS_MODEL) || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
    return { apiKey, model };
  } catch {
    return { apiKey: '', model: 'gemini-2.5-flash' };
  }
}

export async function hydrateGeminiConfigFromSettings(): Promise<GeminiConfig> {
  const local = getGeminiConfig();
  try {
    const settings = await api.getSettings();
    const dbKey = String(settings.find((s) => s.key === 'gemini_api_key')?.value || '').trim();
    const dbModel = String(settings.find((s) => s.key === 'gemini_model')?.value || '').trim();
    const resolvedKey = local.apiKey || dbKey;
    const resolvedModel = local.model || dbModel || 'gemini-2.5-flash';
    if (resolvedKey && !local.apiKey) {
      localStorage.setItem(LS_API_KEY, resolvedKey);
    }
    if (resolvedModel) {
      localStorage.setItem(LS_MODEL, resolvedModel);
    }
    return { apiKey: resolvedKey, model: resolvedModel };
  } catch {
    return local;
  }
}

export async function saveGeminiConfig(apiKey: string, model = 'gemini-2.5-flash'): Promise<void> {
  const cleanKey = apiKey.trim();
  const cleanModel = model.trim() || 'gemini-2.5-flash';
  try {
    localStorage.setItem(LS_API_KEY, cleanKey);
    localStorage.setItem(LS_MODEL, cleanModel);
  } catch {
    // ignore storage errors
  }
  try {
    await api.putSetting('gemini_api_key', cleanKey);
    await api.putSetting('gemini_model', cleanModel);
  } catch {
    // ignore db setting errors
  }
  window.dispatchEvent(new Event('gemini-config-updated'));
}

export function loadGeminiChatHistory(): GeminiChatMessage[] {
  try {
    const raw = sessionStorage.getItem(SS_CHAT_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGeminiChatHistory(messages: GeminiChatMessage[]): void {
  try {
    sessionStorage.setItem(SS_CHAT_HISTORY, JSON.stringify(messages.slice(-40)));
  } catch {
    // ignore storage errors
  }
}

function fmtUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface FinancialBriefingResult {
  markdown: string;
  promptForGeminiApp: string;
  summaryStats: {
    accountCount: number;
    transactionCount: number;
    loanCount: number;
    netWorth: number;
  };
}

export async function buildFinancialBriefingMarkdown(): Promise<FinancialBriefingResult> {
  const demoMode = useFilters.getState().demoMode;
  const [allAccounts, allLoans, budgets, categories, allTransactions, trailingAverages] = await Promise.all([
    api.getAccounts(),
    api.getLoans(),
    api.getBudgets(),
    api.getCategories(),
    api.getTransactions(),
    api.getCategoryTrailingAverages(demoMode),
  ]);

  const accounts = allAccounts.filter((a) => (demoMode ? a.source === 'demo' : a.source !== 'demo'));
  const accountMap = new Map(accounts.map((a) => [a.id!, a]));
  const activeAccountIds = new Set(accounts.map((a) => a.id!).filter(Boolean));
  const transactions = allTransactions.filter((t) =>
    activeAccountIds.size > 0 ? activeAccountIds.has(t.accountId) : demoMode ? t.source === 'demo' : t.source !== 'demo'
  );
  const loans = allLoans.filter((l) => l.enabled !== false);

  const cashTotal = accounts
    .filter((a) => a.type === 'checking' || a.type === 'savings')
    .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
  const investTotal = accounts
    .filter((a) => a.type === 'investment')
    .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
  const houseLoan = loans.find((l) => l.type === 'house');
  const propertyVal = houseLoan ? (houseLoan.propertyValue ?? 0) : 0;
  const debtAccounts = accounts.filter((a) => a.type === 'credit' || a.type === 'loan' || a.type === 'mortgage');
  const accountDebts = debtAccounts.reduce((sum, a) => sum + Math.abs(Math.min(0, a.currentBalance || 0)), 0);
  const hasMortgageAccount = debtAccounts.some((a) => a.type === 'mortgage');
  const hasLoanAccount = debtAccounts.some((a) => a.type === 'loan');
  const standaloneLoanDebts = loans.reduce((sum, l) => {
    if (l.type === 'house' && hasMortgageAccount) return sum;
    if ((l.type === 'car' || l.type === 'student') && hasLoanAccount) return sum;
    return sum + Math.max(0, l.principal || 0);
  }, 0);
  const totalDebt = accountDebts + standaloneLoanDebts;
  const netWorth = cashTotal + investTotal + propertyVal - totalDebt;

  const transferCats = new Set(categories.filter((c) => c.type === 'transfer').map((c) => c.name));
  const incomeCats = new Set(categories.filter((c) => c.type === 'income').map((c) => c.name));
  const spendCats = categories.filter((c) => c.type === 'spend').map((c) => c.name);

  // Monthly cashflow (last 4 months)
  const byMonth = new Map<string, { income: number; spend: number }>();
  for (const t of transactions) {
    if (transferCats.has(t.category)) continue;
    const m = t.date.slice(0, 7);
    const cur = byMonth.get(m) || { income: 0, spend: 0 };
    if (t.amount > 0 || incomeCats.has(t.category)) {
      if (t.amount > 0) cur.income += t.amount;
    } else if (t.amount < 0) {
      cur.spend += Math.abs(t.amount);
    }
    byMonth.set(m, cur);
  }
  const recentMonths = Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 4);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const latestMonth = recentMonths[0]?.[0] || currentMonth;
  const activeMonth = byMonth.has(currentMonth) ? currentMonth : latestMonth;

  // Category spend in active month
  const currentMonthCatSpend = new Map<string, number>();
  for (const t of transactions) {
    if (t.amount >= 0 || transferCats.has(t.category) || incomeCats.has(t.category)) continue;
    if (t.date.slice(0, 7) === activeMonth) {
      currentMonthCatSpend.set(t.category, (currentMonthCatSpend.get(t.category) || 0) + Math.abs(t.amount));
    }
  }

  const budgetMap = new Map(budgets.map((b) => [b.category, b]));
  const trailingMap = new Map(
    trailingAverages.map((row) => [row.category, Math.round(row.average ?? 0)])
  );

  // Top merchants in last 90 days
  const cutoff90 = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
  const merchantTotals = new Map<string, { name: string; category: string; total: number; count: number }>();
  for (const t of transactions) {
    if (t.amount >= 0 || transferCats.has(t.category) || incomeCats.has(t.category)) continue;
    if (t.date < cutoff90) continue;
    const key = (t.merchantKey || t.description).toLowerCase();
    const cur = merchantTotals.get(key) || {
      name: t.merchantKey || t.description,
      category: t.category,
      total: 0,
      count: 0,
    };
    cur.total += Math.abs(t.amount);
    cur.count += 1;
    merchantTotals.set(key, cur);
  }
  const topMerchants = Array.from(merchantTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  const lines: string[] = [];
  lines.push(`# Strictly Spending Financial Snapshot (${new Date().toISOString().slice(0, 10)})`);
  lines.push('');
  lines.push('## 1. Net Worth & Balance Sheet');
  lines.push(`- **Estimated Net Worth**: ${fmtUsd(netWorth)}`);
  lines.push(`- **Liquid Cash (Checking/Savings)**: ${fmtUsd(cashTotal)}`);
  lines.push(`- **Investments**: ${fmtUsd(investTotal)}`);
  if (propertyVal > 0) {
    lines.push(`- **Real Estate / Property Value**: ${fmtUsd(propertyVal)}`);
  }
  lines.push(`- **Total Debt (Credit Cards + Loans + Mortgage)**: ${fmtUsd(totalDebt)}`);
  lines.push('');

  lines.push('### Connected Accounts');
  if (accounts.length === 0) {
    lines.push('- No accounts connected.');
  } else {
    for (const a of accounts) {
      lines.push(
        `- **${a.name}** (${a.type}${a.institution ? ` • ${a.institution}` : ''}): ${fmtUsd(a.currentBalance || 0)}`
      );
    }
  }
  lines.push('');

  lines.push('## 2. Loans & Mortgages');
  if (loans.length === 0) {
    lines.push('- No active loans tracked.');
  } else {
    for (const l of loans) {
      const propInfo = l.propertyValue ? `, Property Value: ${fmtUsd(l.propertyValue)}` : '';
      lines.push(
        `- **${l.name}** (${l.type}): Principal ${fmtUsd(l.principal)}, Rate ${l.rate}% APR, Monthly Payment ${fmtUsd(l.monthlyPayment)}${propInfo}`
      );
    }
  }
  lines.push('');

  lines.push('## 3. Monthly Cashflow (Recent Months)');
  for (const [m, stats] of recentMonths) {
    const net = stats.income - stats.spend;
    lines.push(`- **${m}**: Income ${fmtUsd(stats.income)} | Spend ${fmtUsd(stats.spend)} | Net ${fmtUsd(net)}`);
  }
  lines.push('');

  lines.push(`## 4. Category Budgets & Actual Spend (Active Month: ${activeMonth})`);
  const recurringLines: string[] = [];
  const variableLines: string[] = [];
  for (const cat of spendCats) {
    const actual = currentMonthCatSpend.get(cat) || 0;
    const trailing = trailingMap.get(cat) || 0;
    const b = budgetMap.get(cat);
    const budgetAmt = b && (b.userSet || b.monthlyAmount > 0) ? b.monthlyAmount : trailing;
    if (actual === 0 && trailing === 0 && budgetAmt === 0) continue;
    const rowStr = `- **${cat}**: ${activeMonth} Actual ${fmtUsd(actual)} | Monthly Budget ${fmtUsd(budgetAmt)} | 3-Mo Avg ${fmtUsd(trailing)}`;
    if (RECURRING_CATEGORIES.has(cat)) {
      recurringLines.push(rowStr);
    } else {
      variableLines.push(rowStr);
    }
  }
  lines.push('### Variable Spending Categories');
  lines.push(...(variableLines.length > 0 ? variableLines : ['- No variable category spend recorded yet.']));
  lines.push('');
  lines.push('### Recurring Bill Categories');
  lines.push(...(recurringLines.length > 0 ? recurringLines : ['- No recurring bill spend recorded yet.']));
  lines.push('');

  lines.push('## 5. Top Merchants (Last 90 Days)');
  for (const m of topMerchants) {
    lines.push(`- **${m.name}** (${m.category}): ${fmtUsd(m.total)} across ${m.count} txns`);
  }
  lines.push('');

  lines.push('## 6. Recent Transactions (Latest 50)');
  const recentTxns = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50);
  for (const t of recentTxns) {
    const accName = accountMap.get(t.accountId)?.name || `Account #${t.accountId}`;
    lines.push(`- ${t.date} | ${fmtUsd(t.amount)} | **${t.description}** | Category: ${t.category} | ${accName}`);
  }

  const markdown = lines.join('\n');
  const promptForGeminiApp = [
    'You are my personal financial advisor analyzing my live data from Strictly Spending.',
    'Review my financial snapshot below (net worth, accounts, loans, monthly cashflow, variable & recurring budgets, top merchants, and recent transactions).',
    'Give me a concise executive summary of where my money is going, highlight any categories or merchants where I can save money, and then let me ask follow-up questions.',
    '',
    markdown,
  ].join('\n');

  return {
    markdown,
    promptForGeminiApp,
    summaryStats: {
      accountCount: accounts.length,
      transactionCount: transactions.length,
      loanCount: loans.length,
      netWorth,
    },
  };
}

export async function copyFinancialBriefingForGemini(): Promise<FinancialBriefingResult> {
  const briefing = await buildFinancialBriefingMarkdown();
  await navigator.clipboard.writeText(briefing.promptForGeminiApp);
  return briefing;
}

export async function shareFinancialBriefingToGemini(): Promise<{ shared: boolean; briefing: FinancialBriefingResult }> {
  const briefing = await buildFinancialBriefingMarkdown();
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'Strictly Spending — Financial Briefing for Gemini',
        text: briefing.promptForGeminiApp,
      });
      return { shared: true, briefing };
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        return { shared: false, briefing };
      }
    }
  }
  await navigator.clipboard.writeText(briefing.promptForGeminiApp);
  return { shared: false, briefing };
}

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'search_transactions',
        description:
          'Search the user’s full transaction history by merchant/description keyword, category, or date range. Use this whenever the user asks about a specific merchant, category, or time period not fully covered in the recent 50 transactions.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Optional substring to match against transaction description or merchant (case-insensitive).',
            },
            category: {
              type: 'STRING',
              description: 'Optional exact category name to filter by (e.g., "Groceries", "Dining & Drinks", "Shopping").',
            },
            startDate: {
              type: 'STRING',
              description: 'Optional start date in YYYY-MM-DD format.',
            },
            endDate: {
              type: 'STRING',
              description: 'Optional end date in YYYY-MM-DD format.',
            },
          },
        },
      },
      {
        name: 'set_category_budget',
        description:
          'Set or update the monthly budget amount (in USD) for a spending category when the user asks to change or set a budget.',
        parameters: {
          type: 'OBJECT',
          properties: {
            category: {
              type: 'STRING',
              description: 'The exact category name (e.g., "Dining & Drinks", "Groceries", "Shopping").',
            },
            monthlyAmount: {
              type: 'NUMBER',
              description: 'The target monthly budget in USD (e.g., 450).',
            },
          },
          required: ['category', 'monthlyAmount'],
        },
      },
      {
        name: 'categorize_merchant',
        description:
          'Create a categorization rule for a merchant keyword and recategorize all matching transactions when the user asks to move a merchant to a category.',
        parameters: {
          type: 'OBJECT',
          properties: {
            pattern: {
              type: 'STRING',
              description: 'Merchant keyword or substring (e.g., "COSTCO", "STARBUCKS").',
            },
            category: {
              type: 'STRING',
              description: 'Target category name (e.g., "Groceries", "Dining & Drinks").',
            },
          },
          required: ['pattern', 'category'],
        },
      },
      {
        name: 'navigate_app',
        description:
          'Navigate the Strictly Spending app UI to a specific page or filter view when the user asks to open a page or view.',
        parameters: {
          type: 'OBJECT',
          properties: {
            page: {
              type: 'STRING',
              description: 'Target route: "/", "/budget", "/loans", "/forecast", "/sort", "/merchants", or "/rules".',
            },
            searchQuery: {
              type: 'STRING',
              description: 'Optional search filter to apply.',
            },
          },
          required: ['page'],
        },
      },
    ],
  },
];

async function executeGeminiToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ result: Record<string, unknown>; actionLabel: string }> {
  const demoMode = useFilters.getState().demoMode;

  if (name === 'search_transactions') {
    const q = String(args.query || '').trim().toLowerCase();
    const cat = String(args.category || '').trim().toLowerCase();
    const startDate = String(args.startDate || '').trim();
    const endDate = String(args.endDate || '').trim();
    const allTx = await api.getTransactions();
    const matches = allTx.filter((t) => {
      if (demoMode ? t.source !== 'demo' : t.source === 'demo') return false;
      if (q && !`${t.description} ${t.merchantKey || ''}`.toLowerCase().includes(q)) return false;
      if (cat && t.category.toLowerCase() !== cat) return false;
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      return true;
    });
    const totalAmount = matches.reduce((sum, t) => sum + t.amount, 0);
    const totalOutflow = matches.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const sample = matches.slice(0, 40).map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      category: t.category,
    }));
    const filterDesc = [q && `"${q}"`, cat && `category:${cat}`, startDate && `from ${startDate}`, endDate && `to ${endDate}`]
      .filter(Boolean)
      .join(', ');
    return {
      result: {
        matchCount: matches.length,
        totalNetAmount: Math.round(totalAmount * 100) / 100,
        totalSpendOutflow: Math.round(totalOutflow * 100) / 100,
        transactions: sample,
      },
      actionLabel: `Searched transactions (${filterDesc || 'all'}) → ${matches.length} matches (${fmtUsd(totalOutflow)} spend)`,
    };
  }

  if (name === 'set_category_budget') {
    const category = String(args.category || '').trim();
    const monthlyAmount = Math.max(0, Math.round(Number(args.monthlyAmount || 0)));
    await api.putBudget({ category, monthlyAmount, userSet: true });
    await queryClient.invalidateQueries();
    window.dispatchEvent(new Event('db-update'));
    return {
      result: { success: true, category, monthlyAmount },
      actionLabel: `Updated ${category} budget to ${fmtUsd(monthlyAmount)}/mo`,
    };
  }

  if (name === 'categorize_merchant') {
    const pattern = String(args.pattern || '').trim();
    const category = String(args.category || '').trim();
    if (!pattern || !category) {
      return { result: { error: 'Missing pattern or category' }, actionLabel: 'Skipped invalid rule' };
    }
    await api.addRule({ pattern, category, priority: 100, createdAt: new Date().toISOString() });
    const allTx = await api.getTransactions();
    const lowerPattern = pattern.toLowerCase();
    let updatedCount = 0;
    for (const t of allTx) {
      if (demoMode ? t.source !== 'demo' : t.source === 'demo') continue;
      if (
        `${t.description} ${t.merchantKey || ''}`.toLowerCase().includes(lowerPattern) &&
        t.category !== category &&
        t.id !== undefined
      ) {
        await api.updateTransaction(t.id, { category, userOverridden: true });
        updatedCount += 1;
      }
    }
    await queryClient.invalidateQueries();
    window.dispatchEvent(new Event('db-update'));
    return {
      result: { success: true, pattern, category, updatedTransactions: updatedCount },
      actionLabel: `Created rule "${pattern}" → ${category} (${updatedCount} txns updated)`,
    };
  }

  if (name === 'navigate_app') {
    const page = String(args.page || '/').trim();
    const searchQuery = args.searchQuery ? String(args.searchQuery) : undefined;
    if (searchQuery !== undefined) {
      useFilters.getState().setSearchQuery(searchQuery);
    }
    window.dispatchEvent(
      new CustomEvent('strictly-gemini-navigate', {
        detail: { page, searchQuery },
      })
    );
    return {
      result: { success: true, openedPage: page },
      actionLabel: `Opened ${page}${searchQuery ? ` (search: "${searchQuery}")` : ''}`,
    };
  }

  return {
    result: { error: `Unknown tool: ${name}` },
    actionLabel: `Called ${name}`,
  };
}

export async function sendGeminiChatMessage(
  history: GeminiChatMessage[],
  userText: string,
  configOverride?: Partial<GeminiConfig>
): Promise<{ replyText: string; toolActions: string[] }> {
  const cfg = { ...getGeminiConfig(), ...configOverride };
  if (!cfg.apiKey) {
    throw new Error('Missing Gemini API key. Paste your free Google AI Studio key above to start chatting.');
  }

  const briefing = await buildFinancialBriefingMarkdown();
  const systemPrompt = [
    'You are the built-in Gemini Financial Assistant inside Strictly Spending.',
    'You have direct access to the user’s live financial snapshot below and tools to search all historical transactions, update category budgets, create merchant categorization rules, or navigate the app.',
    'Guidelines:',
    '- Be concise, specific, and cite exact dollar amounts, merchants, and categories from the user’s real data.',
    '- Format responses in clean Markdown with bullet points and bold key numbers.',
    '- When the user asks about transactions older than the recent 50 or for a specific merchant/category total, call `search_transactions`.',
    '- When the user asks to change a budget or recategorize a merchant, call `set_category_budget` or `categorize_merchant`.',
    '',
    briefing.markdown,
  ].join('\n');

  // Convert prior history to Gemini contents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = history.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  contents.push({
    role: 'user',
    parts: [{ text: userText }],
  });

  const toolActions: string[] = [];
  const modelId = cfg.model || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelId
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  for (let step = 0; step < 3; step++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        tools: GEMINI_TOOLS,
        generationConfig: {
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      let errDetail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errDetail = errJson?.error?.message || errDetail;
      } catch {
        // ignore parse errors
      }
      throw new Error(`Gemini API error: ${errDetail}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const functionCalls = parts.filter((p: any) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => p.text || '')
        .join('\n')
        .trim();
      return {
        replyText: text || 'Done.',
        toolActions,
      };
    }

    // Add model's tool call turn
    contents.push({
      role: 'model',
      parts,
    });

    // Execute all requested function calls and return functionResponse parts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseParts: any[] = [];
    for (const fcPart of functionCalls) {
      const fc = fcPart.functionCall;
      const { result, actionLabel } = await executeGeminiToolCall(fc.name, fc.args || {});
      toolActions.push(actionLabel);
      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: result,
        },
      });
    }

    contents.push({
      role: 'user',
      parts: responseParts,
    });
  }

  return {
    replyText: 'Completed requested actions.',
    toolActions,
  };
}
