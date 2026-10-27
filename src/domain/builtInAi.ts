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

  // Recent 7-day transactions for "Has anything hit?" tracking
  const sevenDaysAgo = new Date(anchor.getTime() - 7 * 86_400_000);
  const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;
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

  // Helper to identify discretionary (non-fixed) categories
  const recurringKeysLower = new Set(
    consolidatedRecurring.map((m) => m.merchantKey.toLowerCase())
  );
  const discretionaryCats = Array.from(curMonthStats.byCat.entries())
    .filter(([cat]) => {
      const cObj = data.categories.find((c) => c.name === cat);
      if (cObj?.defaultRecurrence === 'recurring') return false;
      return !/mortgage|rent|loan|insurance|utilit|tax/i.test(cat);
    })
    .map(([category, v]) => ({
      category,
      spend: v.spendCents,
      count: v.count,
      avg: trailingAvgByCat.get(category) || v.spendCents,
    }))
    .sort((a, b) => b.spend - a.spend);

  const topDiscretionary = discretionaryCats[0];

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

  // Build ONE targeted, punchy roast + compact math table based on primary question intent
  let synthesizedMarkdownReport = '';

  const isAffordOrImpulseAsk =
    parsedDollarAmount !== null ||
    qLower.includes('afford') ||
    qLower.includes('talk me out') ||
    qLower.includes('impulse') ||
    qLower.includes('what if') ||
    qLower.includes('can i buy') ||
    qLower.includes('can i spend') ||
    qLower.includes('not hurt') ||
    qLower.includes('splurge');

  const isUpcomingBillsAsk =
    qLower.includes('coming up') ||
    qLower.includes('upcoming') ||
    qLower.includes('still due') ||
    qLower.includes('left to pay') ||
    qLower.includes('unpaid') ||
    qLower.includes('big payment') ||
    qLower.includes('big bill') ||
    qLower.includes('end of the month') ||
    qLower.includes('end of month');

  const isRecentHitsAsk =
    /\bhit\b/.test(qLower) ||
    qLower.includes('has anything') ||
    qLower.includes('recent') ||
    qLower.includes('lately') ||
    qLower.includes('last few days') ||
    /\bpending\b/.test(qLower);

  const isSubscriptionAsk =
    qLower.includes('subscription') ||
    qLower.includes('recurring') ||
    qLower.includes('autopay') ||
    qLower.includes('draining') ||
    qLower.includes('cancel');

  const isCompareAsk =
    qLower.includes('compare') ||
    qLower.includes('last month') ||
    qLower.includes('spike') ||
    qLower.includes('trend');

  const isDebtOrNetWorthAsk =
    qLower.includes('net worth') ||
    qLower.includes('reality check') ||
    qLower.includes('debt') ||
    qLower.includes('loan') ||
    qLower.includes('mortgage') ||
    qLower.includes('payoff');

  // 1. Affordability / "Talk me out of spending $X"
  if (isAffordOrImpulseAsk) {
    const isRecurringAsk =
      qLower.includes('/mo') ||
      qLower.includes('per month') ||
      qLower.includes('a month') ||
      qLower.includes('monthly');
    const amountToTest = parsedDollarAmount ?? (qLower.includes('impulse') ? 150 : 500);
    const remainingVarAllowance = Math.max(0, monthlyVariableBaseline - curVariableSpent);
    const projectedMonthEndBefore =
      checkingCashDollars +
      remainingPaychecksDollars -
      unpaidBillsTotalDollars -
      remainingVarAllowance;
    const projectedMonthEndAfter = projectedMonthEndBefore - amountToTest;
    const tenYearCost = Math.round(amountToTest * Math.pow(1.08, 10));

    const roastLine =
      projectedMonthEndAfter < 500 || monthlySafeRemainder - amountToTest < 0
        ? `🚨 **Put the card down.** Dropping **${usd.format(amountToTest)}** leaves your checking with **${usd.format(projectedMonthEndAfter)}** after **${usd.format(unpaidBillsTotalDollars)}** in unpaid bills${topDiscretionary ? ` — and you already blew **${usd.format(topDiscretionary.spend)}** on **${topDiscretionary.category}** this month` : ''}.`
        : `🛑 **Your card won't decline, which is the lowest bar in finance.** You still have **${usd.format(unpaidBillsTotalDollars)}** in unpaid bills this month${topDiscretionary ? `, you've already burned **${usd.format(topDiscretionary.spend)}** on **${topDiscretionary.category}**` : ''}, and **${usd.format(amountToTest)}** invested at 8% is **${usd.format(tenYearCost)}** in 10 years. Close the tab.`;

    synthesizedMarkdownReport = [
      `### Reality Check: Spending ${usd.format(amountToTest)}${isRecurringAsk ? '/mo' : ' Right Now'}`,
      `> ${roastLine}`,
      `| Month-End Cash Math | Details | Amount |`,
      `| --- | --- | --- |`,
      `| Checking Cash Today | +${usd.format(savingsCashDollars)} in savings — don't touch it | +${usd.format(checkingCashDollars)} |`,
      `| + Paychecks Left (${monthLabel(curMonthKey)}) | ${remainingPaychecksCount} deposit${remainingPaychecksCount === 1 ? '' : 's'} remaining | +${usd.format(remainingPaychecksDollars)} |`,
      `| - Unpaid Bills & Budget Left | ${unpaidBills.length} bills (${usd.format(unpaidBillsTotalDollars)}) + ${usd.format(remainingVarAllowance)} var left | -${usd.format(unpaidBillsTotalDollars + remainingVarAllowance)} |`,
      `| - This ${usd.format(amountToTest)} Spend | ${isRecurringAsk ? `${usd.format(amountToTest * 12)}/yr drain` : `Costs ${usd.format(tenYearCost)} in 10-yr growth`} | -${usd.format(amountToTest)} |`,
      `| **= Month-End Cash Left** | **After bills & ${usd.format(amountToTest)} spend** | **${projectedMonthEndAfter >= 0 ? '+' : ''}${usd.format(projectedMonthEndAfter)}** |`,
      `- 💡 **Save-It Move:** Transfer **${usd.format(amountToTest)}** to savings right now → worth **${usd.format(tenYearCost)}** in 10 yrs (or knocks **${usd.format(amountToTest)}** off your **${usd.format(totalDebtDollars)}** debt).`,
    ].join('\n');
  }
  // 2. Upcoming Bills ("Are there any big bills coming up?")
  else if (isUpcomingBillsAsk) {
    const topUnpaid = unpaidBills.slice(0, 5);
    const topUnpaidSum = topUnpaid.reduce((s, b) => s + b.monthlyAverage, 0);
    const otherUnpaidSum = Math.max(0, unpaidBillsTotalDollars - topUnpaidSum);
    const freeCheckingAfterBills = checkingCashDollars - unpaidBillsTotalDollars;

    const roastLine =
      unpaidBills.length > 0
        ? `⏳ **Hands off your checking balance — ${usd.format(unpaidBillsTotalDollars)} of it already belongs to your bills.** You have **${unpaidBills.length} unpaid bills** waiting to hit in the next **${daysRemainingInMonth} days**.`
        : `✅ **All ${paidBills.length} bills (${usd.format(paidBillsTotalDollars)}) cleared — which is NOT an invitation to go shopping.** Sweep your surplus into savings before you invent a way to spend it.`;

    synthesizedMarkdownReport = [
      `### Upcoming Bill Reality Check (${daysRemainingInMonth}d left in ${monthLabel(curMonthKey)})`,
      `> ${roastLine}`,
      `| Unpaid Bill | Expected · Status | Amount |`,
      `| --- | --- | --- |`,
      ...(topUnpaid.length > 0
        ? topUnpaid.map(
            (b) =>
              `| **${b.merchantKey}** | ${b.status.expectedShortLabel || 'This mo'} · ${b.status.countdownText || 'upcoming'} | -${usd.format(b.monthlyAverage)} |`
          )
        : paidBills.slice(0, 4).map(
            (b) => `| **${b.merchantKey}** | ✅ Paid this month | -${usd.format(b.monthlyAverage)} |`
          )),
      unpaidBills.length > topUnpaid.length
        ? `| + ${unpaidBills.length - topUnpaid.length} more unpaid bills | Due before month-end | -${usd.format(otherUnpaidSum)} |`
        : '',
      `| **= Total Unpaid Bills Left** | **${ paidBills.length } paid (${usd.format(paidBillsTotalDollars)}), ${unpaidBills.length} left** | **-${usd.format(unpaidBillsTotalDollars)}** |`,
      `- 💡 **True Uncommitted Cash:** Checking (**${usd.format(checkingCashDollars)}**) − Unpaid Bills (**${usd.format(unpaidBillsTotalDollars)}**) = **${usd.format(freeCheckingAfterBills)}**. Keep your wallet shut until month-end.`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  // 3. Recent Charges ("Has anything big hit my accounts lately?")
  else if (isRecentHitsAsk) {
    const recentOutflows = recent7DayTxns.filter((t) => t.amount < 0);
    const recentTotal = recentOutflows.reduce((s, t) => s + Math.abs(t.amount), 0);
    const topRecent = [...recentOutflows].sort((a, b) => a.amount - b.amount).slice(0, 5);
    const topRecentSum = topRecent.reduce((s, t) => s + Math.abs(t.amount), 0);
    const otherRecentSum = Math.max(0, recentTotal - topRecentSum);
    const biggestHit = topRecent[0];

    synthesizedMarkdownReport = [
      `### Last 7 Days Damage Report (Since ${sevenDaysAgoStr})`,
      `> 🚨 **${recentOutflows.length} charges for -${usd.format(recentTotal)} in just 7 days.** Your card barely had time to cool down${biggestHit ? ` — led by **-${usdCents.format(Math.abs(biggestHit.amount))}** at **${(biggestHit.merchantKey || biggestHit.description).slice(0, 24)}**` : ''}.`,
      `| Recent Charge | Category · Account | Amount |`,
      `| --- | --- | --- |`,
      ...(topRecent.length > 0
        ? topRecent.map((t) => {
            const accName = (accountById.get(t.accountId)?.name || 'Account').slice(0, 16);
            return `| ${t.date.slice(5)} · **${(t.merchantKey || t.description).slice(0, 22)}** | ${t.category || 'Uncategorized'} · ${accName}${t.isPending ? ' (Pending)' : ''} | -${usdCents.format(Math.abs(t.amount))} |`;
          })
        : [`| No charges in last 7 days | Miracles happen | $0.00 |`]),
      recentOutflows.length > topRecent.length
        ? `| + ${recentOutflows.length - topRecent.length} smaller swipes | Death by a thousand cuts | -${usdCents.format(otherRecentSum)} |`
        : '',
      `| **= 7-Day Total Burn** | **${recentOutflows.length} charges (${ recent7DayBigCharges.length } over $50)** | **-${usdCents.format(recentTotal)}** |`,
      `- 💡 **No-Spend Challenge:** Do **$0** in non-essential spending for the next 72 hours to stop the bleeding.`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  // 4. Category or Merchant Roast (e.g. "How much did I spend on food & eating out?")
  else if (matchedCategories.size > 0 || keywordMatchedTxns.length > 0) {
    if (matchedCategories.size > 0) {
      const catList = Array.from(matchedCategories);
      let combinedSpend = 0;
      let combinedTrailingAvg = 0;
      let combinedTxCount = 0;
      const combinedTxns: Transaction[] = [];

      for (const cName of catList) {
        const pStat = periodStats.byCat.get(cName);
        const pSpend = pStat ? pStat.spendCents : 0;
        combinedSpend += pSpend;
        combinedTrailingAvg += trailingAvgByCat.get(cName) || 0;
        combinedTxCount += pStat ? pStat.count : 0;
        if (pStat) combinedTxns.push(...pStat.txns);
      }

      const merchInCats = new Map<string, { spendCents: number; count: number }>();
      for (const t of combinedTxns) {
        const mk = (t.merchantKey || t.description || 'Unknown').trim();
        const prev = merchInCats.get(mk) || { spendCents: 0, count: 0 };
        prev.spendCents += Math.abs(t.amount);
        prev.count += 1;
        merchInCats.set(mk, prev);
      }
      const topMerch = Array.from(merchInCats.entries())
        .sort((a, b) => b[1].spendCents - a[1].spendCents)
        .slice(0, 4);
      const topMerchSum = topMerch.reduce((s, [, v]) => s + v.spendCents, 0);
      const otherMerchSum = Math.max(0, combinedSpend - topMerchSum);
      const monthlyRate = Math.max(combinedSpend, combinedTrailingAvg);
      const annualBurn = monthlyRate * 12;
      const halfCutTenYr = Math.round((annualBurn * 0.5) * 14.48);

      synthesizedMarkdownReport = [
        `### ${catList.join(' + ')} Reality Check (${timePeriod.label})`,
        `> 🔥 **-${usd.format(combinedSpend)} across ${combinedTxCount} swipes — you're pacing a -${usd.format(annualBurn)}/yr habit.** ${topMerch[0] ? `You're practically paying rent at **${topMerch[0][0]}** (${usd.format(topMerch[0][1].spendCents)}). ` : ''}Cut this in half and keep **+${usd.format(annualBurn / 2)}/yr** in your own pocket.`,
        `| Top Culprit | Swipes · Avg Ticket | Total Burn |`,
        `| --- | --- | --- |`,
        ...(topMerch.length > 0
          ? topMerch.map(
              ([m, v]) =>
                `| **${m}** | ${v.count}x (avg ${usd.format(v.spendCents / v.count)}) | -${usd.format(v.spendCents)} |`
            )
          : [`| No charges in period | Keep it that way | $0 |`]),
        otherMerchSum > 1
          ? `| + Other ${catList[0]} spots | ${Math.max(0, combinedTxCount - topMerch.reduce((s, [, v]) => s + v.count, 0))} swipes | -${usd.format(otherMerchSum)} |`
          : '',
        `| **= Total ${catList.join(' + ')}** | **3-Mo Avg: ${usd.format(combinedTrailingAvg)}/mo** | **-${usd.format(combinedSpend)}** |`,
        `- 💡 **Compound Wake-Up Call:** Trimming 50% here saves **+${usd.format(monthlyRate / 2)}/mo** — worth **+${usd.format(halfCutTenYr)}** invested over 10 years.`,
      ]
        .filter(Boolean)
        .join('\n');
    } else {
      const spendTxns = keywordMatchedTxns.filter((t) => t.amount < 0);
      const totalMatchSpend = spendTxns.reduce((s, t) => s + Math.abs(t.amount), 0);
      const shown = [...spendTxns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
      const shownSum = shown.reduce((s, t) => s + Math.abs(t.amount), 0);
      const kwLabel = specificMerchantKeywords.join(' ');

      synthesizedMarkdownReport = [
        `### Merchant Audit: "${kwLabel}"`,
        `> 🔥 **You've handed "${kwLabel}" -${usdCents.format(totalMatchSpend)} across ${spendTxns.length} charges.** Imagine if you funded your brokerage account with that same loyalty.`,
        `| Date · Merchant | Category | Amount |`,
        `| --- | --- | --- |`,
        ...shown.map(
          (t) => `| ${t.date} · **${(t.merchantKey || t.description).slice(0, 24)}** | ${t.category || 'Uncategorized'} | -${usdCents.format(Math.abs(t.amount))} |`
        ),
        spendTxns.length > shown.length
          ? `| + ${spendTxns.length - shown.length} older charges | Historical burn | -${usdCents.format(Math.max(0, totalMatchSpend - shownSum))} |`
          : '',
        `| **= Total "${kwLabel}" Spend** | **${spendTxns.length} charges total** | **-${usdCents.format(totalMatchSpend)}** |`,
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
  // 5. Subscriptions & Recurring Drains
  else if (isSubscriptionAsk) {
    const nonLoanRec = recurringWithStatus.filter(
      (m) => !/mortgage|loan|rent/i.test(`${m.category} ${m.merchantKey}`)
    );
    const listToShow = (nonLoanRec.length > 0 ? nonLoanRec : recurringWithStatus).slice(0, 5);
    const listSum = listToShow.reduce((s, m) => s + m.monthlyAverage, 0);
    const totalRecMonthly = recurringWithStatus.reduce((s, m) => s + m.monthlyAverage, 0);
    const otherRec = Math.max(0, totalRecMonthly - listSum);

    synthesizedMarkdownReport = [
      `### Subscription & Autopay Drain Audit`,
      `> 🧛 **${recurringWithStatus.length} recurring charges quietly siphon -${usd.format(totalRecMonthly)}/mo (-${usd.format(totalRecMonthly * 12)}/yr) before you even buy coffee.** Cancel two things you barely use and give yourself an instant raise.`,
      `| Recurring Drain | Category · ${monthLabel(curMonthKey)} Status | Monthly |`,
      `| --- | --- | --- |`,
      ...listToShow.map(
        (m) =>
          `| **${m.merchantKey}** | ${m.category} · ${m.status.isPaidThisMonth ? '✅ Paid' : `⏳ ${m.status.expectedShortLabel || 'Due'}`} | -${usd.format(m.monthlyAverage)}/mo |`
      ),
      recurringWithStatus.length > listToShow.length
        ? `| + ${recurringWithStatus.length - listToShow.length} other fixed bills | Includes housing/loans | -${usd.format(otherRec)}/mo |`
        : '',
      `| **= Total Autopay Drain** | **-${usd.format(totalRecMonthly * 12)}/yr on autopilot** | **-${usd.format(totalRecMonthly)}/mo** |`,
      `- 💡 **10-Minute Fix:** Cancel just **$50/mo** of recurring bloat → **+$600/yr** saved (**+$8,690** in 10 yrs at 8%).`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  // 6. Month-over-Month Comparison
  else if (isCompareAsk) {
    const spendDelta = curMonthStats.spendDollars - prevMonthStats.spendDollars;
    const allCompCats = new Set([
      ...Array.from(curMonthStats.byCat.keys()),
      ...Array.from(prevMonthStats.byCat.keys()),
    ]);
    const topSpikes = Array.from(allCompCats)
      .map((cat) => {
        const cur = curMonthStats.byCat.get(cat)?.spendCents || 0;
        const prev = prevMonthStats.byCat.get(cat)?.spendCents || 0;
        return { category: cat, cur, prev, delta: cur - prev };
      })
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);

    const roastLine =
      spendDelta > 0
        ? `📈 **You've already spent +${usd.format(spendDelta)} MORE than ${monthLabel(prevMonthKey)} — wrong direction.** ${topSpikes[0] && topSpikes[0].delta > 0 ? `**${topSpikes[0].category}** jumped **+${usd.format(topSpikes[0].delta)}**. ` : ''}Lock your wallet for the next **${daysRemainingInMonth} days**.`
        : `📉 **You're ${usd.format(Math.abs(spendDelta))} below ${monthLabel(prevMonthKey)} so far — DO NOT blow it on a "treat yourself" purchase.** Transfer that **+${usd.format(Math.abs(spendDelta))}** win straight to savings today.`;

    synthesizedMarkdownReport = [
      `### ${monthLabel(curMonthKey)} vs. ${monthLabel(prevMonthKey)} Showdown`,
      `> ${roastLine}`,
      `| Metric / Category Spike | ${monthLabel(curMonthKey)} | ${monthLabel(prevMonthKey)} | Change |`,
      `| --- | --- | --- | --- |`,
      `| Total Spending | -${usd.format(curMonthStats.spendDollars)} | -${usd.format(prevMonthStats.spendDollars)} | ${spendDelta >= 0 ? '+' : ''}${usd.format(spendDelta)} |`,
      ...topSpikes
        .filter((s) => s.cur > 0 || s.prev > 0)
        .map(
          (s) =>
            `| ${s.delta > 0 ? '🚨' : '✅'} **${s.category}** | -${usd.format(s.cur)} | -${usd.format(s.prev)} | ${s.delta >= 0 ? '+' : ''}${usd.format(s.delta)} |`
        ),
      `| **= Net Cashflow Kept** | **${curMonthStats.netDollars >= 0 ? '+' : ''}${usd.format(curMonthStats.netDollars)}** | **${prevMonthStats.netDollars >= 0 ? '+' : ''}${usd.format(prevMonthStats.netDollars)}** | **${curMonthStats.netDollars - prevMonthStats.netDollars >= 0 ? '+' : ''}${usd.format(curMonthStats.netDollars - prevMonthStats.netDollars)}** |`,
    ].join('\n');
  }
  // 7. Debt vs Liquid Cash / Net Worth Reality Check
  else if (isDebtOrNetWorthAsk) {
    const totalAssets = liquidCashDollars + investmentsDollars + propertyVal;
    const topLoan = activeLoans[0];

    synthesizedMarkdownReport = [
      `### Debt vs. Cash Reality Check`,
      `> 🏦 **You're carrying -${usd.format(totalDebtDollars)} in debt while sitting on ${usd.format(liquidCashDollars)} in cash.** Every dollar you spend on forgettable stuff is a dollar that isn't killing interest or compounding your **${usd.format(netWorthDollars)}** net worth.`,
      `| Balance Sheet Line | Reality Check | Balance |`,
      `| --- | --- | --- |`,
      `| + Liquid Cash | Checking (${usd.format(checkingCashDollars)}) + Savings (${usd.format(savingsCashDollars)}) | +${usd.format(liquidCashDollars)} |`,
      `| + Investments & Property | Long-term wealth engine | +${usd.format(investmentsDollars + propertyVal)} |`,
      `| - Total Debt Drag | ${activeLoans.length} loans${topLoan ? ` (led by ${topLoan.name} @ ${topLoan.rate}%)` : ''} | -${usd.format(totalDebtDollars)} |`,
      `| **= True Net Worth** | **Assets (${usd.format(totalAssets)}) − Debt** | **+${usd.format(netWorthDollars)}** |`,
      `- 💡 **Payoff Power:** Throwing an extra **$250/mo** at principal instead of impulse buys shaves months off your debt and saves thousands in interest.`,
    ].join('\n');
  }
  // 8. Default: Roast My Spending & Show Where to Cut Back & Save
  else {
    const top4Disc = discretionaryCats.slice(0, 4);
    const discTotal = top4Disc.reduce((s, c) => s + c.avg, 0);
    const cut30Monthly = Math.round(discTotal * 0.3);
    const cut30Annual = cut30Monthly * 12;
    const cut30TenYr = Math.round(cut30Annual * 14.48);

    synthesizedMarkdownReport = [
      `### Roast & Savings Audit (${monthLabel(curMonthKey)})`,
      `> 🔥 **You say you want to save more, yet your top 4 discretionary habits burn -${usd.format(discTotal)}/mo (-${usd.format(discTotal * 12)}/yr).** Cut 30% of the fluff below and you instantly keep **+${usd.format(cut30Monthly)}/mo (+${usd.format(cut30Annual)}/yr)**.
`,
      `| Leak Category | Monthly Burn | 30% Cut Saves |`,
      `| --- | --- | --- |`,
      ...top4Disc.map(
        (c) =>
          `| **${c.category}** (${c.count} swipes) | -${usd.format(c.avg)}/mo | +${usd.format(Math.round(c.avg * 0.3))}/mo |`
      ),
      `| **= Instant Savings Unlocked** | **+${usd.format(cut30Annual)}/yr (${usd.format(cut30TenYr)} in 10y)** | **+${usd.format(cut30Monthly)}/mo** |`,
      `- 💡 **Bottom Line:** Your monthly safe remainder jumps from **+${usd.format(monthlySafeRemainder)}/mo** to **+${usd.format(monthlySafeRemainder + cut30Monthly)}/mo** the moment you stop swiping out of boredom.`,
    ].join('\n');
  }

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
        'You are Strictly AI, a witty, tough-love personal financial coach who roasts the user into saving money instead of spending it.',
        'Write a single punchy 1-2 sentence roast using the exact dollar figures from the Verified Pre-Computed Financial Analysis to convince them to keep their wallet closed.',
        'Never invent numbers or contradict the pre-computed analysis.',
      ].join(' ');

      const runWithTimeout = async () => {
        const session = await createBuiltInAiSession(systemPrompt, params.onDownloadProgress);
        try {
          const promptText = [
            analysis.compactLlmPromptContext,
            '\nWrite a 1-2 sentence witty tough-love roast using these exact numbers to convince the user to save instead of spend:',
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
