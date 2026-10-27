import { api } from '../api';
import { usd, usdCents } from '../lib';
import { resolveDateRange, formatLocalDate, useFilters } from '../stores/store';
import { useForecastStore, computeTotalNetIncome } from '../stores/forecastStore';
import type { Account, Budget, Category, Loan, Transaction } from '../types';

export type BuiltInAiAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable';

export interface BuiltInAiFinancialData {
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  loans: Loan[];
}

interface PromptSession {
  prompt: (input: string) => Promise<string>;
  promptStreaming?: (input: string) => AsyncIterable<string> | ReadableStream<string>;
  destroy?: () => void;
}

// Type helpers for Chrome 138+ self.LanguageModel and Chrome 127-137 window.ai.languageModel
function getLanguageModelGlobal(): any | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as any;
  if (g.LanguageModel && typeof g.LanguageModel.create === 'function') {
    return { kind: 'standard', api: g.LanguageModel };
  }
  if (g.ai?.languageModel && typeof g.ai.languageModel.create === 'function') {
    return { kind: 'legacy-ai', api: g.ai.languageModel };
  }
  if (g.model && typeof g.model.createTextSession === 'function') {
    return { kind: 'legacy-model', api: g.model };
  }
  return null;
}

export async function checkBuiltInAiAvailability(): Promise<BuiltInAiAvailability> {
  const entry = getLanguageModelGlobal();
  if (!entry) return 'unavailable';

  try {
    if (entry.kind === 'standard') {
      let status: string;
      try {
        status = await entry.api.availability({
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        });
      } catch {
        status = await entry.api.availability();
      }
      if (status === 'available' || status === 'readily') return 'available';
      if (status === 'downloading') return 'downloading';
      if (status === 'downloadable' || status === 'after-download') return 'downloadable';
      return 'unavailable';
    }

    if (entry.kind === 'legacy-ai') {
      const caps = await entry.api.capabilities();
      const avail = caps?.available;
      if (avail === 'readily' || avail === 'available') return 'available';
      if (avail === 'after-download' || avail === 'downloadable') return 'downloadable';
      if (avail === 'downloading') return 'downloading';
      return 'unavailable';
    }

    if (entry.kind === 'legacy-model') {
      const canCreate = await entry.api.canCreateTextSession();
      if (canCreate === 'readily') return 'available';
      if (canCreate === 'after-download') return 'downloadable';
      return 'unavailable';
    }
  } catch {
    return 'unavailable';
  }
  return 'unavailable';
}

async function createBuiltInAiSession(
  systemPrompt: string,
  onDownloadProgress?: (percent: number) => void
): Promise<PromptSession> {
  const entry = getLanguageModelGlobal();
  if (!entry) {
    throw new Error('Built-in browser AI is not available in this browser.');
  }

  const monitor = (m: any) => {
    if (!m || typeof m.addEventListener !== 'function') return;
    m.addEventListener('downloadprogress', (e: any) => {
      if (!onDownloadProgress) return;
      const loaded = typeof e?.loaded === 'number' ? e.loaded : 0;
      const total = typeof e?.total === 'number' && e.total > 0 ? e.total : 1;
      const pct = loaded <= 1 && total === 1 ? Math.round(loaded * 100) : Math.round((loaded / total) * 100);
      onDownloadProgress(Math.max(0, Math.min(100, pct)));
    });
  };

  if (entry.kind === 'standard') {
    try {
      return await entry.api.create({
        initialPrompts: [{ role: 'system', content: systemPrompt }],
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        monitor,
      });
    } catch {
      return await entry.api.create({
        systemPrompt,
        monitor,
      });
    }
  }

  if (entry.kind === 'legacy-ai') {
    return await entry.api.create({
      systemPrompt,
      monitor,
    });
  }

  return await entry.api.createTextSession();
}

async function consumeStreamOrPrompt(
  session: PromptSession,
  promptText: string,
  onChunk: (fullText: string) => void
): Promise<string> {
  if (typeof session.promptStreaming === 'function') {
    try {
      const stream = session.promptStreaming(promptText) as any;
      let accumulated = '';

      if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        for await (const chunk of stream as AsyncIterable<string>) {
          const piece = String(chunk ?? '');
          if (accumulated.length > 0 && piece.startsWith(accumulated)) {
            // Cumulative stream (Chrome 127-134)
            accumulated = piece;
          } else {
            // Delta stream (Chrome 135+)
            accumulated += piece;
          }
          onChunk(accumulated);
        }
        if (accumulated.trim().length > 0) return accumulated;
      } else if (stream && typeof stream.getReader === 'function') {
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const piece = String(value ?? '');
          if (accumulated.length > 0 && piece.startsWith(accumulated)) {
            accumulated = piece;
          } else {
            accumulated += piece;
          }
          onChunk(accumulated);
        }
        if (accumulated.trim().length > 0) return accumulated;
      }
    } catch {
      // Fallback to non-streaming prompt below
    }
  }

  const full = await session.prompt(promptText);
  onChunk(full);
  return full;
}

export interface CompactFinancialContext {
  periodLabel: string;
  startDate: string;
  endDate: string;
  totalSpendDollars: number;
  totalIncomeDollars: number;
  netCashflowDollars: number;
  txCount: number;
  liquidCashDollars: number;
  investmentsDollars: number;
  totalDebtDollars: number;
  netWorthDollars: number;
  accountsSummary: { name: string; type: string; balance: number }[];
  loansSummary: { name: string; type: string; principal: number; rate: number; monthlyPayment: number }[];
  topCategories: { category: string; spendDollars: number; count: number; budgetDollars?: number }[];
  topMerchants: { merchant: string; spendDollars: number; count: number; category: string }[];
  recurringMerchants: { merchant: string; monthlyDollars: number; category: string }[];
  matchedTransactionsNote: string;
  systemPrompt: string;
  contextBlock: string;
}

export async function buildQueryAwareFinancialContext(
  question: string,
  data: BuiltInAiFinancialData
): Promise<CompactFinancialContext> {
  const filterState = useFilters.getState();
  const demoMode = filterState.demoMode;
  const range = resolveDateRange(filterState);
  const startDate = formatLocalDate(range.start);
  const endDate = formatLocalDate(range.end);

  const activeAccounts = data.accounts.filter((a) =>
    demoMode ? a.source === 'demo' : a.source !== 'demo'
  );
  const accountNameById = new Map<number, string>();
  for (const acc of activeAccounts) {
    if (acc.id !== undefined) accountNameById.set(acc.id, acc.name);
  }

  const enabledAccountIds =
    filterState.enabledAccountIds && filterState.enabledAccountIds.length > 0
      ? filterState.enabledAccountIds
      : undefined;

  const allTxns: Transaction[] = await api.getTransactions(startDate, endDate);
  const scopedTxns = allTxns.filter((t) => {
    if (demoMode ? t.source !== 'demo' : t.source === 'demo') return false;
    if (enabledAccountIds && !enabledAccountIds.includes(t.accountId)) return false;
    return true;
  });

  const nonTransferCategories = new Set(
    data.categories.filter((c) => c.type !== 'transfer').map((c) => c.name)
  );
  const isTransferCat = (cat: string) =>
    !cat ? false : !nonTransferCategories.has(cat) && data.categories.some((c) => c.name === cat && c.type === 'transfer');

  let totalSpendCents = 0;
  let totalIncomeCents = 0;
  const catMap = new Map<string, { spendCents: number; count: number }>();
  const merchMap = new Map<string, { spendCents: number; count: number; category: string }>();

  for (const t of scopedTxns) {
    const cat = t.category || 'Uncategorized';
    if (isTransferCat(cat) || cat.toLowerCase() === 'transfer' || cat.toLowerCase() === 'credit card payment') {
      continue;
    }
    if (t.amount < 0) {
      const abs = Math.abs(t.amount);
      totalSpendCents += abs;
      const prevCat = catMap.get(cat) || { spendCents: 0, count: 0 };
      prevCat.spendCents += abs;
      prevCat.count += 1;
      catMap.set(cat, prevCat);

      const mKey = (t.merchantKey || t.description || 'Unknown').trim();
      const prevM = merchMap.get(mKey) || { spendCents: 0, count: 0, category: cat };
      prevM.spendCents += abs;
      prevM.count += 1;
      merchMap.set(mKey, prevM);
    } else if (t.amount > 0) {
      totalIncomeCents += t.amount;
    }
  }

  const budgetByCat = new Map<string, number>();
  for (const b of data.budgets) {
    if (b.monthlyAmount > 0) {
      budgetByCat.set(b.category, b.monthlyAmount);
    }
  }

  const topCategories = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      spendDollars: v.spendCents / 100,
      count: v.count,
      budgetDollars: budgetByCat.get(category),
    }))
    .sort((a, b) => b.spendDollars - a.spendDollars);

  const topMerchants = Array.from(merchMap.entries())
    .map(([merchant, v]) => ({
      merchant,
      spendDollars: v.spendCents / 100,
      count: v.count,
      category: v.category,
    }))
    .sort((a, b) => b.spendDollars - a.spendDollars);

  // Account & Net Worth summary
  const liquidCashDollars = activeAccounts
    .filter((a) => a.type === 'checking' || a.type === 'savings')
    .reduce((s, a) => s + (a.currentBalance || 0), 0);
  const investmentsDollars = activeAccounts
    .filter((a) => a.type === 'investment')
    .reduce((s, a) => s + (a.currentBalance || 0), 0);
  const activeLoans = data.loans.filter((l) => l.enabled !== false);
  const debtAccounts = activeAccounts.filter(
    (a) => a.type === 'credit' || a.type === 'loan' || a.type === 'mortgage'
  );
  const accountDebts = debtAccounts.reduce(
    (s, a) => s + Math.abs(Math.min(0, a.currentBalance || 0)),
    0
  );
  const hasMortgageAccount = debtAccounts.some((a) => a.type === 'mortgage');
  const hasLoanAccount = debtAccounts.some((a) => a.type === 'loan');
  const standaloneLoanDebts = activeLoans.reduce((s, l) => {
    if (l.type === 'house' && hasMortgageAccount) return s;
    if ((l.type === 'car' || l.type === 'student') && hasLoanAccount) return s;
    return s + Math.max(0, l.principal || 0);
  }, 0);
  const totalDebtDollars = accountDebts + standaloneLoanDebts;
  const houseLoan = activeLoans.find((l) => l.type === 'house');
  const propertyVal = houseLoan?.propertyValue ?? 0;
  const netWorthDollars = liquidCashDollars + investmentsDollars + propertyVal - totalDebtDollars;

  // Query-specific transaction matching
  const qLower = question.toLowerCase();
  const qTokens = qLower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  let matchedTransactionsNote = '';
  if (qTokens.length > 0) {
    const matchingTxns = scopedTxns.filter((t) => {
      const hay = `${t.merchantKey || ''} ${t.description || ''} ${t.category || ''} ${accountNameById.get(t.accountId) || ''}`.toLowerCase();
      return qTokens.some((tok) => hay.includes(tok));
    });
    if (matchingTxns.length > 0) {
      const matchSpendCents = matchingTxns
        .filter((t) => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      const sampleLines = matchingTxns
        .slice(0, 10)
        .map(
          (t) =>
            `  - ${t.date}: ${(t.merchantKey || t.description).slice(0, 32)} (${t.category || 'Uncategorized'}, ${accountNameById.get(t.accountId) || 'Account'}): ${usdCents.format(t.amount)}`
        )
        .join('\n');
      matchedTransactionsNote = `Query-Matched Transactions (${matchingTxns.length} matches, total spend ${usdCents.format(matchSpendCents)}):\n${sampleLines}`;
    }
  }

  const totalSpendDollars = totalSpendCents / 100;
  const totalIncomeDollars = totalIncomeCents / 100;
  const netCashflowDollars = totalIncomeDollars - totalSpendDollars;

  const forecastState = useForecastStore.getState();
  const forecastNetIncome =
    forecastState.incomeStreams.length > 0
      ? computeTotalNetIncome(forecastState.incomeStreams, forecastState.taxRate)
      : forecastState.baseIncome;

  const accountsSummary = activeAccounts.map((a) => ({
    name: a.name,
    type: a.type,
    balance: a.currentBalance || 0,
  }));

  const loansSummary = activeLoans.map((l) => ({
    name: l.name,
    type: l.type,
    principal: l.principal || 0,
    rate: l.rate || 0,
    monthlyPayment: l.monthlyPayment || 0,
  }));

  // Keep context block concise (~650 tokens) so Gemini Nano's 4k context window stays fast and never overflows
  const contextLines: string[] = [
    `Date Range: ${startDate} to ${endDate} (${scopedTxns.length} transactions)`,
    `Period Totals: Spend ${usd.format(totalSpendDollars)} | Income ${usd.format(totalIncomeDollars)} | Net Cashflow ${netCashflowDollars >= 0 ? '+' : ''}${usd.format(netCashflowDollars)}`,
    `Balance Sheet: Liquid Cash ${usd.format(liquidCashDollars)} | Investments ${usd.format(investmentsDollars)} | Total Debt ${usd.format(totalDebtDollars)} | Net Worth ${usd.format(netWorthDollars)}`,
    `Monthly Forecast Baseline: Net Income ${usd.format(forecastNetIncome)}/mo | Fixed Bills ${usd.format(forecastState.recurringBudget)}/mo | Variable Budget ${usd.format(forecastState.variableBudget)}/mo`,
    `Accounts: ${accountsSummary.map((a) => `${a.name} (${a.type}): ${usd.format(a.balance)}`).join(' | ') || 'None'}`,
  ];

  if (loansSummary.length > 0) {
    contextLines.push(
      `Loans: ${loansSummary.map((l) => `${l.name}: ${usd.format(l.principal)} @ ${l.rate}% (${usd.format(l.monthlyPayment)}/mo)`).join(' | ')}`
    );
  }

  if (topCategories.length > 0) {
    contextLines.push(
      `Spending by Category (${startDate}..${endDate}): ${topCategories
        .slice(0, 10)
        .map(
          (c) =>
            `${c.category}: ${usd.format(c.spendDollars)} (${c.count} txns${c.budgetDollars ? `, budget ${usd.format(c.budgetDollars)}/mo` : ''})`
        )
        .join(' | ')}`
    );
  }

  if (topMerchants.length > 0) {
    contextLines.push(
      `Top Merchants (${startDate}..${endDate}): ${topMerchants
        .slice(0, 10)
        .map((m) => `${m.merchant} (${m.category}): ${usd.format(m.spendDollars)} (${m.count}x)`)
        .join(' | ')}`
    );
  }

  if (matchedTransactionsNote) {
    contextLines.push(matchedTransactionsNote);
  }

  const contextBlock = contextLines.join('\n');
  const systemPrompt = [
    'You are a concise, helpful personal financial analyst built into Strictly Spending.',
    'Use ONLY the exact numbers from the Financial Data Context below.',
    'Format dollar amounts clearly, use bullet points for readability, and directly answer the user question.',
  ].join(' ');

  return {
    periodLabel: `${startDate} to ${endDate}`,
    startDate,
    endDate,
    totalSpendDollars,
    totalIncomeDollars,
    netCashflowDollars,
    txCount: scopedTxns.length,
    liquidCashDollars,
    investmentsDollars,
    totalDebtDollars,
    netWorthDollars,
    accountsSummary,
    loansSummary,
    topCategories,
    topMerchants,
    recurringMerchants: [],
    matchedTransactionsNote,
    systemPrompt,
    contextBlock,
  };
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'how', 'much', 'did', 'spend', 'spent', 'what',
  'where', 'when', 'who', 'why', 'are', 'was', 'were', 'have', 'has', 'had',
  'this', 'that', 'from', 'into', 'over', 'last', 'month', 'year', 'week',
  'money', 'going', 'most', 'top', 'biggest', 'largest', 'can', 'afford',
  'about', 'my', 'our', 'show', 'tell', 'give', 'summary', 'summarize',
  'looking', 'like', 'total', 'balance', 'balances', 'account', 'accounts',
  'category', 'categories', 'merchant', 'merchants', 'transactions',
]);

/**
 * Generates a response using Chrome / Edge Built-in AI (Gemini Nano) when available,
 * and falls back to the instant deterministic local financial analyst if Built-in AI is unavailable.
 */
export async function askBuiltInFinancialAi(params: {
  question: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  data: BuiltInAiFinancialData;
  onChunk: (text: string) => void;
  onDownloadProgress?: (percent: number) => void;
}): Promise<{ text: string; usedBuiltInModel: boolean }> {
  const ctx = await buildQueryAwareFinancialContext(params.question, params.data);
  const availability = await checkBuiltInAiAvailability();

  if (availability !== 'unavailable') {
    try {
      const session = await createBuiltInAiSession(ctx.systemPrompt, params.onDownloadProgress);
      try {
        const recentHistory = params.history
          .slice(-4)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n');

        const promptText = [
          '=== FINANCIAL DATA CONTEXT ===',
          ctx.contextBlock,
          recentHistory ? `\n=== RECENT CONVERSATION ===\n${recentHistory}` : '',
          `\nUser Question: ${params.question}`,
          'Provide a clear, accurate response grounded in the numbers above:',
        ]
          .filter(Boolean)
          .join('\n');

        const text = await consumeStreamOrPrompt(session, promptText, params.onChunk);
        if (text && text.trim().length > 0) {
          return { text: text.trim(), usedBuiltInModel: true };
        }
      } finally {
        session.destroy?.();
      }
    } catch {
      // Fall through to deterministic local analyst if Gemini Nano session fails
    }
  }

  const fallbackText = generateLocalAnalystResponse(params.question, ctx);
  params.onChunk(fallbackText);
  return { text: fallbackText, usedBuiltInModel: false };
}

function generateLocalAnalystResponse(question: string, ctx: CompactFinancialContext): string {
  const q = question.toLowerCase();

  if (ctx.matchedTransactionsNote && !q.includes('where is') && !q.includes('net worth') && !q.includes('budget')) {
    return [
      `Here is what I found in your transactions from **${ctx.startDate}** to **${ctx.endDate}**:`,
      '',
      ctx.matchedTransactionsNote,
      '',
      `**Period Context:** Total spending across all categories in this date range is **${usd.format(ctx.totalSpendDollars)}** against **${usd.format(ctx.totalIncomeDollars)}** in income.`,
    ].join('\n');
  }

  if (q.includes('net worth') || q.includes('balance') || q.includes('cash') || q.includes('debt') || q.includes('loan')) {
    const accBullets = ctx.accountsSummary
      .map((a) => `- **${a.name}** (${a.type}): **${usd.format(a.balance)}**`)
      .join('\n');
    const loanBullets =
      ctx.loansSummary.length > 0
        ? '\n\n**Active Loans & Liabilities:**\n' +
          ctx.loansSummary
            .map((l) => `- **${l.name}**: **${usd.format(l.principal)}** @ ${l.rate}% APR (${usd.format(l.monthlyPayment)}/mo)`)
            .join('\n')
        : '';

    return [
      `### Balance Sheet & Net Worth Summary`,
      `- **Estimated Net Worth:** **${usd.format(ctx.netWorthDollars)}**`,
      `- **Liquid Cash (Checking & Savings):** **${usd.format(ctx.liquidCashDollars)}**`,
      `- **Investment Accounts:** **${usd.format(ctx.investmentsDollars)}**`,
      `- **Total Debt:** **${usd.format(ctx.totalDebtDollars)}**`,
      '',
      '**Accounts:**',
      accBullets || '- No active accounts found.',
      loanBullets,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (q.includes('budget') || q.includes('safe') || q.includes('pace') || q.includes('afford')) {
    const forecastState = useForecastStore.getState();
    const netInc =
      forecastState.incomeStreams.length > 0
        ? computeTotalNetIncome(forecastState.incomeStreams, forecastState.taxRate)
        : forecastState.baseIncome;
    const totalBudget = forecastState.recurringBudget + forecastState.variableBudget;
    const safeRemainder = netInc - totalBudget;

    const overBudgetCats = ctx.topCategories
      .filter((c) => c.budgetDollars && c.spendDollars > c.budgetDollars)
      .map((c) => `- **${c.category}**: **${usd.format(c.spendDollars)}** spent vs **${usd.format(c.budgetDollars!)}** budget (+${usd.format(c.spendDollars - c.budgetDollars!)} over)`);

    const onTrackCats = ctx.topCategories
      .filter((c) => c.budgetDollars && c.spendDollars <= c.budgetDollars)
      .slice(0, 5)
      .map((c) => `- **${c.category}**: **${usd.format(c.spendDollars)}** / ${usd.format(c.budgetDollars!)} (${usd.format(c.budgetDollars! - c.spendDollars)} left)`);

    return [
      `### Budget & Cashflow Pace (${ctx.startDate} to ${ctx.endDate})`,
      `- **Period Spending:** **${usd.format(ctx.totalSpendDollars)}** across ${ctx.txCount} transactions`,
      `- **Period Income:** **${usd.format(ctx.totalIncomeDollars)}** (${ctx.netCashflowDollars >= 0 ? '+' : ''}${usd.format(ctx.netCashflowDollars)} net)`,
      `- **Monthly Baseline:** **${usd.format(netInc)}/mo** net income vs **${usd.format(totalBudget)}/mo** budget (**${usd.format(forecastState.recurringBudget)}** fixed bills + **${usd.format(forecastState.variableBudget)}** variable living) → **${usd.format(safeRemainder)}/mo** unallocated buffer`,
      overBudgetCats.length > 0 ? '\n**Categories Over Monthly Target:**\n' + overBudgetCats.join('\n') : '',
      onTrackCats.length > 0 ? '\n**Categories Within Target:**\n' + onTrackCats.join('\n') : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (q.includes('merchant') || q.includes('vendor') || q.includes('store') || q.includes('recurring') || q.includes('bill') || q.includes('subscription')) {
    const topM = ctx.topMerchants
      .slice(0, 8)
      .map((m, i) => `${i + 1}. **${m.merchant}** (${m.category}): **${usd.format(m.spendDollars)}** across ${m.count} transaction${m.count === 1 ? '' : 's'}`)
      .join('\n');

    return [
      `### Top Merchants (${ctx.startDate} to ${ctx.endDate})`,
      topM || 'No merchant spending found in the selected date range.',
      '',
      `Total spending in this period is **${usd.format(ctx.totalSpendDollars)}**.`,
    ].join('\n');
  }

  // Default comprehensive spending & cashflow breakdown
  const topCats = ctx.topCategories
    .slice(0, 6)
    .map((c) => {
      const pct = ctx.totalSpendDollars > 0 ? Math.round((c.spendDollars / ctx.totalSpendDollars) * 100) : 0;
      return `- **${c.category}**: **${usd.format(c.spendDollars)}** (${pct}% of spend, ${c.count} txns)`;
    })
    .join('\n');

  const topMerchs = ctx.topMerchants
    .slice(0, 5)
    .map((m) => `- **${m.merchant}** (${m.category}): **${usd.format(m.spendDollars)}** (${m.count}x)`)
    .join('\n');

  return [
    `### Financial Summary (${ctx.startDate} to ${ctx.endDate})`,
    `- **Total Spend:** **${usd.format(ctx.totalSpendDollars)}**`,
    `- **Total Income:** **${usd.format(ctx.totalIncomeDollars)}**`,
    `- **Net Cashflow:** **${ctx.netCashflowDollars >= 0 ? '+' : ''}${usd.format(ctx.netCashflowDollars)}**`,
    `- **Liquid Cash:** **${usd.format(ctx.liquidCashDollars)}** · **Net Worth:** **${usd.format(ctx.netWorthDollars)}**`,
    '',
    '**Top Spending Categories:**',
    topCats || '- No spending recorded in this period.',
    '',
    '**Top Merchants:**',
    topMerchs || '- No merchants recorded in this period.',
  ].join('\n');
}
