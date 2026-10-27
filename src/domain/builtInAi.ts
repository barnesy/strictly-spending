import { api } from '../api';
import { usd, usdCents, monthLabel } from '../lib';
import { resolveDateRange, formatLocalDate, useFilters } from '../stores/store';
import { useForecastStore, computeTotalNetIncome } from '../stores/forecastStore';
import { loadForecastBaselineData } from './incomeStreams';
import {
  consolidateRecurringMerchants,
  getMerchantBillStatus,
  getStreamPaycheckSchedule,
} from './forecastSpending';
import { buildRecurrenceMap } from './recurrence';
import type { Account, Budget, Category, Loan, RecurrenceInfo, Transaction } from '../types';

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

function getLanguageModelGlobal(): { kind: 'standard' | 'legacy-ai' | 'legacy-model'; api: any } | null {
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
            accumulated = piece;
          } else {
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

// Natural-language synonyms mapped to common category keywords
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  food: ['dining', 'groceries', 'restaurant', 'fast food', 'coffee', 'food', 'bars', 'alcohol', 'delivery'],
  'eating out': ['dining', 'restaurant', 'fast food', 'coffee', 'bars', 'food'],
  restaurant: ['dining', 'restaurant', 'fast food'],
  restaurants: ['dining', 'restaurant', 'fast food'],
  takeout: ['dining', 'restaurant', 'fast food'],
  coffee: ['coffee', 'dining'],
  groceries: ['groceries', 'grocery', 'supermarket'],
  grocery: ['groceries', 'grocery', 'supermarket'],
  car: ['auto', 'gas', 'transportation', 'parking', 'insurance', 'vehicle'],
  auto: ['auto', 'gas', 'transportation', 'insurance'],
  gas: ['gas', 'fuel', 'auto', 'transportation'],
  fuel: ['gas', 'fuel', 'auto'],
  commute: ['transportation', 'gas', 'auto', 'transit', 'parking'],
  house: ['housing', 'mortgage', 'rent', 'utilities', 'home', 'maintenance'],
  home: ['housing', 'mortgage', 'rent', 'utilities', 'home', 'shopping'],
  housing: ['housing', 'mortgage', 'rent'],
  rent: ['housing', 'rent', 'mortgage'],
  mortgage: ['mortgage', 'housing'],
  bills: ['utilities', 'insurance', 'subscriptions', 'housing', 'mortgage', 'phone', 'internet', 'loan', 'student loan', 'auto loan'],
  utilities: ['utilities', 'electric', 'water', 'internet', 'phone', 'gas'],
  subscriptions: ['subscriptions', 'streaming', 'software', 'membership'],
  subscription: ['subscriptions', 'streaming', 'software', 'membership'],
  shopping: ['shopping', 'merchandise', 'clothing', 'electronics', 'amazon', 'general merchandise'],
  clothes: ['clothing', 'shopping', 'apparel'],
  entertainment: ['entertainment', 'recreation', 'movies', 'games', 'hobbies', 'fun'],
  fun: ['entertainment', 'dining', 'travel', 'recreation', 'hobbies', 'bars'],
  travel: ['travel', 'flights', 'hotel', 'vacation', 'airlines', 'lodging'],
  vacation: ['travel', 'flights', 'hotel', 'vacation'],
  medical: ['medical', 'health', 'healthcare', 'doctor', 'pharmacy', 'dental', 'fitness'],
  health: ['medical', 'health', 'healthcare', 'pharmacy', 'fitness', 'gym'],
  debt: ['mortgage', 'auto loan', 'student loan', 'loan', 'credit card'],
  loans: ['mortgage', 'auto loan', 'student loan', 'loan'],
};

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'how', 'much', 'did', 'spend', 'spent', 'spending',
  'what', 'where', 'when', 'who', 'why', 'are', 'was', 'were', 'have', 'has', 'had',
  'this', 'that', 'from', 'into', 'over', 'last', 'month', 'months', 'year', 'years',
  'week', 'weeks', 'day', 'days', 'money', 'going', 'most', 'top', 'biggest', 'largest',
  'highest', 'lowest', 'can', 'could', 'would', 'should', 'afford', 'about', 'our',
  'show', 'tell', 'give', 'summary', 'summarize', 'looking', 'like', 'total', 'totals',
  'balance', 'balances', 'account', 'accounts', 'category', 'categories', 'merchant',
  'merchants', 'transaction', 'transactions', 'compare', 'compared', 'comparison',
  'between', 'versus', 'avg', 'average', 'averages', 'monthly', 'yearly', 'annual',
  'all', 'time', 'recent', 'recently', 'current', 'currently', 'right', 'now', 'today',
  'please', 'help', 'find', 'list', 'see', 'check', 'analyze', 'analysis', 'breakdown',
  'report', 'status', 'pace', 'safe', 'budget', 'budgets', 'income', 'make', 'making',
  'earn', 'earning', 'pay', 'paid', 'paying', 'payment', 'payments', 'bill', 'bills',
  'recurring', 'subscription', 'subscriptions', 'cut', 'back', 'save', 'saving',
  'savings', 'more', 'less', 'extra', 'net', 'worth', 'cash', 'debt', 'debts', 'loan',
  'loans', 'payoff', 'charge', 'charges', 'expense', 'expenses', 'cost', 'costs',
  'purchase', 'buy', 'buying', 'bought', 'many', 'times', 'often', 'any', 'there',
  'coming', 'upcoming', 'hurt', 'hurts', 'unpaid', 'due', 'cleared', 'clear', 'pending',
  'hit', 'hits', 'hitting', 'left', 'remaining', 'remain', 'before', 'after', 'end',
  'ending', 'still', 'already', 'yet', 'anything', 'something', 'nothing', 'everything',
  'big', 'large', 'small', 'not', 'dont', 'doesnt', 'will', 'wont', 'track', 'tracking',
  'lately', 'usual', 'unusual', 'anomaly', 'anomalies', 'spike', 'spikes', 'high', 'low',
  'drop', 'dropped', 'change', 'changed', 'trend', 'trends', 'paycheck', 'paychecks',
  'salary', 'inflow', 'inflows', 'outflow', 'outflows', 'buffer', 'cushion', 'splurge',
  'room', 'safely', 'rest', 'need', 'needing', 'want', 'thinking', 'without', 'other',
]);

interface TimePeriodResolution {
  label: string;
  startDate: string;
  endDate: string;
  prevStartDate?: string;
  prevEndDate?: string;
  prevLabel?: string;
  isExplicitInQuery: boolean;
}

function resolveQueryTimePeriod(
  question: string,
  latestTxDate: string | null,
  dashboardStart: string,
  dashboardEnd: string
): TimePeriodResolution {
  const q = question.toLowerCase();
  const anchor = latestTxDate ? new Date(`${latestTxDate}T12:00:00`) : new Date();
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth() + 1; // 1-12

  const fmtMonthRange = (y: number, m: number) => {
    const lastDay = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return {
      start: `${y}-${mm}-01`,
      end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
      mk: `${y}-${mm}`,
    };
  };

  if (q.includes('last month') || q.includes('previous month') || q.includes('prior month')) {
    const d = new Date(anchorYear, anchorMonth - 2, 1);
    const cur = fmtMonthRange(d.getFullYear(), d.getMonth() + 1);
    const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prev = fmtMonthRange(prevD.getFullYear(), prevD.getMonth() + 1);
    return {
      label: `Last Month (${monthLabel(cur.mk)})`,
      startDate: cur.start,
      endDate: cur.end,
      prevStartDate: prev.start,
      prevEndDate: prev.end,
      prevLabel: monthLabel(prev.mk),
      isExplicitInQuery: true,
    };
  }

  if (q.includes('this month') || q.includes('current month')) {
    const cur = fmtMonthRange(anchorYear, anchorMonth);
    const prevD = new Date(anchorYear, anchorMonth - 2, 1);
    const prev = fmtMonthRange(prevD.getFullYear(), prevD.getMonth() + 1);
    return {
      label: `This Month (${monthLabel(cur.mk)})`,
      startDate: cur.start,
      endDate: cur.end,
      prevStartDate: prev.start,
      prevEndDate: prev.end,
      prevLabel: monthLabel(prev.mk),
      isExplicitInQuery: true,
    };
  }

  if (q.includes('last 3 months') || q.includes('past 3 months') || q.includes('last three months')) {
    const startD = new Date(anchorYear, anchorMonth - 3, 1);
    const s = fmtMonthRange(startD.getFullYear(), startD.getMonth() + 1);
    const e = fmtMonthRange(anchorYear, anchorMonth);
    return {
      label: `Last 3 Months (${monthLabel(s.mk)} – ${monthLabel(e.mk)})`,
      startDate: s.start,
      endDate: e.end,
      isExplicitInQuery: true,
    };
  }

  if (q.includes('this year') || q.includes('year to date') || q.includes('ytd')) {
    return {
      label: `Year to Date (${anchorYear})`,
      startDate: `${anchorYear}-01-01`,
      endDate: `${anchorYear}-12-31`,
      prevStartDate: `${anchorYear - 1}-01-01`,
      prevEndDate: `${anchorYear - 1}-12-31`,
      prevLabel: `${anchorYear - 1}`,
      isExplicitInQuery: true,
    };
  }

  if (q.includes('last year') || q.includes('prior year')) {
    const y = anchorYear - 1;
    return {
      label: `Last Year (${y})`,
      startDate: `${y}-01-01`,
      endDate: `${y}-12-31`,
      isExplicitInQuery: true,
    };
  }

  if (q.includes('all time') || q.includes('ever') || q.includes('entire history')) {
    return {
      label: 'All Time',
      startDate: '1970-01-01',
      endDate: '2100-01-01',
      isExplicitInQuery: true,
    };
  }

  // Check for specific month name (e.g. "in september", "august")
  for (const [mName, mNum] of Object.entries(MONTH_NAMES)) {
    const regex = new RegExp(`\\b${mName}\\b`, 'i');
    if (regex.test(q)) {
      const yearMatch = q.match(/\b(202\d)\b/);
      let y = yearMatch ? Number(yearMatch[1]) : anchorYear;
      if (!yearMatch && mNum > anchorMonth) {
        y = anchorYear - 1;
      }
      const cur = fmtMonthRange(y, mNum);
      const prevD = new Date(y, mNum - 2, 1);
      const prev = fmtMonthRange(prevD.getFullYear(), prevD.getMonth() + 1);
      return {
        label: monthLabel(cur.mk),
        startDate: cur.start,
        endDate: cur.end,
        prevStartDate: prev.start,
        prevEndDate: prev.end,
        prevLabel: monthLabel(prev.mk),
        isExplicitInQuery: true,
      };
    }
  }

  // Default to active dashboard range, plus compute previous month for comparisons
  const curMonth = fmtMonthRange(anchorYear, anchorMonth);
  const prevD = new Date(anchorYear, anchorMonth - 2, 1);
  const prevMonth = fmtMonthRange(prevD.getFullYear(), prevD.getMonth() + 1);
  return {
    label: `${dashboardStart} to ${dashboardEnd}`,
    startDate: dashboardStart,
    endDate: dashboardEnd,
    prevStartDate: prevMonth.start,
    prevEndDate: prevMonth.end,
    prevLabel: monthLabel(prevMonth.mk),
    isExplicitInQuery: false,
  };
}

export interface DeepFinancialAnalysis {
  question: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  totalSpendDollars: number;
  totalIncomeDollars: number;
  netCashflowDollars: number;
  txCount: number;
  currentMonthLabel: string;
  currentMonthSpendDollars: number;
  currentMonthIncomeDollars: number;
  lastMonthLabel: string;
  lastMonthSpendDollars: number;
  lastMonthIncomeDollars: number;
  liquidCashDollars: number;
  investmentsDollars: number;
  totalDebtDollars: number;
  netWorthDollars: number;
  monthlyNetIncomeBaseline: number;
  monthlyRecurringBaseline: number;
  monthlyVariableBaseline: number;
  monthlySavingsOutBaseline: number;
  monthlySafeRemainder: number;
  uncategorizedCount: number;
  synthesizedMarkdownReport: string;
  compactLlmPromptContext: string;
}

export async function analyzeQuestionAndFinances(
  question: string,
  data: BuiltInAiFinancialData
): Promise<DeepFinancialAnalysis> {
  const filterState = useFilters.getState();
  const demoMode = filterState.demoMode;
  const dashRange = resolveDateRange(filterState);
  const dashStart = formatLocalDate(dashRange.start);
  const dashEnd = formatLocalDate(dashRange.end);

  // Fetch all transactions, recurring merchants, trailing averages, and forecast baseline in parallel
  const [
    allHistoryTxns,
    rawRecurringMerchants,
    trailingAverages,
    recurrenceMapObj,
    uncategorizedCount,
    forecastBaseline,
  ] = await Promise.all([
    api.getTransactions('1970-01-01', '2100-01-01'),
    api.getConsolidatedRecurringMerchants(demoMode).catch(() => []),
    api.getCategoryTrailingAverages(demoMode).catch(() => []),
    buildRecurrenceMap(demoMode, undefined).catch(() => ({})),
    api.getUncategorizedCount(demoMode).catch(() => 0),
    loadForecastBaselineData().catch(() => null),
  ]);

  const activeAccounts = data.accounts.filter((a) =>
    demoMode ? a.source === 'demo' : a.source !== 'demo'
  );
  const accountById = new Map<number, Account>();
  for (const acc of activeAccounts) {
    if (acc.id !== undefined) accountById.set(acc.id, acc);
  }

  const enabledAccountIds =
    filterState.enabledAccountIds && filterState.enabledAccountIds.length > 0
      ? filterState.enabledAccountIds
      : undefined;

  const validTxns = allHistoryTxns.filter((t) => {
    if (demoMode ? t.source !== 'demo' : t.source === 'demo') return false;
    return true;
  });

  const latestTxDate = validTxns.reduce<string | null>(
    (max, t) => (!max || t.date > max ? t.date : max),
    null
  );

  const timePeriod = resolveQueryTimePeriod(question, latestTxDate, dashStart, dashEnd);

  // Check if user mentioned a specific account in their question
  const qLower = question.toLowerCase();
  const mentionedAccounts = activeAccounts.filter((a) => {
    const nameLow = a.name.toLowerCase();
    const instLow = (a.institution || '').toLowerCase();
    const last4 = a.last4 || a.name.match(/\b(\d{4})\b/)?.[1];
    if (last4 && qLower.includes(last4)) return true;
    if (nameLow.length >= 3 && qLower.includes(nameLow)) return true;
    if (instLow.length >= 3 && qLower.includes(instLow)) return true;
    if ((qLower.includes('boa') || qLower.includes('bank of america')) && /bank of america|\bboa\b/i.test(`${a.name} ${a.institution}`)) return true;
    if (qLower.includes('truist') && /truist/i.test(`${a.name} ${a.institution}`)) return true;
    return false;
  });

  const targetAccountIds =
    mentionedAccounts.length > 0
      ? new Set(mentionedAccounts.map((a) => a.id!).filter(Boolean))
      : enabledAccountIds
        ? new Set(enabledAccountIds)
        : null;

  const scopedAllTimeTxns = validTxns.filter((t) =>
    targetAccountIds ? targetAccountIds.has(t.accountId) : true
  );

  const periodTxns = scopedAllTimeTxns.filter(
    (t) => t.date >= timePeriod.startDate && t.date <= timePeriod.endDate
  );

  const transferCats = new Set(
    data.categories
      .filter((c) => c.type === 'transfer')
      .map((c) => c.name.toLowerCase())
  );
  transferCats.add('transfer');
  transferCats.add('credit card payment');

  const isTransfer = (t: Transaction) =>
    transferCats.has((t.category || '').toLowerCase());

  const summarizeTxns = (txns: Transaction[]) => {
    let spendCents = 0;
    let incomeCents = 0;
    const byCat = new Map<string, { spendCents: number; count: number; txns: Transaction[] }>();
    const byMerch = new Map<string, { spendCents: number; count: number; category: string; txns: Transaction[] }>();
    const byAcct = new Map<number, { spendCents: number; incomeCents: number; count: number }>();

    for (const t of txns) {
      if (isTransfer(t)) continue;
      const acctStat = byAcct.get(t.accountId) || { spendCents: 0, incomeCents: 0, count: 0 };
      acctStat.count += 1;

      if (t.amount < 0) {
        const abs = Math.abs(t.amount);
        spendCents += abs;
        acctStat.spendCents += abs;

        const cat = t.category || 'Uncategorized';
        const cEntry = byCat.get(cat) || { spendCents: 0, count: 0, txns: [] };
        cEntry.spendCents += abs;
        cEntry.count += 1;
        cEntry.txns.push(t);
        byCat.set(cat, cEntry);

        const mKey = (t.merchantKey || t.description || 'Unknown').trim();
        const mEntry = byMerch.get(mKey) || { spendCents: 0, count: 0, category: cat, txns: [] };
        mEntry.spendCents += abs;
        mEntry.count += 1;
        mEntry.txns.push(t);
        byMerch.set(mKey, mEntry);
      } else if (t.amount > 0) {
        incomeCents += t.amount;
        acctStat.incomeCents += t.amount;
      }
      byAcct.set(t.accountId, acctStat);
    }

    return {
      spendDollars: spendCents,
      incomeDollars: incomeCents,
      netDollars: incomeCents - spendCents,
      byCat,
      byMerch,
      byAcct,
    };
  };

  const periodStats = summarizeTxns(periodTxns);

  // Also compute current anchor month and prior month stats for MoM comparisons
  const anchor = latestTxDate ? new Date(`${latestTxDate}T12:00:00`) : new Date();
  const curY = anchor.getFullYear();
  const curM = anchor.getMonth() + 1;
  const curMonthKey = `${curY}-${String(curM).padStart(2, '0')}`;
  const prevDate = new Date(curY, curM - 2, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const curMonthTxns = scopedAllTimeTxns.filter((t) => t.date.startsWith(curMonthKey));
  const prevMonthTxns = scopedAllTimeTxns.filter((t) => t.date.startsWith(prevMonthKey));
  const curMonthStats = summarizeTxns(curMonthTxns);
  const prevMonthStats = summarizeTxns(prevMonthTxns);

  // Trailing averages map
  const trailingAvgByCat = new Map<string, number>();
  for (const item of trailingAverages) {
    trailingAvgByCat.set(item.category, item.average);
  }

  // Budget map
  const budgetByCat = new Map<string, number>();
  for (const b of data.budgets) {
    if (b.monthlyAmount > 0) budgetByCat.set(b.category, b.monthlyAmount);
  }

  // Recurring merchants & End-of-Month Bill Status
  const recurrenceMap = new Map<string, RecurrenceInfo>(Object.entries(recurrenceMapObj));
  const consolidatedRecurring = consolidateRecurringMerchants(rawRecurringMerchants, recurrenceMap);
  const curDayOfMonth = anchor.getDate();
  const daysInCurMonth = new Date(curY, curM, 0).getDate();
  const daysRemainingInMonth = Math.max(0, daysInCurMonth - curDayOfMonth);

  const recurringWithStatus = consolidatedRecurring.map((m) => ({
    ...m,
    status: getMerchantBillStatus(m.merchantKey, curMonthKey, recurrenceMap, anchor),
  }));
  const unpaidBills = recurringWithStatus
    .filter((b) => !b.status.isPaidThisMonth && b.status.isExpectedThisMonth)
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage);
  const paidBills = recurringWithStatus
    .filter((b) => b.status.isPaidThisMonth)
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage);
  const unpaidBillsTotalDollars = unpaidBills.reduce((s, b) => s + b.monthlyAverage, 0);
  const paidBillsTotalDollars = paidBills.reduce((s, b) => s + b.monthlyAverage, 0);

  // Recent 7-day and pending transactions for "Has anything hit?" tracking
  const sevenDaysAgo = new Date(anchor.getTime() - 7 * 86_400_000);
  const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;
  const pendingTxns = scopedAllTimeTxns
    .filter((t) => t.isPending && !isTransfer(t))
    .sort((a, b) => b.date.localeCompare(a.date));
  const recent7DayTxns = curMonthTxns
    .filter((t) => t.date >= sevenDaysAgoStr && !isTransfer(t))
    .sort((a, b) => b.date.localeCompare(a.date) || a.amount - b.amount);
  const recent7DayBigCharges = recent7DayTxns
    .filter((t) => t.amount < 0 && Math.abs(t.amount) >= 50)
    .sort((a, b) => a.amount - b.amount);

  // Balance Sheet & Net Worth
  const liquidCashDollars = activeAccounts
    .filter((a) => a.type === 'checking' || a.type === 'savings')
    .reduce((s, a) => s + (a.currentBalance || 0), 0);
  const checkingCashDollars = activeAccounts
    .filter((a) => a.type === 'checking')
    .reduce((s, a) => s + (a.currentBalance || 0), 0);
  const savingsCashDollars = activeAccounts
    .filter((a) => a.type === 'savings')
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

  // Monthly baseline cashflow from Forecast store or freshly loaded baseline
  const fState = useForecastStore.getState();
  const activeStreams =
    fState.incomeStreams.length > 0
      ? fState.incomeStreams
      : forecastBaseline?.incomeStreams || [];
  const monthlyNetIncomeBaseline =
    activeStreams.length > 0
      ? computeTotalNetIncome(activeStreams, fState.taxRate)
      : forecastBaseline?.baseline.income || fState.baseIncome || curMonthStats.incomeDollars || prevMonthStats.incomeDollars;
  const monthlyRecurringBaseline =
    fState.recurringBudget > 0
      ? fState.recurringBudget
      : forecastBaseline?.baseline.recurring || 0;
  const monthlyVariableBaseline =
    fState.variableBudget > 0
      ? fState.variableBudget
      : forecastBaseline?.baseline.variable || 0;
  const activeDestinations =
    fState.destinations.length > 0
      ? fState.destinations
      : forecastBaseline?.destinations || [];
  const monthlySavingsOutBaseline = activeDestinations
    .filter((d) => d.enabled)
    .reduce((s, d) => s + (d.monthlyAllocation || 0), 0);
  const monthlySafeRemainder =
    monthlyNetIncomeBaseline -
    monthlyRecurringBaseline -
    monthlyVariableBaseline -
    monthlySavingsOutBaseline -
    (fState.extraLoanPayment || 0);

  // Compute current-month paycheck schedule across active income streams
  const enabledStreams = activeStreams.filter((s) => s.enabled !== false);
  const streamSchedules = enabledStreams.map((s) => ({
    stream: s,
    schedule: getStreamPaycheckSchedule(s, curMonthKey, fState.taxRate),
  }));
  const remainingPaychecksCount = streamSchedules.reduce(
    (sum, item) => sum + item.schedule.unpaidPaychecks,
    0
  );
  const remainingPaychecksDollars = streamSchedules.reduce(
    (sum, item) => sum + item.schedule.unpaidPaychecks * item.schedule.netPerPaycheck,
    0
  );
  const receivedPaychecksCount = streamSchedules.reduce(
    (sum, item) => sum + item.schedule.receivedCount,
    0
  );

  // Semantic Category Matching
  const matchedCategories = new Set<string>();
  const allCategoryNames = Array.from(
    new Set([
      ...data.categories.map((c) => c.name),
      ...Array.from(periodStats.byCat.keys()),
      ...Array.from(curMonthStats.byCat.keys()),
    ])
  );

  for (const catName of allCategoryNames) {
    if (catName && qLower.includes(catName.toLowerCase())) {
      matchedCategories.add(catName);
    }
  }
  for (const [synonym, targets] of Object.entries(CATEGORY_SYNONYMS)) {
    if (qLower.includes(synonym)) {
      for (const catName of allCategoryNames) {
        const cLow = catName.toLowerCase();
        if (targets.some((t) => cLow.includes(t) || t.includes(cLow))) {
          matchedCategories.add(catName);
        }
      }
    }
  }

  // Keyword / Merchant Matching across transactions
  const synonymWords = new Set(
    Object.keys(CATEGORY_SYNONYMS)
      .flatMap((k) => k.split(/\s+/))
      .map((w) => w.toLowerCase())
  );
  const queryKeywords = qLower
    .replace(/\$[0-9,.]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !(w in MONTH_NAMES) && !synonymWords.has(w));

  // Filter out keywords that are just matched category names or account names
  const specificMerchantKeywords = queryKeywords.filter((kw) => {
    for (const c of matchedCategories) {
      if (c.toLowerCase().includes(kw)) return false;
    }
    if (kw in CATEGORY_SYNONYMS) return false;
    for (const acc of mentionedAccounts) {
      if (acc.name.toLowerCase().includes(kw) || (acc.institution || '').toLowerCase().includes(kw)) {
        return false;
      }
    }
    return true;
  });

  const searchPool = timePeriod.isExplicitInQuery ? periodTxns : scopedAllTimeTxns;
  const keywordMatchedTxns =
    specificMerchantKeywords.length > 0
      ? searchPool.filter((t) => {
          const hay = `${t.merchantKey || ''} ${t.description || ''}`.toLowerCase();
          return specificMerchantKeywords.some((kw) => new RegExp(`\\b${kw}`, 'i').test(hay));
        })
      : [];

  // Parse dollar amount if asking "Can I afford $X" or "What if $X"
  const dollarMatch = question.match(/\$\s*([0-9,]+(?:\.[0-9]{1,2})?)|([0-9,]+)\s*(?:dollars|bucks)/i);
  const parsedDollarAmount = dollarMatch
    ? Number((dollarMatch[1] || dollarMatch[2]).replace(/,/g, ''))
    : null;

  // Build rich, multi-section synthesized markdown report tailored to the exact question
  const sections: string[] = [];

  // 1. Specific Merchant / Keyword Match Section
  if (keywordMatchedTxns.length > 0) {
    const spendTxns = keywordMatchedTxns.filter((t) => t.amount < 0);
    const incomeTxns = keywordMatchedTxns.filter((t) => t.amount > 0);
    const totalMatchSpend = spendTxns.reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalMatchIncome = incomeTxns.reduce((s, t) => s + t.amount, 0);
    const inPeriodMatches = keywordMatchedTxns.filter(
      (t) => t.date >= timePeriod.startDate && t.date <= timePeriod.endDate
    );
    const inPeriodSpend =
      inPeriodMatches.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

    const avgCharge = spendTxns.length > 0 ? totalMatchSpend / spendTxns.length : 0;
    const sortedMatches = [...keywordMatchedTxns].sort((a, b) => b.date.localeCompare(a.date));
    const shownMatches = sortedMatches.slice(0, 8);
    const shownTotal = shownMatches.reduce((s, t) => s + t.amount, 0);

    sections.push(
      [
        `### Matching Transactions: "${specificMerchantKeywords.join(' ')}"`,
        `| Date · Merchant | Category · Account | Amount |`,
        `| --- | --- | --- |`,
        ...shownMatches.map((t) => {
          const accName = accountById.get(t.accountId)?.name || 'Account';
          return `| ${t.date} · **${(t.merchantKey || t.description).slice(0, 26)}** | ${t.category || 'Uncategorized'} · ${accName.slice(0, 18)} | ${usdCents.format(t.amount)} |`;
        }),
        shownMatches.length < keywordMatchedTxns.length
          ? `| + ${keywordMatchedTxns.length - shownMatches.length} older transactions | Avg ${usdCents.format(avgCharge)}/charge | ${usdCents.format(-totalMatchSpend - shownTotal)} |`
          : '',
        `| **= Period Total (${timePeriod.label})** | **${inPeriodMatches.length} txns (Avg ${usdCents.format(avgCharge)})** | **-${usdCents.format(inPeriodSpend)}** |`,
        !timePeriod.isExplicitInQuery && keywordMatchedTxns.length !== inPeriodMatches.length
          ? `| **= All-Time Total** | **${spendTxns.length} charges${totalMatchIncome > 0 ? ` (+${usd.format(totalMatchIncome)} inflows)` : ''}** | **-${usdCents.format(totalMatchSpend)}** |`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  // 2. Specific Category / Topic Match Section (e.g. "food", "eating out", "groceries", "shopping")
  if (matchedCategories.size > 0) {
    const catList = Array.from(matchedCategories);
    let combinedPeriodSpend = 0;
    let combinedCurMonthSpend = 0;
    let combinedPrevMonthSpend = 0;
    let combinedTrailingAvg = 0;
    let combinedBudget = 0;
    let combinedTxCount = 0;
    const combinedTxns: Transaction[] = [];

    const catTableRows: string[] = [];
    for (const cName of catList) {
      const pStat = periodStats.byCat.get(cName);
      const curStat = curMonthStats.byCat.get(cName);
      const prevStat = prevMonthStats.byCat.get(cName);
      const pSpend = pStat ? pStat.spendCents : 0;
      const curSpend = curStat ? curStat.spendCents : 0;
      const prevSpend = prevStat ? prevStat.spendCents : 0;
      const tAvg = trailingAvgByCat.get(cName) || 0;
      const bAmt = budgetByCat.get(cName) || 0;

      combinedPeriodSpend += pSpend;
      combinedCurMonthSpend += curSpend;
      combinedPrevMonthSpend += prevSpend;
      combinedTrailingAvg += tAvg;
      combinedBudget += bAmt;
      combinedTxCount += pStat ? pStat.count : 0;
      if (pStat) combinedTxns.push(...pStat.txns);

      if (pSpend > 0 || curSpend > 0 || prevSpend > 0 || tAvg > 0) {
        catTableRows.push(
          `| **${cName}** (${pStat?.count || 0}x) | ${usd.format(curSpend)} | ${usd.format(prevSpend)} | ${usd.format(tAvg)}/mo | ${usd.format(pSpend)} |`
        );
      }
    }

    // Top merchants inside those matched categories
    const merchInCats = new Map<string, { spendCents: number; count: number }>();
    for (const t of combinedTxns) {
      const mk = (t.merchantKey || t.description || 'Unknown').trim();
      const prev = merchInCats.get(mk) || { spendCents: 0, count: 0 };
      prev.spendCents += Math.abs(t.amount);
      prev.count += 1;
      merchInCats.set(mk, prev);
    }
    const topMerchInCats = Array.from(merchInCats.entries())
      .sort((a, b) => b[1].spendCents - a[1].spendCents)
      .slice(0, 6);
    const topMerchSum = topMerchInCats.reduce((s, [, v]) => s + v.spendCents, 0);
    const otherMerchSum = Math.max(0, combinedPeriodSpend - topMerchSum);

    sections.push(
      [
        `### Category Math: ${catList.join(' + ')}`,
        `| Category | ${monthLabel(curMonthKey)} | ${monthLabel(prevMonthKey)} | 3-Mo Avg | ${timePeriod.isExplicitInQuery ? timePeriod.label : 'Period'} |`,
        `| --- | --- | --- | --- | --- |`,
        ...(catTableRows.length > 0
          ? catTableRows
          : [`| No spending recorded | $0 | $0 | $0/mo | $0 |`]),
        `| **= Total (${combinedTxCount} txns)** | **${usd.format(combinedCurMonthSpend)}** | **${usd.format(combinedPrevMonthSpend)}** | **${usd.format(combinedTrailingAvg)}/mo** | **${usd.format(combinedPeriodSpend)}** |`,
        combinedBudget > 0
          ? `> **Budget Check:** Combined monthly budget is **${usd.format(combinedBudget)}/mo** (${monthLabel(curMonthKey)} is **${combinedCurMonthSpend > combinedBudget ? `+${usd.format(combinedCurMonthSpend - combinedBudget)} over` : `${usd.format(combinedBudget - combinedCurMonthSpend)} under`}** budget).`
          : '',
        ...(topMerchInCats.length > 0
          ? [
              '',
              `**Merchant Breakdown (${timePeriod.label}):**`,
              `| Merchant | Charges | Total |`,
              `| --- | --- | --- |`,
              ...topMerchInCats.map(
                ([m, v]) => `| **${m}** | ${v.count} charge${v.count === 1 ? '' : 's'} (avg ${usd.format(v.spendCents / v.count)}) | -${usd.format(v.spendCents)} |`
              ),
              otherMerchSum > 1
                ? `| + Other merchants in group | ${Math.max(0, combinedTxCount - topMerchInCats.reduce((s, [, v]) => s + v.count, 0))} charges | -${usd.format(otherMerchSum)} |`
                : '',
              `| **= Category Total** | **${combinedTxCount} charges** | **-${usd.format(combinedPeriodSpend)}** |`,
            ]
          : []),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  // 2.5 End-of-Month Bill, Paycheck & Recent Transaction Tracker
  if (
    qLower.includes('coming up') ||
    qLower.includes('upcoming') ||
    qLower.includes('end of the month') ||
    qLower.includes('end of month') ||
    qLower.includes('rest of the month') ||
    qLower.includes('left to pay') ||
    qLower.includes('still due') ||
    /\bdue\b/.test(qLower) ||
    qLower.includes('unpaid') ||
    qLower.includes('cleared') ||
    /\bhit\b/.test(qLower) ||
    qLower.includes('has anything') ||
    /\bpending\b/.test(qLower) ||
    qLower.includes('recent') ||
    qLower.includes('lately') ||
    qLower.includes('last few days') ||
    qLower.includes('this week') ||
    /\btrack\b/.test(qLower) ||
    qLower.includes('big payment') ||
    qLower.includes('large payment') ||
    qLower.includes('autopay')
  ) {
    const topUnpaid = unpaidBills.slice(0, 10);
    const topPaid = paidBills.slice(0, 8);
    const topPaidSum = topPaid.reduce((s, b) => s + b.monthlyAverage, 0);
    const otherPaidSum = Math.max(0, paidBillsTotalDollars - topPaidSum);
    const topRecent = recent7DayTxns.slice(0, 8);
    const topRecentSum = topRecent.reduce((s, t) => s + Math.abs(t.amount), 0);
    const pendingSum = pendingTxns.reduce((s, t) => s + Math.abs(t.amount), 0);

    sections.push(
      [
        `### End-of-Month Bill & Cashflow Math (${monthLabel(curMonthKey)} · Day ${curDayOfMonth}/${daysInCurMonth}, ${daysRemainingInMonth}d left)`,
        `| Monthly Bill & Paycheck Math | Status | Amount |`,
        `| --- | --- | --- |`,
        `| Recurring Bills Already Paid | ${paidBills.length} bills cleared | -${usd.format(paidBillsTotalDollars)} |`,
        `| + Unpaid Bills Still Coming | ${unpaidBills.length} bills left this month | -${usd.format(unpaidBillsTotalDollars)} |`,
        `| **= Total Monthly Recurring Bills** | **${paidBills.length + unpaidBills.length} tracked bills** | **-${usd.format(paidBillsTotalDollars + unpaidBillsTotalDollars)}** |`,
        `| Paychecks Received So Far | ${receivedPaychecksCount} deposits landed | +${usd.format(curMonthStats.incomeDollars)} |`,
        `| + Paychecks Still Coming | ${remainingPaychecksCount} deposits left in ${monthLabel(curMonthKey)} | +${usd.format(remainingPaychecksDollars)} |`,
        `| **= Total Expected Month Inflows** | **${receivedPaychecksCount + remainingPaychecksCount} paychecks** | **+${usd.format(curMonthStats.incomeDollars + remainingPaychecksDollars)}** |`,
        ...(topUnpaid.length > 0
          ? [
              '',
              `**⏳ Unpaid Bills Still Coming Up in ${monthLabel(curMonthKey)}:**`,
              `| Unpaid Bill | Category · Expected Date | Est. Amount |`,
              `| --- | --- | --- |`,
              ...topUnpaid.map(
                (b) =>
                  `| **${b.merchantKey}** | ${b.category} · **${b.status.expectedShortLabel || 'This mo'}** (${b.status.countdownText || 'upcoming'}) | -${usd.format(b.monthlyAverage)} |`
              ),
              `| **= Total Unpaid Bills Left** | **${unpaidBills.length} bills remaining** | **-${usd.format(unpaidBillsTotalDollars)}** |`,
            ]
          : [
              '',
              `> ✅ **All ${paidBills.length} tracked recurring bills for ${monthLabel(curMonthKey)} have already cleared!**`,
            ]),
        ...(topPaid.length > 0
          ? [
              '',
              `**✅ Recurring Bills Already Paid in ${monthLabel(curMonthKey)}:**`,
              `| Cleared Bill | Category · Paid Date | Amount |`,
              `| --- | --- | --- |`,
              ...topPaid.map(
                (b) =>
                  `| **${b.merchantKey}** | ${b.category} · ${b.status.countdownText || `Paid ${b.status.lastPaidShortLabel || 'this mo'}`} | -${usd.format(b.monthlyAverage)} |`
              ),
              paidBills.length > topPaid.length
                ? `| + ${paidBills.length - topPaid.length} smaller paid bills | Cleared earlier in ${monthLabel(curMonthKey)} | -${usd.format(otherPaidSum)} |`
                : '',
              `| **= Total Bills Paid So Far** | **${paidBills.length} bills cleared** | **-${usd.format(paidBillsTotalDollars)}** |`,
            ]
          : []),
        ...(topRecent.length > 0
          ? [
              '',
              `**🕒 Recent & Pending Activity (Last 7 Days since ${sevenDaysAgoStr}):**`,
              `| Date · Merchant | Account · Status | Amount |`,
              `| --- | --- | --- |`,
              ...topRecent.map((t) => {
                const accName = (accountById.get(t.accountId)?.name || 'Account').slice(0, 22);
                return `| ${t.date} · **${(t.merchantKey || t.description).slice(0, 22)}** | ${accName}${t.isPending ? ' · **Pending**' : ''} | ${usdCents.format(t.amount)} |`;
              }),
              `| **= Subtotal Shown (Last 7d)** | **${topRecent.length} recent (${pendingTxns.length} pending = ${usdCents.format(pendingSum)})** | **-${usdCents.format(topRecentSum)}** |`,
            ]
          : []),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  // 3. Affordability / "Can I spend $X right now and it not hurt?" / "What-if" Simulator
  if (
    parsedDollarAmount !== null ||
    qLower.includes('afford') ||
    qLower.includes('what if') ||
    qLower.includes('can i buy') ||
    qLower.includes('can i spend') ||
    qLower.includes('safe to spend') ||
    qLower.includes('safely spend') ||
    qLower.includes('not hurt') ||
    qLower.includes('hurt') ||
    qLower.includes('splurge') ||
    qLower.includes('room to spend')
  ) {
    const isRecurringAsk =
      qLower.includes('/mo') ||
      qLower.includes('per month') ||
      qLower.includes('a month') ||
      qLower.includes('monthly');
    const amountToTest = parsedDollarAmount ?? 500;
    const recurringKeysLower = new Set(
      consolidatedRecurring.map((m) => m.merchantKey.toLowerCase())
    );
    const curVariableSpent = curMonthTxns
      .filter((t) => {
        if (t.amount >= 0 || isTransfer(t)) return false;
        if (t.recurrence === 'recurring') return false;
        const mk = (t.merchantKey || '').trim().toLowerCase();
        if (mk && recurringKeysLower.has(mk)) return false;
        const cObj = data.categories.find((c) => c.name === t.category);
        if (cObj?.defaultRecurrence === 'recurring') return false;
        return true;
      })
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const remainingVariableThisMonth = monthlyVariableBaseline - curVariableSpent;
    const variableAfterPurchase = remainingVariableThisMonth - amountToTest;
    const newMonthlySafeRemainder = isRecurringAsk
      ? monthlySafeRemainder - amountToTest
      : monthlySafeRemainder;
    const oneTimeNetAfter = monthlySafeRemainder + remainingVariableThisMonth - amountToTest;
    const remainingVarAllowance = Math.max(0, remainingVariableThisMonth);
    const projectedMonthEndCheckingBefore =
      checkingCashDollars +
      remainingPaychecksDollars -
      unpaidBillsTotalDollars -
      remainingVarAllowance;
    const projectedMonthEndCheckingAfter = projectedMonthEndCheckingBefore - amountToTest;

    let verdict = `✅ **Yes — Spending ${usd.format(amountToTest)} right now will NOT hurt**`;
    if (isRecurringAsk) {
      if (newMonthlySafeRemainder < 0) {
        verdict = `⚠️ **Tight / Over Monthly Safe Remainder** — adding ${usd.format(amountToTest)}/mo would push your monthly safe remainder to **${usd.format(newMonthlySafeRemainder)}/mo**`;
      } else if (newMonthlySafeRemainder < 300) {
        verdict = `🟡 **Manageable, but leaves a thin ${usd.format(newMonthlySafeRemainder)}/mo monthly buffer**`;
      }
    } else {
      if (amountToTest > checkingCashDollars * 0.5 || projectedMonthEndCheckingAfter < 500) {
        verdict = `⚠️ **Caution — Spending ${usd.format(amountToTest)} right now would squeeze your checking buffer (leaving ${usd.format(projectedMonthEndCheckingAfter)} after unpaid bills)**`;
      } else if (oneTimeNetAfter < 0) {
        verdict = `🟡 **Manageable from Checking Cash, but exceeds this month's remaining cashflow by ${usd.format(Math.abs(oneTimeNetAfter))}**`;
      } else if (variableAfterPurchase < 0) {
        verdict = `✅ **Yes — Covered by your ${usd.format(monthlySafeRemainder)}/mo Safe Remainder & ${usd.format(projectedMonthEndCheckingAfter)} Month-End Checking Cushion**`;
      }
    }

    const top3UnpaidSummary =
      unpaidBills.length > 0
        ? unpaidBills
            .slice(0, 3)
            .map((b) => `${b.merchantKey} (${usd.format(b.monthlyAverage)})`)
            .join(', ')
        : 'All bills paid';

    sections.push(
      [
        `### Affordability & Month-End Cushion Math (${usd.format(amountToTest)}${isRecurringAsk ? '/mo' : ' right now'})`,
        `> ${verdict}`,
        '',
        `**1. End-of-Month Checking Cash Equation (${daysRemainingInMonth}d left in ${monthLabel(curMonthKey)}):**`,
        `| Cashflow Step | Details | Math |`,
        `| --- | --- | --- |`,
        `| Starting Checking Cash | Available today (+${usd.format(savingsCashDollars)} in savings) | +${usd.format(checkingCashDollars)} |`,
        `| + Remaining Paychecks | ${remainingPaychecksCount} paycheck${remainingPaychecksCount === 1 ? '' : 's'} left in ${monthLabel(curMonthKey)} | +${usd.format(remainingPaychecksDollars)} |`,
        `| - Unpaid Recurring Bills | ${unpaidBills.length} bills left (${top3UnpaidSummary}) | -${usd.format(unpaidBillsTotalDollars)} |`,
        `| - Remaining Variable Budget | ${usd.format(curVariableSpent)} spent of ${usd.format(monthlyVariableBaseline)} budget | -${usd.format(remainingVarAllowance)} |`,
        `| **= Projected Month-End Cash (Before)** | **Est. balance on ${curMonthKey}-${String(daysInCurMonth).padStart(2, '0')}** | **+${usd.format(projectedMonthEndCheckingBefore)}** |`,
        `| - Proposed Purchase | ${isRecurringAsk ? 'New monthly expense' : 'One-time spend right now'} | -${usd.format(amountToTest)} |`,
        `| **= Projected Month-End Cash (After)** | **Net checking cushion after ${usd.format(amountToTest)}** | **${projectedMonthEndCheckingAfter >= 0 ? '+' : ''}${usd.format(projectedMonthEndCheckingAfter)}** |`,
        '',
        `**2. Monthly Budget & Safe Remainder Waterfall:**`,
        `| Monthly Baseline | Details | Monthly Math |`,
        `| --- | --- | --- |`,
        `| Net Take-Home Income | ${enabledStreams.length} active income stream${enabledStreams.length === 1 ? '' : 's'} | +${usd.format(monthlyNetIncomeBaseline)}/mo |`,
        `| - Fixed Recurring Bills | Mortgage, loans, utilities, insurance | -${usd.format(monthlyRecurringBaseline)}/mo |`,
        `| - Variable Living Budget | ${usd.format(curVariableSpent)} spent so far in ${monthLabel(curMonthKey)} | -${usd.format(monthlyVariableBaseline)}/mo |`,
        `| - Savings & Investments | Automated monthly allocations | -${usd.format(monthlySavingsOutBaseline)}/mo |`,
        `| **= Monthly Safe Remainder** | **Unallocated monthly surplus** | **+${usd.format(monthlySafeRemainder)}/mo** |`,
        `| - Proposed ${usd.format(amountToTest)} Impact | ${isRecurringAsk ? 'Recurring monthly deduction' : 'Absorbed from this month surplus'} | -${usd.format(amountToTest)} |`,
        `| **= Safe Remainder After ${usd.format(amountToTest)}** | **Surplus left this month** | **${monthlySafeRemainder - amountToTest >= 0 ? '+' : ''}${usd.format(monthlySafeRemainder - amountToTest)}** |`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  // 4. Month-over-Month Comparison / "Why is my spending high" / Anomalies
  if (
    qLower.includes('compare') ||
    qLower.includes('last month') ||
    qLower.includes('why') ||
    qLower.includes('high') ||
    qLower.includes('spike') ||
    qLower.includes('change') ||
    qLower.includes('trend') ||
    qLower.includes('unusual') ||
    qLower.includes('anomal')
  ) {
    const spendDelta = curMonthStats.spendDollars - prevMonthStats.spendDollars;
    const incomeDelta = curMonthStats.incomeDollars - prevMonthStats.incomeDollars;
    const netDelta = curMonthStats.netDollars - prevMonthStats.netDollars;
    const allCompCats = new Set([
      ...Array.from(curMonthStats.byCat.keys()),
      ...Array.from(prevMonthStats.byCat.keys()),
    ]);
    const catDeltas = Array.from(allCompCats)
      .map((cat) => {
        const cur = curMonthStats.byCat.get(cat)?.spendCents || 0;
        const prev = prevMonthStats.byCat.get(cat)?.spendCents || 0;
        const avg = trailingAvgByCat.get(cat) || prev;
        return {
          category: cat,
          cur,
          prev,
          avg,
          deltaPrev: cur - prev,
          deltaAvg: cur - avg,
        };
      })
      .sort((a, b) => b.deltaAvg - a.deltaAvg);

    const biggestSpikes = catDeltas.filter((d) => d.deltaAvg > 25 && d.cur > 0).slice(0, 5);
    const biggestDrops = [...catDeltas]
      .sort((a, b) => a.deltaPrev - b.deltaPrev)
      .filter((d) => d.deltaPrev < -25)
      .slice(0, 4);

    const largestCurTxns = [...curMonthTxns]
      .filter((t) => t.amount < 0 && !isTransfer(t))
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 6);
    const largestCurSum = largestCurTxns.reduce((s, t) => s + Math.abs(t.amount), 0);

    sections.push(
      [
        `### Month-over-Month Cashflow Math (${monthLabel(curMonthKey)} vs ${monthLabel(prevMonthKey)})`,
        `| Cashflow Metric | ${monthLabel(curMonthKey)} | ${monthLabel(prevMonthKey)} | Difference |`,
        `| --- | --- | --- | --- |`,
        `| + Total Inflows | +${usd.format(curMonthStats.incomeDollars)} | +${usd.format(prevMonthStats.incomeDollars)} | ${incomeDelta >= 0 ? '+' : ''}${usd.format(incomeDelta)} |`,
        `| - Total Spending | -${usd.format(curMonthStats.spendDollars)} | -${usd.format(prevMonthStats.spendDollars)} | ${spendDelta >= 0 ? '+' : ''}${usd.format(spendDelta)} (${prevMonthStats.spendDollars > 0 ? `${Math.round((spendDelta / prevMonthStats.spendDollars) * 100)}%` : '0%'}) |`,
        `| **= Net Cashflow** | **${curMonthStats.netDollars >= 0 ? '+' : ''}${usd.format(curMonthStats.netDollars)}** | **${prevMonthStats.netDollars >= 0 ? '+' : ''}${usd.format(prevMonthStats.netDollars)}** | **${netDelta >= 0 ? '+' : ''}${usd.format(netDelta)}** |`,
        ...(biggestSpikes.length > 0 || biggestDrops.length > 0
          ? [
              '',
              `**Category Movers (${monthLabel(curMonthKey)} vs ${monthLabel(prevMonthKey)} & 3-Mo Avg):**`,
              `| Category | ${monthLabel(curMonthKey)} | ${monthLabel(prevMonthKey)} | 3-Mo Avg | vs Avg |`,
              `| --- | --- | --- | --- | --- |`,
              ...biggestSpikes.map(
                (d) =>
                  `| 📈 **${d.category}** | ${usd.format(d.cur)} | ${usd.format(d.prev)} | ${usd.format(d.avg)} | +${usd.format(d.deltaAvg)} |`
              ),
              ...biggestDrops.map(
                (d) =>
                  `| 📉 **${d.category}** | ${usd.format(d.cur)} | ${usd.format(d.prev)} | ${usd.format(d.avg)} | ${d.deltaPrev >= 0 ? '+' : ''}${usd.format(d.deltaPrev)} vs Sep |`
              ),
            ]
          : []),
        ...(largestCurTxns.length > 0
          ? [
              '',
              `**Largest Individual Expenses in ${monthLabel(curMonthKey)}:**`,
              `| Date · Merchant | Category | Amount |`,
              `| --- | --- | --- |`,
              ...largestCurTxns.map(
                (t) =>
                  `| ${t.date} · **${(t.merchantKey || t.description).slice(0, 26)}** | ${t.category || 'Uncategorized'} | -${usdCents.format(Math.abs(t.amount))} |`
              ),
              `| **= Top ${largestCurTxns.length} Expenses Subtotal** | **${Math.round((largestCurSum / Math.max(1, curMonthStats.spendDollars)) * 100)}% of ${monthLabel(curMonthKey)} spend** | **-${usdCents.format(largestCurSum)}** |`,
            ]
          : []),
      ].join('\n')
    );
  }

  // 5. Recurring Bills & Subscriptions Section
  if (
    qLower.includes('recurring') ||
    qLower.includes('subscription') ||
    qLower.includes('bill') ||
    qLower.includes('fixed') ||
    qLower.includes('cancel')
  ) {
    const topRec = recurringWithStatus.slice(0, 12);
    const topRecSum = topRec.reduce((s, m) => s + m.monthlyAverage, 0);
    const totalRecMonthly = recurringWithStatus.reduce((s, m) => s + m.monthlyAverage, 0);
    const otherRecMonthly = Math.max(0, totalRecMonthly - topRecSum);

    sections.push(
      [
        `### Recurring Bills & Subscriptions Math (${paidBills.length} paid, ${unpaidBills.length} left in ${monthLabel(curMonthKey)})`,
        `| Recurring Bill | Category · ${monthLabel(curMonthKey)} Status | Monthly |`,
        `| --- | --- | --- |`,
        ...topRec.map(
          (m) =>
            `| **${m.merchantKey}** | ${m.category} · ${m.status.isPaidThisMonth ? `✅ ${m.status.countdownText || 'Paid'}` : `⏳ ${m.status.expectedShortLabel || 'Due'} (${m.status.countdownText || 'unpaid'})`} | -${usd.format(m.monthlyAverage)}/mo |`
        ),
        recurringWithStatus.length > topRec.length
          ? `| + ${recurringWithStatus.length - topRec.length} smaller subscriptions | Combined monthly average | -${usd.format(otherRecMonthly)}/mo |`
          : '',
        `| **= Total Recurring Bills (${recurringWithStatus.length})** | **${usd.format(totalRecMonthly * 12)}/yr (${usd.format(paidBillsTotalDollars)} paid, ${usd.format(unpaidBillsTotalDollars)} left)** | **-${usd.format(totalRecMonthly)}/mo** |`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  // 6. Cutback / How to Save More / Optimization Advice
  if (
    qLower.includes('cut') ||
    qLower.includes('save') ||
    qLower.includes('reduce') ||
    qLower.includes('optimize') ||
    qLower.includes('advice') ||
    qLower.includes('tip') ||
    qLower.includes('waste')
  ) {
    const discretionaryCats = Array.from(periodStats.byCat.entries())
      .filter(([cat]) => {
        const cObj = data.categories.find((c) => c.name === cat);
        return !cObj || cObj.defaultRecurrence !== 'recurring';
      })
      .map(([category, v]) => ({
        category,
        spend: v.spendCents,
        count: v.count,
        avg: trailingAvgByCat.get(category) || v.spendCents,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    const trim20Total = discretionaryCats.reduce((s, c) => s + c.avg * 0.2, 0);

    sections.push(
      [
        `### Monthly Savings Optimization Math (20% Variable Trim)`,
        `| Variable Category | 3-Mo Avg Spend | 20% Monthly Savings | Annual Savings |`,
        `| --- | --- | --- | --- |`,
        ...discretionaryCats.map(
          (c) =>
            `| **${c.category}** | ${usd.format(c.avg)}/mo | +${usd.format(c.avg * 0.2)}/mo | +${usd.format(c.avg * 0.2 * 12)}/yr |`
        ),
        `| **= Extra Savings from 20% Trim** | **Top ${discretionaryCats.length} categories** | **+${usd.format(trim20Total)}/mo** | **+${usd.format(trim20Total * 12)}/yr** |`,
        `| **= New Monthly Safe Remainder** | **${usd.format(monthlySafeRemainder)}/mo base + ${usd.format(trim20Total)}/mo trim** | **+${usd.format(monthlySafeRemainder + trim20Total)}/mo** | **+${usd.format((monthlySafeRemainder + trim20Total) * 12)}/yr** |`,
      ].join('\n')
    );
  }

  // 7. Income & Paycheck Streams Section
  if (
    qLower.includes('income') ||
    qLower.includes('make') ||
    qLower.includes('making') ||
    qLower.includes('earn') ||
    qLower.includes('paycheck') ||
    qLower.includes('salary') ||
    qLower.includes('take home') ||
    qLower.includes('inflow')
  ) {
    const streamReceivedSum = streamSchedules.reduce((s, i) => s + i.schedule.receivedToDate, 0);
    sections.push(
      [
        `### Income & Paycheck Schedule Math (${monthLabel(curMonthKey)})`,
        `| Income Stream | Schedule · Next Payday | Received (${monthLabel(curMonthKey)}) | Still Coming | Monthly Baseline |`,
        `| --- | --- | --- | --- | --- |`,
        ...streamSchedules.map(({ stream: s, schedule: sch }) => {
          const nextDays =
            sch.upcomingDays.length > 0
              ? `Next: ${sch.upcomingDays.map((d) => `${curMonthKey}-${String(d).padStart(2, '0')}`).join(', ')}`
              : `All ${sch.receivedCount} landed`;
          const stillComingAmt = sch.unpaidPaychecks * sch.netPerPaycheck;
          return `| **${s.name}** | ${s.frequency || 'monthly'} (${sch.receivedCount}/${sch.expectedCount}) · ${nextDays} | +${usd.format(sch.receivedToDate)} | +${usd.format(stillComingAmt)} | +${usd.format(s.monthlyAmount)}/mo |`;
        }),
        `| **= Total Payroll Streams** | **${receivedPaychecksCount} received, ${remainingPaychecksCount} remaining** | **+${usd.format(streamReceivedSum)}** | **+${usd.format(remainingPaychecksDollars)}** | **+${usd.format(monthlyNetIncomeBaseline)}/mo** |`,
        `> **Full Month Projection:** **+${usd.format(curMonthStats.incomeDollars)}** total inflows received so far + **+${usd.format(remainingPaychecksDollars)}** remaining paychecks = **+${usd.format(curMonthStats.incomeDollars + remainingPaychecksDollars)}** expected in ${monthLabel(curMonthKey)} (vs **+${usd.format(prevMonthStats.incomeDollars)}** in ${monthLabel(prevMonthKey)}).`,
      ].join('\n')
    );
  }

  // 8. Accounts, Balance Sheet, Net Worth & Loans Section
  if (
    mentionedAccounts.length > 0 ||
    qLower.includes('net worth') ||
    qLower.includes('balance') ||
    qLower.includes('liquid') ||
    qLower.includes('cash') ||
    qLower.includes('checking') ||
    qLower.includes('debt') ||
    qLower.includes('loan') ||
    qLower.includes('mortgage') ||
    qLower.includes('payoff')
  ) {
    const totalAssets = liquidCashDollars + investmentsDollars + propertyVal;
    const loanLines = activeLoans.map((l) => {
      const rMonthly = (l.rate || 0) / 100 / 12;
      const pmt = l.monthlyPayment || 0;
      let payoffNote = '';
      if (l.principal > 0 && pmt > l.principal * rMonthly) {
        const nMonths =
          rMonthly > 0
            ? Math.ceil(-Math.log(1 - (l.principal * rMonthly) / pmt) / Math.log(1 + rMonthly))
            : Math.ceil(l.principal / pmt);
        const nMonthsExtra200 =
          rMonthly > 0
            ? Math.ceil(-Math.log(1 - (l.principal * rMonthly) / (pmt + 200)) / Math.log(1 + rMonthly))
            : Math.ceil(l.principal / (pmt + 200));
        const monthsSaved = Math.max(0, nMonths - nMonthsExtra200);
        payoffNote = `~${nMonths} mos (${(nMonths / 12).toFixed(1)}y) left${monthsSaved > 0 ? ` (+$200/mo saves ${monthsSaved}m)` : ''}`;
      }
      return `| **${l.name}** | ${l.rate}% APR · ${usd.format(pmt)}/mo · ${payoffNote} | -${usd.format(l.principal)} |`;
    });

    sections.push(
      [
        `### Net Worth & Balance Sheet Math`,
        `| Balance Sheet Component | Details | Balance |`,
        `| --- | --- | --- |`,
        `| + Checking Cash | ${activeAccounts.filter((a) => a.type === 'checking').length} checking accounts | +${usd.format(checkingCashDollars)} |`,
        `| + Savings Cash | ${activeAccounts.filter((a) => a.type === 'savings').length} savings accounts | +${usd.format(savingsCashDollars)} |`,
        `| **= Total Liquid Cash** | **Immediate cash cushion** | **+${usd.format(liquidCashDollars)}** |`,
        `| + Investment Accounts | ${activeAccounts.filter((a) => a.type === 'investment').length} retirement/brokerage accounts | +${usd.format(investmentsDollars)} |`,
        propertyVal > 0 ? `| + Real Estate Property | Estimated home value | +${usd.format(propertyVal)} |` : '',
        `| **= Total Assets** | **Cash + Investments${propertyVal > 0 ? ' + Property' : ''}** | **+${usd.format(totalAssets)}** |`,
        `| - Total Liabilities / Debt | Mortgages, auto loans & credit | -${usd.format(totalDebtDollars)} |`,
        `| **= Estimated Net Worth** | **Total Assets minus Total Debt** | **+${usd.format(netWorthDollars)}** |`,
        ...(loanLines.length > 0
          ? [
              '',
              `**Loans & Payoff Math:**`,
              `| Loan | Rate · Payment · Payoff | Principal |`,
              `| --- | --- | --- |`,
              ...loanLines,
              `| **= Total Loan Principal** | **${activeLoans.length} active loans** | **-${usd.format(totalDebtDollars)}** |`,
            ]
          : []),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  // 9. Biggest / Largest Individual Transactions or Top Merchants
  if (
    qLower.includes('biggest') ||
    qLower.includes('largest') ||
    qLower.includes('highest') ||
    qLower.includes('top') ||
    qLower.includes('merchant') ||
    qLower.includes('vendor') ||
    qLower.includes('store')
  ) {
    const topMerchList = Array.from(periodStats.byMerch.entries())
      .sort((a, b) => b[1].spendCents - a[1].spendCents)
      .slice(0, 8);
    const topMerchTotal = topMerchList.reduce((s, [, v]) => s + v.spendCents, 0);
    const largestSingle = [...periodTxns]
      .filter((t) => t.amount < 0 && !isTransfer(t))
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 6);
    const largestSingleTotal = largestSingle.reduce((s, t) => s + Math.abs(t.amount), 0);

    sections.push(
      [
        `### Top Merchants & Largest Expenses Math (${timePeriod.label})`,
        `| Top Merchant | Category · Count | Total Spend |`,
        `| --- | --- | --- |`,
        ...(topMerchList.length > 0
          ? topMerchList.map(
              ([m, v], i) =>
                `| ${i + 1}. **${m}** | ${v.category} · ${v.count} charge${v.count === 1 ? '' : 's'} | -${usd.format(v.spendCents)} |`
            )
          : [`| No merchant spending | — | $0 |`]),
        `| **= Top ${topMerchList.length} Merchants Subtotal** | **${periodStats.spendDollars > 0 ? Math.round((topMerchTotal / periodStats.spendDollars) * 100) : 0}% of period spend** | **-${usd.format(topMerchTotal)}** |`,
        `| **= Total Period Spend** | **All ${periodTxns.length} transactions** | **-${usd.format(periodStats.spendDollars)}** |`,
        ...(largestSingle.length > 0
          ? [
              '',
              `**Largest Single Transactions (${timePeriod.label}):**`,
              `| Date · Merchant | Category | Amount |`,
              `| --- | --- | --- |`,
              ...largestSingle.map(
                (t) =>
                  `| ${t.date} · **${(t.merchantKey || t.description).slice(0, 26)}** | ${t.category || 'Uncategorized'} | -${usdCents.format(Math.abs(t.amount))} |`
              ),
              `| **= Top ${largestSingle.length} Charges Subtotal** | **Single largest expenses** | **-${usdCents.format(largestSingleTotal)}** |`,
            ]
          : []),
      ].join('\n')
    );
  }

  // 10. If no specialized section triggered (or user asked "Where is most of my money going?" / general overview), build full breakdown
  if (sections.length === 0 || qLower.includes('where is') || qLower.includes('money going') || qLower.includes('summary') || qLower.includes('overview')) {
    const sortedCats = Array.from(periodStats.byCat.entries())
      .sort((a, b) => b[1].spendCents - a[1].spendCents);
    const top8Cats = sortedCats.slice(0, 8);
    const top8Sum = top8Cats.reduce((s, [, v]) => s + v.spendCents, 0);
    const otherCatsSum = Math.max(0, periodStats.spendDollars - top8Sum);

    sections.push(
      [
        `### Spending & Cashflow Math (${timePeriod.label})`,
        `| Cashflow Component | Details | Amount |`,
        `| --- | --- | --- |`,
        `| + Total Inflows / Income | Deposits in period | +${usd.format(periodStats.incomeDollars)} |`,
        `| - Total Spending | ${periodTxns.length} transactions | -${usd.format(periodStats.spendDollars)} |`,
        `| **= Net Period Cashflow** | **Inflows minus Spending** | **${periodStats.netDollars >= 0 ? '+' : ''}${usd.format(periodStats.netDollars)}** |`,
        '',
        `**Where Your Money Went (Category Math):**`,
        `| Category | Share · 3-Mo Avg | Spend |`,
        `| --- | --- | --- |`,
        ...top8Cats.map(([cat, v]) => {
          const dollars = v.spendCents;
          const pct = periodStats.spendDollars > 0 ? Math.round((dollars / periodStats.spendDollars) * 100) : 0;
          const avg = trailingAvgByCat.get(cat);
          const avgNote = avg ? ` · Avg ${usd.format(avg)}/mo` : '';
          return `| **${cat}** (${v.count}x) | ${pct}% of spend${avgNote} | -${usd.format(dollars)} |`;
        }),
        sortedCats.length > 8
          ? `| + ${sortedCats.length - 8} smaller categories | ${periodStats.spendDollars > 0 ? Math.round((otherCatsSum / periodStats.spendDollars) * 100) : 0}% of spend | -${usd.format(otherCatsSum)} |`
          : '',
        `| **= Total Spending** | **100% (${periodTxns.length} txns)** | **-${usd.format(periodStats.spendDollars)}** |`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  const synthesizedMarkdownReport = sections.join('\n\n');

  const compactLlmPromptContext = [
    `User Question: "${question}"`,
    `Active Period: ${timePeriod.label} (${timePeriod.startDate} to ${timePeriod.endDate})`,
    `Verified Pre-Computed Financial Analysis:`,
    synthesizedMarkdownReport,
  ].join('\n');

  return {
    question,
    periodLabel: timePeriod.label,
    startDate: timePeriod.startDate,
    endDate: timePeriod.endDate,
    totalSpendDollars: periodStats.spendDollars,
    totalIncomeDollars: periodStats.incomeDollars,
    netCashflowDollars: periodStats.netDollars,
    txCount: periodTxns.length,
    currentMonthLabel: monthLabel(curMonthKey),
    currentMonthSpendDollars: curMonthStats.spendDollars,
    currentMonthIncomeDollars: curMonthStats.incomeDollars,
    lastMonthLabel: monthLabel(prevMonthKey),
    lastMonthSpendDollars: prevMonthStats.spendDollars,
    lastMonthIncomeDollars: prevMonthStats.incomeDollars,
    liquidCashDollars,
    investmentsDollars,
    totalDebtDollars,
    netWorthDollars,
    monthlyNetIncomeBaseline,
    monthlyRecurringBaseline,
    monthlyVariableBaseline,
    monthlySavingsOutBaseline,
    monthlySafeRemainder,
    uncategorizedCount,
    synthesizedMarkdownReport,
    compactLlmPromptContext,
  };
}

/**
 * Generates an answer using Chrome / Edge Built-in AI (Gemini Nano) when available,
 * backed by the pre-computed deep financial analysis so numbers are 100% accurate and detailed.
 */
export async function askBuiltInFinancialAi(params: {
  question: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  data: BuiltInAiFinancialData;
  onChunk: (text: string) => void;
  onDownloadProgress?: (percent: number) => void;
}): Promise<{ text: string; usedBuiltInModel: boolean }> {
  const analysis = await analyzeQuestionAndFinances(params.question, params.data);
  // Immediately render the verified analytical breakdown so the user gets an instant answer
  params.onChunk(analysis.synthesizedMarkdownReport);

  const availability = await checkBuiltInAiAvailability();

  if (availability === 'available') {
    try {
      const systemPrompt = [
        'You are Strictly AI, an insightful personal financial advisor.',
        'Start with a concise 2-3 sentence executive takeaway that directly answers the user question using the exact dollar figures from the Verified Pre-Computed Financial Analysis.',
        'Never invent numbers or contradict the pre-computed analysis.',
      ].join(' ');

      const runWithTimeout = async () => {
        const session = await createBuiltInAiSession(systemPrompt, params.onDownloadProgress);
        try {
          const promptText = [
            analysis.compactLlmPromptContext,
            '\nWrite a 2-3 sentence direct executive answer summarizing the key takeaway and numbers for the user:',
          ].join('\n');

          let aiTakeaway = '';
          await consumeStreamOrPrompt(session, promptText, (partial) => {
            aiTakeaway = partial.trim();
            if (aiTakeaway.length > 0) {
              params.onChunk(`${aiTakeaway}\n\n${analysis.synthesizedMarkdownReport}`);
            }
          });

          if (aiTakeaway.length > 0) {
            const combined = `${aiTakeaway}\n\n${analysis.synthesizedMarkdownReport}`;
            params.onChunk(combined);
            return { text: combined, usedBuiltInModel: true };
          }
        } finally {
          session.destroy?.();
        }
        return null;
      };

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
      const llmRes = await Promise.race([runWithTimeout(), timeoutPromise]);
      if (llmRes) return llmRes;
    } catch {
      // Fall through to rich analytical report below
    }
  }

  params.onChunk(analysis.synthesizedMarkdownReport);
  return { text: analysis.synthesizedMarkdownReport, usedBuiltInModel: false };
}
