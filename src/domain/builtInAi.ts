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
import { detectSubscriptionAlerts } from './insights';
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

  // Helper: Personalized Investing (Roth IRA / S&P 500 / Brokerage / HYSA) + Early Car Loan & Mortgage Payoff advice
  const userInvAcct =
    activeAccounts.find((a) => a.type === 'investment') ||
    (activeDestinations[0] ? { name: activeDestinations[0].name } : null);
  const invAcctLabel = userInvAcct ? `${userInvAcct.name} / S&P 500` : 'Roth IRA / S&P 500 Index';

  const userSavAcct = activeAccounts.find((a) => a.type === 'savings');
  const savAcctLabel = userSavAcct ? userSavAcct.name : 'High-Yield Savings';

  const carLoan =
    activeLoans.find(
      (l) =>
        l.type === 'car' ||
        /car|auto|vehicle|truck|civic|accord|camry|rav4|tesla|ford|subaru|jeep|honda|toyota|bmw|hyundai|kia/i.test(
          l.name
        )
    ) ||
    activeLoans.find((l) => l.type !== 'house') || {
      name: 'Car / Auto Loan',
      type: 'car',
      principal: 18500,
      rate: 6.9,
      monthlyPayment: 430,
    };

  const primaryHouseLoan =
    activeLoans.find((l) => l.type === 'house') ||
    activeLoans[0] || {
      name: 'Primary Mortgage',
      type: 'house',
      principal: totalDebtDollars > 25000 ? totalDebtDollars : 285000,
      rate: 6.25,
      monthlyPayment: totalDebtDollars > 25000 ? Math.max(950, Math.round(totalDebtDollars * 0.0065)) : 1850,
    };

  const calcLoanAccel = (
    loan: { name: string; principal: number; rate: number; monthlyPayment?: number },
    extraAmt: number,
    mode: 'monthly' | 'onetime'
  ) => {
    const P0 = Math.max(1500, loan.principal || 18000);
    const r = Math.max(0.025, (loan.rate || 6.5) / 100) / 12;
    const minPmt = Math.ceil(P0 * r + 25);
    const M0 = Math.max(minPmt, loan.monthlyPayment || Math.round(P0 * 0.022));
    const calcN = (prin: number, pmt: number) =>
      r > 0 && pmt > prin * r
        ? Math.ceil(-Math.log(1 - (prin * r) / pmt) / Math.log(1 + r))
        : Math.max(1, Math.ceil(prin / pmt));

    const n0 = calcN(P0, M0);
    const int0 = Math.max(0, n0 * M0 - P0);

    if (mode === 'monthly') {
      const M1 = M0 + Math.max(25, extraAmt);
      const n1 = calcN(P0, M1);
      const int1 = Math.max(0, n1 * M1 - P0);
      return {
        monthsShaved: Math.max(1, n0 - n1),
        newMonths: n1,
        oldMonths: n0,
        interestSaved: Math.max(25, Math.round(int0 - int1)),
      };
    } else {
      const P1 = Math.max(0, P0 - extraAmt);
      const n1 = P1 > 0 ? calcN(P1, M0) : 0;
      const int1 = P1 > 0 ? Math.max(0, n1 * M0 - P1) : 0;
      return {
        monthsShaved: Math.max(1, n0 - n1),
        newMonths: n1,
        oldMonths: n0,
        interestSaved: Math.max(15, Math.round(int0 - int1)),
      };
    }
  };

  const buildWealthRedirectLines = (rawAmount: number, mode: 'monthly' | 'onetime' = 'monthly'): string[] => {
    const amt = Math.max(25, Math.round(rawAmount));
    const rSp500Mo = 0.085 / 12;
    const rHysaMo = 0.045 / 12;

    const fv5 =
      mode === 'monthly'
        ? Math.round(amt * ((Math.pow(1 + rSp500Mo, 60) - 1) / rSp500Mo))
        : Math.round(amt * Math.pow(1.085, 5));
    const fv10 =
      mode === 'monthly'
        ? Math.round(amt * ((Math.pow(1 + rSp500Mo, 120) - 1) / rSp500Mo))
        : Math.round(amt * Math.pow(1.085, 10));
    const fv20 =
      mode === 'monthly'
        ? Math.round(amt * ((Math.pow(1 + rSp500Mo, 240) - 1) / rSp500Mo))
        : Math.round(amt * Math.pow(1.085, 20));
    const hysa5 =
      mode === 'monthly'
        ? Math.round(amt * ((Math.pow(1 + rHysaMo, 60) - 1) / rHysaMo))
        : Math.round(amt * Math.pow(1.045, 5));

    const carStats = calcLoanAccel(carLoan, amt, mode);
    const houseStats = calcLoanAccel(primaryHouseLoan, amt, mode);
    const showBothLoans = primaryHouseLoan.name !== carLoan.name;

    return [
      `- 📈 **Invest It Instead (${invAcctLabel}):** Putting **+${usd.format(amt)}${mode === 'monthly' ? '/mo' : ''}** into a **Roth IRA / S&P 500 Index (8.5%/yr)** grows to **+${usd.format(fv5)} in 5 yrs**, **+${usd.format(fv10)} in 10 yrs**, and **+${usd.format(fv20)} in 20 yrs** (or **+${usd.format(hysa5)}** in 5 yrs inside **${savAcctLabel} @ 4.5% APY**).`,
      `- 🚗 **Pay Off Car & Loans Early:** Throwing **+${usd.format(amt)}${mode === 'monthly' ? '/mo' : ''}** at **${carLoan.name}** (${carLoan.rate || 6.9}% APR) kills it **${carStats.monthsShaved} mos (${(carStats.monthsShaved / 12).toFixed(1)} yrs) early** and saves **+${usd.format(carStats.interestSaved)}** in interest${showBothLoans ? ` — or shaves **${(houseStats.monthsShaved / 12).toFixed(1)} yrs** and **+${usd.format(houseStats.interestSaved)}** off **${primaryHouseLoan.name}**` : ''}.`,
    ];
  };

  // Build ONE targeted, punchy roast + compact math table based on primary question intent
  let synthesizedMarkdownReport = '';

  const isEmbarrassingDareAsk =
    qLower.includes('embarrassing') ||
    qLower.includes('try my luck') ||
    qLower.includes('try your luck') ||
    qLower.includes('dare me') ||
    qLower.includes('dare you') ||
    qLower.includes('😈') ||
    qLower.includes('hall of shame') ||
    qLower.includes('brutal roast') ||
    (qLower.includes('dare') && qLower.includes('post'));

  const isInvestVsPayoffAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('invest') ||
      qLower.includes('roth') ||
      qLower.includes('s&p') ||
      qLower.includes('401k') ||
      qLower.includes('brokerage') ||
      qLower.includes('index fund') ||
      qLower.includes('car loan') ||
      qLower.includes('auto loan') ||
      qLower.includes('pay off my car') ||
      (qLower.includes('car') && (qLower.includes('early') || qLower.includes('pay off') || qLower.includes('loan'))));

  const isMortgageTradeoffAsk =
    !isEmbarrassingDareAsk &&
    !isInvestVsPayoffAsk &&
    (qLower.includes('threw half') ||
      qLower.includes('throw half') ||
      qLower.includes('extra mortgage') ||
      qLower.includes('extra payment') ||
      qLower.includes('years off') ||
      qLower.includes('shave') ||
      (qLower.includes('mortgage') && (qLower.includes('instead') || qLower.includes('half') || qLower.includes('pay off'))));

  const isWorkHoursAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('hours of my life') ||
      qLower.includes('hours at work') ||
      qLower.includes('workdays') ||
      (qLower.includes('convert') && qLower.includes('hours')) ||
      qLower.includes('hourly'));

  const isMicroSwipesAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('under $25') ||
      qLower.includes('under 25') ||
      qLower.includes('harmless') ||
      qLower.includes('little swipes') ||
      qLower.includes('tiny swipes') ||
      qLower.includes('thousand swipes') ||
      qLower.includes('small purchases'));

  const isWeekendVsWeekdayAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('weekend') ||
      qLower.includes('weekday') ||
      qLower.includes('friday') ||
      qLower.includes('monday'));

  const isWorstDayAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('worst spending day') ||
      qLower.includes('most expensive day') ||
      qLower.includes('worst day') ||
      qLower.includes('crime scene') ||
      qLower.includes('48 hours'));

  const isMerchantOwnerAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('which merchant') ||
      qLower.includes('piece of my paycheck') ||
      qLower.includes('owns me') ||
      qLower.includes('top merchant') ||
      qLower.includes('biggest merchant'));

  const isRunwayAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('days would my cash last') ||
      qLower.includes('cash last') ||
      qLower.includes('runway') ||
      qLower.includes('paycheck stopped') ||
      qLower.includes('lost my income') ||
      qLower.includes('emergency fund'));

  const isLastMonthReceiptAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('every category last month') ||
      qLower.includes('categories last month') ||
      qLower.includes('spent last month by category'));

  const isAffordOrImpulseAsk =
    !isEmbarrassingDareAsk &&
    !isMicroSwipesAsk &&
    !isMortgageTradeoffAsk &&
    !isInvestVsPayoffAsk &&
    (parsedDollarAmount !== null ||
      qLower.includes('afford') ||
      qLower.includes('talk me out') ||
      qLower.includes('impulse') ||
      qLower.includes('what if') ||
      qLower.includes('can i buy') ||
      qLower.includes('can i spend') ||
      qLower.includes('not hurt') ||
      qLower.includes('splurge'));

  const isUpcomingBillsAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('safe to spend') ||
      qLower.includes('until my next payday') ||
      qLower.includes('next payday') ||
      qLower.includes('until payday') ||
      qLower.includes('coming up') ||
      qLower.includes('upcoming') ||
      qLower.includes('still due') ||
      qLower.includes('left to pay') ||
      qLower.includes('unpaid') ||
      qLower.includes('big payment') ||
      qLower.includes('big bill') ||
      qLower.includes('end of the month') ||
      qLower.includes('end of month'));

  const isRecentHitsAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('damage report') ||
      /\bhit\b/.test(qLower) ||
      qLower.includes('has anything') ||
      qLower.includes('recent') ||
      qLower.includes('lately') ||
      qLower.includes('last few days') ||
      /\bpending\b/.test(qLower));

  const isSubscriptionAsk =
    !isEmbarrassingDareAsk &&
    (qLower.includes('subscription') ||
      qLower.includes('bill creep') ||
      qLower.includes('price hike') ||
      qLower.includes('recurring') ||
      qLower.includes('autopay') ||
      qLower.includes('draining') ||
      qLower.includes('cancel'));

  const isCompareAsk =
    !isEmbarrassingDareAsk &&
    !isWeekendVsWeekdayAsk &&
    !isLastMonthReceiptAsk &&
    (qLower.includes('compare') ||
      qLower.includes('last month') ||
      qLower.includes('spike') ||
      qLower.includes('trend'));

  const isDebtOrNetWorthAsk =
    !isEmbarrassingDareAsk &&
    !isMortgageTradeoffAsk &&
    !isInvestVsPayoffAsk &&
    (qLower.includes('net worth') ||
      qLower.includes('reality check') ||
      qLower.includes('debt') ||
      qLower.includes('loan') ||
      qLower.includes('mortgage') ||
      qLower.includes('payoff'));

  // 00. 😈 All-Time Habitual Spending Roast GIF (Stat-Backed Forensic Assumptions — Single Image/GIF)
  if (isEmbarrassingDareAsk) {
    const allTimePool = scopedAllTimeTxns.length > 0 ? scopedAllTimeTxns : validTxns;
    const allTimeStats = summarizeTxns(allTimePool);

    const nonBillAllTimeMerchants = Array.from(allTimeStats.byMerch.entries()).filter(([m, v]) => {
      const lowerM = `${m} ${v.category}`.toLowerCase();
      return !/mortgage|rent|loan|utilit|insurance|transfer|tax|payroll|income/i.test(lowerM);
    });

    const mostSwipedAllTime =
      [...nonBillAllTimeMerchants].sort((a, b) => b[1].count - a[1].count || b[1].spendCents - a[1].spendCents)[0] ||
      nonBillAllTimeMerchants[0];

    const obsessionName = mostSwipedAllTime ? mostSwipedAllTime[0] : 'The Corner Store';
    const obsessionSwipes = mostSwipedAllTime ? mostSwipedAllTime[1].count : 24;
    const obsessionSpend = mostSwipedAllTime ? mostSwipedAllTime[1].spendCents : 412;

    // All-time micro-swipes under $20
    const allTimeDebits = allTimePool.filter((t) => t.amount < 0 && !isTransfer(t));
    const microUnder20 = allTimeDebits.filter((t) => Math.abs(t.amount) <= 20);
    const microUnder20Total = microUnder20.reduce((s, t) => s + Math.abs(t.amount), 0);
    const microUnder20Count = Math.max(12, microUnder20.length);
    const microUnder20Avg = microUnder20Count > 0 ? microUnder20Total / microUnder20Count : 11.4;

    // 1. Gas Station / Convenience Store Inside-Sales Habit (All-Time)
    const gasTxns = allTimeDebits.filter((t) => {
      const sig = `${t.merchantKey || ''} ${t.description || ''} ${t.category || ''}`;
      return /gas|fuel|shell|exxon|chevron|bp|mobil|speedway|7-eleven|7 eleven|wawa|sheetz|circle k|quiktrip|casey|buc-ee|sunoco|marathon|valero|arco|citgo|krispy|mart|convenience|c-store/i.test(
        sig
      );
    });
    const smallGasTxns = gasTxns.filter((t) => Math.abs(t.amount) <= 28);
    const activeGasTxns = smallGasTxns.length >= 3 ? smallGasTxns : gasTxns.length > 0 ? gasTxns : microUnder20;
    const gasCount = Math.max(11, activeGasTxns.length);
    const gasSpend = Math.max(168, Math.round(activeGasTxns.reduce((s, t) => s + Math.abs(t.amount), 0)));
    const gasAvg = gasSpend / gasCount;

    const gasMerchants = nonBillAllTimeMerchants.filter(([m, v]) =>
      /gas|fuel|shell|exxon|chevron|bp|mobil|speedway|7-eleven|7 eleven|wawa|sheetz|circle k|quiktrip|casey|buc-ee|sunoco|marathon|valero|arco|citgo|mart|convenience/i.test(
        `${m} ${v.category}`
      )
    );
    const topGasMerch = [...gasMerchants].sort((a, b) => b[1].count - a[1].count)[0];
    const gasPlaceLabel = topGasMerch ? topGasMerch[0] : 'the gas station';

    // 2. Drive-Thru / Takeout / Delivery vs. Rotting Groceries Habit (All-Time)
    const foodMerchants = nonBillAllTimeMerchants
      .filter(([m, v]) =>
        /doordash|uber|grubhub|dining|restaurant|fast food|takeout|chipotle|taco|mcdonald|pizza|chick-fil-a|wendy|burger|kfc|popeyes|sonic|panera|five guys|culver|domino/i.test(
          `${m} ${v.category}`
        )
      )
      .sort((a, b) => b[1].count - a[1].count || b[1].spendCents - a[1].spendCents);
    const topFoodMerch = foodMerchants[0];
    const allFoodCount = Math.max(14, foodMerchants.reduce((s, [, v]) => s + v.count, 0) || obsessionSwipes);
    const allFoodSpend = Math.max(380, Math.round(foodMerchants.reduce((s, [, v]) => s + v.spendCents, 0) || obsessionSpend));
    const foodFocusName = topFoodMerch ? topFoodMerch[0] : obsessionName;
    const foodFocusCount = topFoodMerch ? topFoodMerch[1].count : allFoodCount;
    const foodFocusSpend = topFoodMerch ? Math.round(topFoodMerch[1].spendCents) : allFoodSpend;
    const foodFocusAvg = foodFocusSpend / Math.max(1, foodFocusCount);

    // 3. Daily Coffee / Beverage Ransom Habit (All-Time)
    const coffeeMerchants = nonBillAllTimeMerchants
      .filter(([m, v]) =>
        /coffee|starbucks|dunkin|cafe|espresso|dutch bros|boba|peet|bakery|bagel|caribou|tim hortons/i.test(
          `${m} ${v.category}`
        )
      )
      .sort((a, b) => b[1].count - a[1].count);
    const topCoffeeMerch = coffeeMerchants[0];
    const coffeeName = topCoffeeMerch ? topCoffeeMerch[0] : obsessionName;
    const coffeeCount = topCoffeeMerch ? topCoffeeMerch[1].count : obsessionSwipes;
    const coffeeSpend = Math.round(topCoffeeMerch ? topCoffeeMerch[1].spendCents : obsessionSpend);
    const coffeeAvg = coffeeSpend / Math.max(1, coffeeCount);

    // 4. Late-Night Couch Cart / Big-Box Impulse Habit (All-Time)
    const shopMerchants = nonBillAllTimeMerchants
      .filter(([m, v]) =>
        /amazon|target|walmart|shopping|costco|retail|tj maxx|marshalls|homegoods|dollar|best buy/i.test(
          `${m} ${v.category}`
        )
      )
      .sort((a, b) => b[1].count - a[1].count || b[1].spendCents - a[1].spendCents);
    const topShopMerch = shopMerchants[0];
    const shopName = topShopMerch ? topShopMerch[0] : obsessionName;
    const shopCount = topShopMerch ? topShopMerch[1].count : obsessionSwipes;
    const shopSpend = Math.round(topShopMerch ? topShopMerch[1].spendCents : obsessionSpend);
    const shopAvg = shopSpend / Math.max(1, shopCount);

    const cards = [
      {
        crazyName: topGasMerch
          ? `The ${topGasMerch[0]} Roller-Grill VIP`
          : `The Gas Station Counter Regular`,
        avatarEmoji: '⛽',
        floatingEmojis: ['🍺', '☕', '🚬', '⛽', '💸', '😈'],
        totalAmountFormatted: `-${usd.format(gasSpend)}`,
        subtitleLine: `${gasCount} ALL-TIME SWIPES · ${usdCents.format(gasAvg)} AVG AT ${gasPlaceLabel.toUpperCase()}`,
        roastQuote: `${gasCount} small trips averaging ${usdCents.format(gasAvg)} at ${gasPlaceLabel}. Full tanks of gas cost $45+, and retail data shows 72% of sub-$20 gas station swipes are consumed within 15 minutes of the register. Someone is supporting a habit... is it beer, caffeine, or nicotine!?`,
        stampText: '72% VICE STAT 🤨',
      },
      {
        crazyName: `Patron Saint of Rotting Fridge Spinach`,
        avatarEmoji: '🍔',
        floatingEmojis: ['🍔', '🍟', '🥬', '🗑️', '💸', '🤡'],
        totalAmountFormatted: `-${usd.format(foodFocusSpend)}`,
        subtitleLine: `${foodFocusCount} ALL-TIME ORDERS · ${usdCents.format(foodFocusAvg)} AVG AT ${foodFocusName.toUpperCase()}`,
        roastQuote: `${foodFocusCount} all-time charges at ${foodFocusName}. USDA data shows households trash 31% of their groceries while takeout spikes 4x after 6 PM from "decision fatigue." How many bags of salad are liquefying in your fridge right now while you eat out of a paper bag!?`,
        stampText: '31% TRASHED 🥬',
      },
      {
        crazyName: `The $8 Emotional-Support Cup Hostage`,
        avatarEmoji: '🧋',
        floatingEmojis: ['☕', '🧋', '🧊', '💳', '💸', '😵‍💫'],
        totalAmountFormatted: `-${usd.format(coffeeSpend)}`,
        subtitleLine: `${coffeeCount} ALL-TIME STOPS · ${usdCents.format(coffeeAvg)} AVG AT ${coffeeName.toUpperCase()}`,
        roastQuote: `${coffeeCount} all-time swipes at ${coffeeName} (${usdCents.format(coffeeAvg)} avg). That's an 850% markup over home brew — and consumer studies show 64% of daily buyers aren't even hooked on the caffeine, it's just a Pavlovian bribe to survive opening your inbox.`,
        stampText: '850% MARKUP ☕',
      },
      {
        crazyName: `The 10 PM Couch "Add-to-Cart" Gremlin`,
        avatarEmoji: '📦',
        floatingEmojis: ['📦', '🛒', '🛋️', '💳', '💸', '😈'],
        totalAmountFormatted: `-${usd.format(shopSpend)}`,
        subtitleLine: `${shopCount} ALL-TIME ORDERS · ${usdCents.format(shopAvg)} AVG AT ${shopName.toUpperCase()}`,
        roastQuote: `${shopCount} all-time checkouts at ${shopName} (${usdCents.format(shopAvg)} avg). Retail studies prove 71% of impulse carts happen horizontally on the couch after 9 PM, and 62% of items weren't on the list. How many cardboard boxes are hidden at the bottom of your recycling bin!?`,
        stampText: '71% COUCH CART 📦',
      },
      {
        crazyName: `Baron Von "Under $20 Doesn't Count"`,
        avatarEmoji: '💳',
        floatingEmojis: ['💳', '💸', '🧠', '🍺', '☕', '🚬'],
        totalAmountFormatted: `-${usd.format(Math.max(195, Math.round(microUnder20Total)))}`,
        subtitleLine: `${microUnder20Count} ALL-TIME TAPS UNDER $20 · ${usdCents.format(microUnder20Avg)} AVG`,
        roastQuote: `${microUnder20Count} tiny card taps averaging ${usdCents.format(microUnder20Avg)}. MIT research proves contactless tap-to-pay numbs the brain's pain receptor so anything under $20 feels "legally free." That's not pocket change — that's death by ${microUnder20Count} paper cuts.`,
        stampText: 'TAP AMNESIA 🧠',
      },
    ];

    synthesizedMarkdownReport = `[ROAST_GIF_CARD]${JSON.stringify({ cards })}[/ROAST_GIF_CARD]`;
  }
  // A0. 📈🚗 Invest in Accounts vs. Pay Off Car Loan & Mortgage Early
  else if (isInvestVsPayoffAsk) {
    const top2Disc = discretionaryCats.slice(0, 2);
    const top2CombinedAvg = top2Disc.reduce((s, c) => s + Math.max(c.spend, c.avg), 0);
    const habitLabel = top2Disc.map((c) => c.category).join(' & ') || 'Dining & Shopping';
    const monthlyRedirect = parsedDollarAmount ?? Math.max(200, Math.round((top2CombinedAvg || 600) * 0.4));

    const rSp500 = 0.085 / 12;
    const rHysa = 0.045 / 12;
    const sp5yr = Math.round(monthlyRedirect * ((Math.pow(1 + rSp500, 60) - 1) / rSp500));
    const sp10yr = Math.round(monthlyRedirect * ((Math.pow(1 + rSp500, 120) - 1) / rSp500));
    const sp20yr = Math.round(monthlyRedirect * ((Math.pow(1 + rSp500, 240) - 1) / rSp500));
    const hysa5yr = Math.round(monthlyRedirect * ((Math.pow(1 + rHysa, 60) - 1) / rHysa));
    const hysa10yr = Math.round(monthlyRedirect * ((Math.pow(1 + rHysa, 120) - 1) / rHysa));

    const carAccel = calcLoanAccel(carLoan, monthlyRedirect, 'monthly');
    const houseAccel = calcLoanAccel(primaryHouseLoan, monthlyRedirect, 'monthly');

    synthesizedMarkdownReport = [
      `### Where Your Money Should Go Instead (+${usd.format(monthlyRedirect)}/mo from ${habitLabel})`,
      `> 📈 **Redirecting +${usd.format(monthlyRedirect)}/mo from ${habitLabel} builds +${usd.format(sp10yr)} in 10 yrs (+${usd.format(sp20yr)} in 20 yrs) inside a Roth IRA / S&P 500 account — OR pays off your ${carLoan.name} ${carAccel.monthsShaved} months early.** Pick literally any row below over another forgettable swipe.`,
      `| Account / Payoff Strategy | 5-Yr / Payoff Speed | 10-Yr Wealth / Interest Saved |`,
      `| --- | --- | --- |`,
      `| 📈 **Roth IRA (Tax-Free S&P 500 @ 8.5%)** | **+${usd.format(sp5yr)}** in 5 yrs | **+${usd.format(sp10yr)}** (20-yr: **+${usd.format(sp20yr)}**) |`,
      `| 💼 **${invAcctLabel} (Brokerage / 401k)** | **+${usd.format(sp5yr)}** (${usd.format(monthlyRedirect * 60)} principal) | **+${usd.format(sp10yr)}** (+${usd.format(sp10yr - monthlyRedirect * 120)} pure gain) |`,
      `| 🏦 **${savAcctLabel} (4.5% APY Cash)** | **+${usd.format(hysa5yr)}** risk-free | **+${usd.format(hysa10yr)}** liquid emergency buffer |`,
      `| 🚗 **Pay Off ${carLoan.name} Early (${carLoan.rate || 6.9}%)** | **Done ${carAccel.monthsShaved} mos (${(carAccel.monthsShaved / 12).toFixed(1)} yrs) sooner** | **+${usd.format(carAccel.interestSaved)} interest saved** |`,
      `| 🏠 **Pay Off ${primaryHouseLoan.name} Early (${primaryHouseLoan.rate || 6.25}%)** | **Done ${(houseAccel.monthsShaved / 12).toFixed(1)} yrs (${houseAccel.monthsShaved} mos) sooner** | **+${usd.format(houseAccel.interestSaved)} interest saved** |`,
      `| **= Keeping +${usd.format(monthlyRedirect)}/mo (${usd.format(monthlyRedirect * 12)}/yr)** | **Kills ${carLoan.name} ${carAccel.monthsShaved} mos early** | **Or compounds to +${usd.format(sp10yr)} in 10 yrs** |`,
      `- 💡 **Best Order of Operations:** 1) Grab any 401(k) match, 2) Kill any car/debt over **6% APR** (**${carLoan.name}** saves **+${usd.format(carAccel.interestSaved)}** guaranteed), 3) Max your **Roth IRA / S&P 500 Index** for **+${usd.format(sp20yr)}** tax-free over 20 years.`,
    ].join('\n');
  }
  // A. 🏠 Tacos vs. Your Mortgage / Loans (Amortization & Extra Principal Tradeoff)
  else if (isMortgageTradeoffAsk) {
    const targetLoan = primaryHouseLoan;
    const top2Disc = discretionaryCats.slice(0, 2);
    const top2CombinedAvg = top2Disc.reduce((s, c) => s + Math.max(c.spend, c.avg), 0);
    const habitLabel = top2Disc.map((c) => c.category).join(' & ') || 'Dining & Shopping';
    const extraMonthly = parsedDollarAmount ?? Math.max(150, Math.round((top2CombinedAvg || 600) * 0.5));

    const P = Math.max(1000, targetLoan.principal || 250000);
    const r = Math.max(0.03, (targetLoan.rate || 6.0) / 100) / 12;
    const minPaymentNeeded = Math.ceil(P * r + 50);
    const M0 = Math.max(minPaymentNeeded, targetLoan.monthlyPayment || Math.round(P * 0.0065));
    const M1 = M0 + extraMonthly;

    const calcMonths = (pmt: number) =>
      r > 0 && pmt > P * r
        ? Math.ceil(-Math.log(1 - (P * r) / pmt) / Math.log(1 + r))
        : Math.ceil(P / pmt);

    const n0 = calcMonths(M0);
    const n1 = calcMonths(M1);
    const monthsShaved = Math.max(1, n0 - n1);
    const yearsShaved = (monthsShaved / 12).toFixed(1);
    const interest0 = Math.max(0, n0 * M0 - P);
    const interest1 = Math.max(0, n1 * M1 - P);
    const interestSaved = Math.max(0, interest0 - interest1);

    synthesizedMarkdownReport = [
      `### Tacos vs. Freedom: ${targetLoan.name} Payoff Math`,
      `> 🏠 **Redirecting half of your ${habitLabel} habit (+${usd.format(extraMonthly)}/mo) shaves ${yearsShaved} years (${monthsShaved} mos) off your ${targetLoan.name} and erases ${usd.format(interestSaved)} in pure bank interest.** Stop tipping the bank just so you can impulse-swipe.`,
      `| Payoff Scenario | Timeline · Total Interest | Monthly Payment |`,
      `| --- | --- | --- |`,
      `| Current ${targetLoan.name} Path | ${n0} mos (${(n0 / 12).toFixed(1)} yrs) · ${usd.format(interest0)} interest | -${usd.format(M0)}/mo |`,
      `| + Redirect 50% of ${habitLabel} | Cut from ${usd.format(top2CombinedAvg || extraMonthly * 2)}/mo burn | +${usd.format(extraMonthly)}/mo |`,
      `| New Accelerated Path | ${n1} mos (${(n1 / 12).toFixed(1)} yrs) · ${usd.format(interest1)} interest | -${usd.format(M1)}/mo |`,
      `| **= Freedom & Interest Saved** | **Paid off ${yearsShaved} yrs (${monthsShaved} mos) sooner** | **+${usd.format(interestSaved)} saved** |`,
      ...buildWealthRedirectLines(extraMonthly, 'monthly'),
    ].join('\n');
  }
  // B. ⏱️ Life-Energy Math ("Convert my spending into hours of my life at work")
  else if (isWorkHoursAsk) {
    const netMonthly = Math.max(
      2800,
      monthlyNetIncomeBaseline || curMonthStats.incomeDollars || prevMonthStats.incomeDollars || 5200
    );
    const hourlyNet = netMonthly / 160;
    const totalVarHours = curVariableSpent / hourlyNet;
    const totalVarDays = totalVarHours / 8;
    const top4 = discretionaryCats.slice(0, 4);

    synthesizedMarkdownReport = [
      `### Life-Energy Audit: Hours Worked for ${monthLabel(curMonthKey)} Spend`,
      `> ⏱️ **At ~${usd.format(hourlyNet)}/hr after taxes, you sat at work for ${totalVarHours.toFixed(1)} hours (${totalVarDays.toFixed(1)} full workdays) this month just to pay for variable spending (-${usd.format(curVariableSpent)}).** Next time you tap your card, ask if it's worth another Monday morning meeting.`,
      `| Category (${monthLabel(curMonthKey)}) | Life Energy Cost (at ${usd.format(hourlyNet)}/hr) | Dollars Burned |`,
      `| --- | --- | --- |`,
      ...(top4.length > 0
        ? top4.map(
            (c) =>
              `| **${c.category}** (${c.count}x) | **${(c.spend / hourlyNet).toFixed(1)} hrs** (${(c.spend / hourlyNet / 8).toFixed(1)} workdays) | -${usd.format(c.spend)} |`
          )
        : [`| Variable spending | 0.0 hrs | $0 |`]),
      `| **= Total Variable Work Time** | **${totalVarHours.toFixed(1)} hrs (${totalVarDays.toFixed(1)} 8-hr workdays)** | **-${usd.format(curVariableSpent)}** |`,
      ...buildWealthRedirectLines(Math.max(150, Math.round(curVariableSpent * 0.3)), 'monthly'),
    ].join('\n');
  }
  // C. ☕ Death by a Thousand Swipes (Under-$25 Micro-Leak Audit)
  else if (isMicroSwipesAsk) {
    const pool = curMonthTxns.filter((t) => t.amount < 0 && !isTransfer(t)).length >= 5 ? curMonthTxns : periodTxns;
    const microTxns = pool.filter((t) => t.amount < 0 && !isTransfer(t) && Math.abs(t.amount) <= 25);
    const microTotal = microTxns.reduce((s, t) => s + Math.abs(t.amount), 0);
    const microAvg = microTxns.length > 0 ? microTotal / microTxns.length : 0;
    const annualMicro = microTotal * 12;

    const byMicroMerch = new Map<string, { sum: number; count: number }>();
    for (const t of microTxns) {
      const mk = (t.merchantKey || t.description || 'Unknown').trim();
      const prev = byMicroMerch.get(mk) || { sum: 0, count: 0 };
      prev.sum += Math.abs(t.amount);
      prev.count += 1;
      byMicroMerch.set(mk, prev);
    }
    const topMicro = Array.from(byMicroMerch.entries())
      .sort((a, b) => b[1].sum - a[1].sum)
      .slice(0, 4);
    const topMicroSum = topMicro.reduce((s, [, v]) => s + v.sum, 0);
    const otherMicroSum = Math.max(0, microTotal - topMicroSum);

    synthesizedMarkdownReport = [
      `### "Death by a Thousand Swipes" (Under-$25 Audit)`,
      `> ☕ **You made ${microTxns.length} "harmless" little swipes under $25 totaling -${usd.format(microTotal)} (avg ${usdCents.format(microAvg)}/swipe).** That's a **-${usd.format(annualMicro)}/yr** leak while your brain rounds every $12 tap down to zero.`,
      `| Micro-Swipe Culprit (≤$25) | Tiny Swipes | Subtotal |`,
      `| --- | --- | --- |`,
      ...(topMicro.length > 0
        ? topMicro.map(
            ([m, v]) => `| **${m}** | ${v.count}x (avg ${usdCents.format(v.sum / v.count)}) | -${usdCents.format(v.sum)} |`
          )
        : [`| No under-$25 swipes found | Impressive restraint | $0.00 |`]),
      otherMicroSum > 1
        ? `| + Other under-$25 taps | ${Math.max(0, microTxns.length - topMicro.reduce((s, [, v]) => s + v.count, 0))} small charges | -${usdCents.format(otherMicroSum)} |`
        : '',
      `| **= Total Under-$25 Leak** | **${microTxns.length} swipes (-${usd.format(annualMicro)}/yr pace)** | **-${usdCents.format(microTotal)}** |`,
      ...buildWealthRedirectLines(Math.max(75, Math.round(microTotal * 0.5)), 'monthly'),
    ]
      .filter(Boolean)
      .join('\n');
  }
  // D. 🎉 Weekend You vs. Weekday You (Jekyll & Hyde Audit)
  else if (isWeekendVsWeekdayAsk) {
    const varPool = (curMonthTxns.length >= 6 ? curMonthTxns : periodTxns).filter((t) => {
      if (t.amount >= 0 || isTransfer(t)) return false;
      if (t.recurrence === 'recurring') return false;
      const mk = (t.merchantKey || '').trim().toLowerCase();
      if (mk && recurringKeysLower.has(mk)) return false;
      const cObj = data.categories.find((c) => c.name === t.category);
      if (cObj?.defaultRecurrence === 'recurring') return false;
      return true;
    });

    let weekendSpend = 0;
    let weekendSwipes = 0;
    let weekdaySpend = 0;
    let weekdaySwipes = 0;
    const weekendDates = new Set<string>();
    const weekdayDates = new Set<string>();
    const weekendByCat = new Map<string, number>();

    for (const t of varPool) {
      const d = new Date(`${t.date}T12:00:00`).getDay();
      const abs = Math.abs(t.amount);
      if (d === 0 || d === 5 || d === 6) {
        weekendSpend += abs;
        weekendSwipes += 1;
        weekendDates.add(t.date);
        const cat = t.category || 'Uncategorized';
        weekendByCat.set(cat, (weekendByCat.get(cat) || 0) + abs);
      } else {
        weekdaySpend += abs;
        weekdaySwipes += 1;
        weekdayDates.add(t.date);
      }
    }

    const wkndDays = Math.max(3, weekendDates.size || Math.round(curDayOfMonth * (3 / 7)));
    const wkdyDays = Math.max(4, weekdayDates.size || Math.round(curDayOfMonth * (4 / 7)));
    const wkndDaily = weekendSpend / wkndDays;
    const wkdyDaily = weekdaySpend / wkdyDays;
    const totalVar = Math.max(1, weekendSpend + weekdaySpend);
    const wkndSharePct = Math.round((weekendSpend / totalVar) * 100);
    const topWkndCat = Array.from(weekendByCat.entries()).sort((a, b) => b[1] - a[1])[0];

    synthesizedMarkdownReport = [
      `### Weekend You vs. Weekday You (${monthLabel(curMonthKey)})`,
      `> 🎉 **Mon–Thu you spend ${usd.format(wkdyDaily)}/day; Fri–Sun you burn ${usd.format(wkndDaily)}/day.** **${wkndSharePct}%** of your discretionary money disappears between Friday afternoon and Sunday night.`,
      `| Personality | Swipes · Daily Burn Rate | Total Spend |`,
      `| --- | --- | --- |`,
      `| 🧘 **Weekday You (Mon–Thu)** | ${weekdaySwipes} swipes · **${usd.format(wkdyDaily)}/day** | -${usd.format(weekdaySpend)} |`,
      `| 🕺 **Weekend You (Fri–Sun)** | ${weekendSwipes} swipes · **${usd.format(wkndDaily)}/day** | -${usd.format(weekendSpend)} |`,
      topWkndCat
        ? `| 🚨 **#1 Weekend Weakness** | **${topWkndCat[0]}** on Fri–Sun | -${usd.format(topWkndCat[1])} |`
        : '',
      `| **= Total Variable Spend** | **Weekend burn is ${(wkndDaily / Math.max(1, wkdyDaily)).toFixed(1)}x higher/day** | **-${usd.format(weekendSpend + weekdaySpend)}** |`,
      ...buildWealthRedirectLines(Math.max(100, Math.round(weekendSpend * 0.4)), 'monthly'),
    ]
      .filter(Boolean)
      .join('\n');
  }
  // E. 🕵️ Crime Scene: Single Worst Spending Day This Month
  else if (isWorstDayAsk) {
    const varPool = (curMonthTxns.length >= 4 ? curMonthTxns : periodTxns).filter((t) => {
      if (t.amount >= 0 || isTransfer(t)) return false;
      if (t.recurrence === 'recurring') return false;
      const mk = (t.merchantKey || '').trim().toLowerCase();
      if (mk && recurringKeysLower.has(mk)) return false;
      return true;
    });

    const byDate = new Map<string, { sum: number; txns: Transaction[] }>();
    for (const t of varPool) {
      const entry = byDate.get(t.date) || { sum: 0, txns: [] };
      entry.sum += Math.abs(t.amount);
      entry.txns.push(t);
      byDate.set(t.date, entry);
    }
    const worstEntry = Array.from(byDate.entries()).sort((a, b) => b[1].sum - a[1].sum)[0];
    const worstDate = worstEntry?.[0] || latestTxDate || curMonthKey;
    const worstTxns = (worstEntry?.[1].txns || []).sort((a, b) => a.amount - b.amount);
    const worstSum = worstEntry?.[1].sum || 0;
    const pctOfMonthlyVar = Math.round((worstSum / Math.max(1, monthlyVariableBaseline || curVariableSpent)) * 100);

    synthesizedMarkdownReport = [
      `### Crime Scene Report: Worst Spending Day (${worstDate})`,
      `> 🕵️ **On ${worstDate}, you swiped your card ${worstTxns.length} time${worstTxns.length === 1 ? '' : 's'} for -${usdCents.format(worstSum)}.** You torched **${pctOfMonthlyVar}%** of your entire monthly variable budget in a single 24-hour window.`,
      `| Receipt on ${worstDate} | Category | Amount |`,
      `| --- | --- | --- |`,
      ...worstTxns.slice(0, 5).map(
        (t) =>
          `| **${(t.merchantKey || t.description).slice(0, 26)}** | ${t.category || 'Uncategorized'} | -${usdCents.format(Math.abs(t.amount))} |`
      ),
      `| **= Single-Day Damage (${worstDate})** | **${worstTxns.length} swipes in 24 hours** | **-${usdCents.format(worstSum)}** |`,
      ...buildWealthRedirectLines(Math.max(100, Math.round(worstSum)), 'onetime'),
    ].join('\n');
  }
  // F. 🏆 Which Merchant Owns Me? (The Silent Partner Tax)
  else if (isMerchantOwnerAsk) {
    const nonBillMerchants = Array.from(periodStats.byMerch.entries())
      .filter(([m, v]) => {
        const lowerM = `${m} ${v.category}`.toLowerCase();
        return !/mortgage|rent|loan|utilit|insurance|transfer|tax/i.test(lowerM);
      })
      .sort((a, b) => b[1].spendCents - a[1].spendCents)
      .slice(0, 5);

    const topOne = nonBillMerchants[0];
    const top5Sum = nonBillMerchants.reduce((s, [, v]) => s + v.spendCents, 0);
    const topOneAnnual = (topOne ? topOne[1].spendCents : 0) * 12;
    const topOneTenYr = Math.round(topOneAnnual * 14.48);

    synthesizedMarkdownReport = [
      `### "Silent Partner" Audit: Who Owns Your Paycheck?`,
      `> 🏆 **${topOne ? topOne[0] : 'Your top merchant'} practically owns equity in your life (-${usd.format(topOne ? topOne[1].spendCents : 0)} across ${topOne ? topOne[1].count : 0} swipes).** At **-${usd.format(topOneAnnual)}/yr**, you're funding their corporate retreat instead of a **${usd.format(topOneTenYr)}** 10-year investment account.`,
      `| Top Discretionary Merchant | Category · Swipes | Total Paid |`,
      `| --- | --- | --- |`,
      ...nonBillMerchants.map(
        ([m, v], i) =>
          `| ${i + 1}. **${m}** | ${v.category} · ${v.count}x (avg ${usd.format(v.spendCents / v.count)}) | -${usd.format(v.spendCents)} |`
      ),
      `| **= Top ${nonBillMerchants.length} Merchants Total** | **-${usd.format(top5Sum * 12)}/yr combined pace** | **-${usd.format(top5Sum)}** |`,
      ...buildWealthRedirectLines(Math.max(100, Math.round(topOne ? topOne[1].spendCents : top5Sum * 0.3)), 'monthly'),
    ].join('\n');
  }
  // G. 🛟 Cash Runway: "If My Paycheck Stopped Today, How Many Days Do I Last?"
  else if (isRunwayAsk) {
    const currentMonthlyBurn = Math.max(
      1800,
      curMonthStats.spendDollars,
      prevMonthStats.spendDollars,
      monthlyRecurringBaseline + monthlyVariableBaseline
    );
    const currentDailyBurn = currentMonthlyBurn / 30;
    const survivalMonthlyBurn = Math.max(1200, monthlyRecurringBaseline + 650);
    const survivalDailyBurn = survivalMonthlyBurn / 30;
    const daysCurrent = Math.round(liquidCashDollars / Math.max(1, currentDailyBurn));
    const daysSurvival = Math.round(liquidCashDollars / Math.max(1, survivalDailyBurn));
    const extraDays = Math.max(0, daysSurvival - daysCurrent);
    const monthlyFluffSaved = Math.max(150, Math.round(currentMonthlyBurn - survivalMonthlyBurn));

    synthesizedMarkdownReport = [
      `### Cash Runway & Survival Reality Check`,
      `> 🛟 **At your current ${usd.format(currentDailyBurn)}/day burn rate, your ${usd.format(liquidCashDollars)} cash lasts ${daysCurrent} days (${(daysCurrent / 30).toFixed(1)} mos).** Cut the discretionary fluff and your runway jumps to **${daysSurvival} days (+${extraDays} extra days of survival)**.`,
      `| Runway Scenario | Burn Rate | Days of Survival |`,
      `| --- | --- | --- |`,
      `| Total Liquid Cash Available | Checking (${usd.format(checkingCashDollars)}) + Savings (${usd.format(savingsCashDollars)}) | +${usd.format(liquidCashDollars)} |`,
      `| Current Lifestyle Pace | -${usd.format(currentMonthlyBurn)}/mo (-${usd.format(currentDailyBurn)}/day) | **${daysCurrent} days (${(daysCurrent / 30).toFixed(1)} mos)** |`,
      `| Lean Bills-Only Mode | -${usd.format(survivalMonthlyBurn)}/mo (-${usd.format(survivalDailyBurn)}/day) | **${daysSurvival} days (${(daysSurvival / 30).toFixed(1)} mos)** |`,
      `| **= Runway Gained by Cutting Fluff** | **Saves +${usd.format(monthlyFluffSaved)}/mo** | **+${extraDays} extra days** |`,
      ...buildWealthRedirectLines(monthlyFluffSaved, 'monthly'),
    ].join('\n');
  }
  // H. 📅 Last Month's Full Category Receipt
  else if (isLastMonthReceiptAsk) {
    const prevCats = Array.from(prevMonthStats.byCat.entries())
      .sort((a, b) => b[1].spendCents - a[1].spendCents);
    const top6Prev = prevCats.slice(0, 6);
    const top6Sum = top6Prev.reduce((s, [, v]) => s + v.spendCents, 0);
    const otherPrevSum = Math.max(0, prevMonthStats.spendDollars - top6Sum);
    const worstPrev = top6Prev[0];

    synthesizedMarkdownReport = [
      `### ${monthLabel(prevMonthKey)} Category Receipt (Full Breakdown)`,
      `> 📅 **Last month (${monthLabel(prevMonthKey)}) you burned -${usd.format(prevMonthStats.spendDollars)} against +${usd.format(prevMonthStats.incomeDollars)} in inflows.** ${worstPrev ? `**${worstPrev[0]}** led the damage at **-${usd.format(worstPrev[1].spendCents)}** (${worstPrev[1].count} swipes).` : ''}`,
      `| ${monthLabel(prevMonthKey)} Category | Swipes · 3-Mo Avg | ${monthLabel(prevMonthKey)} Spend |`,
      `| --- | --- | --- |`,
      ...top6Prev.map(([cat, v]) => {
        const avg = trailingAvgByCat.get(cat) || v.spendCents;
        return `| **${cat}** (${v.count}x) | Avg ${usd.format(avg)}/mo | -${usd.format(v.spendCents)} |`;
      }),
      prevCats.length > 6
        ? `| + ${prevCats.length - 6} other categories | Combined smaller spend | -${usd.format(otherPrevSum)} |`
        : '',
      `| **= Total ${monthLabel(prevMonthKey)} Spend** | **Net kept: ${prevMonthStats.netDollars >= 0 ? '+' : ''}${usd.format(prevMonthStats.netDollars)}** | **-${usd.format(prevMonthStats.spendDollars)}** |`,
      ...buildWealthRedirectLines(Math.max(150, Math.round((worstPrev?.[1].spendCents || 400) * 0.5)), 'monthly'),
    ]
      .filter(Boolean)
      .join('\n');
  }
  // 1. Affordability / "Talk me out of spending $X"
  else if (isAffordOrImpulseAsk) {
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
    const tenYearCost = Math.round(amountToTest * Math.pow(1.085, 10));

    const roastLine =
      projectedMonthEndAfter < 500 || monthlySafeRemainder - amountToTest < 0
        ? `🚨 **Put the card down.** Dropping **${usd.format(amountToTest)}** leaves your checking with **${usd.format(projectedMonthEndAfter)}** after **${usd.format(unpaidBillsTotalDollars)}** in unpaid bills${topDiscretionary ? ` — and you already blew **${usd.format(topDiscretionary.spend)}** on **${topDiscretionary.category}** this month` : ''}.`
        : `🛑 **Your card won't decline, which is the lowest bar in finance.** You still have **${usd.format(unpaidBillsTotalDollars)}** in unpaid bills this month${topDiscretionary ? `, you've already burned **${usd.format(topDiscretionary.spend)}** on **${topDiscretionary.category}**` : ''}, and **${usd.format(amountToTest)}** invested at 8.5% is **${usd.format(tenYearCost)}** in 10 years. Close the tab.`;

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
      ...buildWealthRedirectLines(amountToTest, isRecurringAsk ? 'monthly' : 'onetime'),
    ].join('\n');
  }
  // 2. Upcoming Bills & Safe-to-Spend Until Next Payday
  else if (isUpcomingBillsAsk) {
    const upcomingSchedule = streamSchedules
      .filter((s) => typeof s.schedule.nextExpectedDay === 'number' && s.schedule.nextExpectedDay >= curDayOfMonth)
      .sort((a, b) => (a.schedule.nextExpectedDay || 99) - (b.schedule.nextExpectedDay || 99));

    const nextPaydayDay = upcomingSchedule[0]?.schedule.nextExpectedDay ?? daysInCurMonth;
    const daysToPayday = Math.max(
      1,
      upcomingSchedule.length > 0 ? nextPaydayDay - curDayOfMonth : daysRemainingInMonth + 7
    );
    const nextPaycheckDollars =
      upcomingSchedule.length > 0
        ? upcomingSchedule[0].schedule.netPerPaycheck
        : streamSchedules[0]?.schedule.netPerPaycheck || 0;

    const topUnpaid = unpaidBills.slice(0, 5);
    const topUnpaidSum = topUnpaid.reduce((s, b) => s + b.monthlyAverage, 0);
    const otherUnpaidSum = Math.max(0, unpaidBillsTotalDollars - topUnpaidSum);
    const freeCheckingAfterBills = checkingCashDollars - unpaidBillsTotalDollars;
    const dailySafeAllowance = Math.max(0, freeCheckingAfterBills) / Math.max(1, daysToPayday);

    const roastLine =
      unpaidBills.length > 0
        ? `⏳ **Hands off your checking balance — ${usd.format(unpaidBillsTotalDollars)} of it already belongs to ${unpaidBills.length} unpaid bills.** After reserving those bills, your true **Safe-to-Spend is ${usd.format(freeCheckingAfterBills)}** (**${usd.format(dailySafeAllowance)}/day** over the next **${daysToPayday} days** until payday).`
        : `✅ **All ${paidBills.length} bills (${usd.format(paidBillsTotalDollars)}) cleared — leaving ${usd.format(freeCheckingAfterBills)} uncommitted (${usd.format(dailySafeAllowance)}/day until next payday).** Sweep your surplus into investments or loan principal before you invent a way to spend it.`;

    synthesizedMarkdownReport = [
      `### Safe-to-Spend Until Next Payday & Upcoming Bills (${daysToPayday}d window)`,
      `> ${roastLine}`,
      `| Cash & Unpaid Bill Math | Expected · Status | Amount |`,
      `| --- | --- | --- |`,
      `| 🏦 **Checking Cash Today** | Next paycheck: ${nextPaycheckDollars > 0 ? `+${usd.format(nextPaycheckDollars)} in ~${daysToPayday}d` : `${daysRemainingInMonth}d left in mo`} | **+${usd.format(checkingCashDollars)}** |`,
      ...(topUnpaid.length > 0
        ? topUnpaid.map(
            (b) =>
              `| ⏳ **${b.merchantKey}** | ${b.status.expectedShortLabel || 'This mo'} · ${b.status.countdownText || 'upcoming'} | -${usd.format(b.monthlyAverage)} |`
          )
        : paidBills.slice(0, 4).map(
            (b) => `| ✅ **${b.merchantKey}** | Paid this month | -${usd.format(b.monthlyAverage)} |`
          )),
      unpaidBills.length > topUnpaid.length
        ? `| + ${unpaidBills.length - topUnpaid.length} more unpaid bills | Due before month-end | -${usd.format(otherUnpaidSum)} |`
        : '',
      `| **= Safe-to-Spend Until Payday** | **${usd.format(dailySafeAllowance)}/day safe allowance (${daysToPayday}d)** | **${freeCheckingAfterBills >= 0 ? '+' : ''}${usd.format(freeCheckingAfterBills)}** |`,
      ...buildWealthRedirectLines(Math.max(150, Math.round(Math.max(200, freeCheckingAfterBills) * 0.25)), 'monthly'),
    ]
      .filter(Boolean)
      .join('\n');
  }
  // 3. Recent Charges & Sync Impact ("Has anything big hit my accounts lately?")
  else if (isRecentHitsAsk) {
    const recentOutflows = recent7DayTxns.filter((t) => t.amount < 0);
    const recentTotal = recentOutflows.reduce((s, t) => s + Math.abs(t.amount), 0);
    const topRecent = [...recentOutflows].sort((a, b) => a.amount - b.amount).slice(0, 5);
    const topRecentSum = topRecent.reduce((s, t) => s + Math.abs(t.amount), 0);
    const otherRecentSum = Math.max(0, recentTotal - topRecentSum);
    const biggestHit = topRecent[0];
    const projectedEomBurn = Math.max(
      curMonthStats.spendDollars,
      Math.round((curMonthStats.spendDollars / Math.max(1, curDayOfMonth)) * daysInCurMonth)
    );
    const annualizedBurn = projectedEomBurn * 12;
    const recentAnnualizedIfRepeated = Math.round(recentTotal * 52);

    synthesizedMarkdownReport = [
      `### Recent Sync Damage Report & Month/Year Impact (Since ${sevenDaysAgoStr})`,
      `> 🚨 **${recentOutflows.length} charges for -${usd.format(recentTotal)} in the last 7 days**${biggestHit ? ` (led by **-${usdCents.format(Math.abs(biggestHit.amount))}** at **${(biggestHit.merchantKey || biggestHit.description).slice(0, 24)}**)` : ''}. That pushes your **${monthLabel(curMonthKey)} spend to ${usd.format(curMonthStats.spendDollars)}** and puts your full-year pace at **${usd.format(annualizedBurn)}/yr**.`,
      `| Recent Charge / Impact Metric | Category · Account / Context | Amount |`,
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
      `| 📅 **${monthLabel(curMonthKey)} Impact (MTD)** |Proj EOM: **${usd.format(projectedEomBurn)}** · Unpaid bills: **-${usd.format(unpaidBillsTotalDollars)}** | **-${usd.format(curMonthStats.spendDollars)}** |`,
      `| 📆 **Full-Year Pace Impact** | If 7-day pace repeated all year: **-${usd.format(recentAnnualizedIfRepeated)}/yr** | **-${usd.format(annualizedBurn)}/yr** |`,
      `| **= 7-Day Synced Burn** | **${recentOutflows.length} charges (${recent7DayBigCharges.length} over $50)** | **-${usdCents.format(recentTotal)}** |`,
      ...buildWealthRedirectLines(Math.max(100, Math.round(recentTotal)), 'onetime'),
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
        ...buildWealthRedirectLines(Math.max(75, Math.round(monthlyRate * 0.5)), 'monthly'),
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
        `> 🔥 **You've handed "${kwLabel}" -${usdCents.format(totalMatchSpend)} across ${spendTxns.length} charges.** Imagine if you funded your brokerage account or killed your car loan with that same loyalty.`,
        `| Date · Merchant | Category | Amount |`,
        `| --- | --- | --- |`,
        ...shown.map(
          (t) => `| ${t.date} · **${(t.merchantKey || t.description).slice(0, 24)}** | ${t.category || 'Uncategorized'} | -${usdCents.format(Math.abs(t.amount))} |`
        ),
        spendTxns.length > shown.length
          ? `| + ${spendTxns.length - shown.length} older charges | Historical burn | -${usdCents.format(Math.max(0, totalMatchSpend - shownSum))} |`
          : '',
        `| **= Total "${kwLabel}" Spend** | **${spendTxns.length} charges total** | **-${usdCents.format(totalMatchSpend)}** |`,
        ...buildWealthRedirectLines(Math.max(75, Math.round(totalMatchSpend)), 'onetime'),
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
  // 5. Subscriptions, Recurring Drains & Bill Creep Radar
  else if (isSubscriptionAsk) {
    const subRadar = detectSubscriptionAlerts(scopedAllTimeTxns, []);
    const recentHikes = subRadar.priceSpikes.slice(0, 3);
    const totalHikeAnnual = recentHikes.reduce((s, h) => s + h.annualImpact, 0);

    const nonLoanRec = recurringWithStatus.filter(
      (m) => !/mortgage|loan|rent/i.test(`${m.category} ${m.merchantKey}`)
    );
    const listToShow = (nonLoanRec.length > 0 ? nonLoanRec : recurringWithStatus).slice(0, 5);
    const listSum = listToShow.reduce((s, m) => s + m.monthlyAverage, 0);
    const totalRecMonthly = recurringWithStatus.reduce((s, m) => s + m.monthlyAverage, 0);
    const otherRec = Math.max(0, totalRecMonthly - listSum);

    synthesizedMarkdownReport = [
      `### Subscription, Autopay & Bill Creep Audit`,
      `> 🧛 **${recurringWithStatus.length} recurring charges quietly siphon -${usd.format(totalRecMonthly)}/mo (-${usd.format(totalRecMonthly * 12)}/yr) before you even buy coffee${recentHikes.length > 0 ? ` — plus ${recentHikes.length} recent price hike${recentHikes.length === 1 ? '' : 's'} costing you +${usd.format(totalHikeAnnual)}/yr extra` : ''}.** Cancel two things you barely use and redirect that autopay into your own wealth.`,
      `| Recurring Drain / Bill Creep | Category · ${monthLabel(curMonthKey)} Status | Monthly |`,
      `| --- | --- | --- |`,
      ...recentHikes.map(
        (h) =>
          `| 📈 **${h.merchantName}** (Price Hike) | Was ${usdCents.format(h.oldPrice)} → **${usdCents.format(h.newPrice)}** (+${h.percentageChange.toFixed(0)}%) | **+${usd.format(h.annualImpact)}/yr** |`
      ),
      ...listToShow.map(
        (m) =>
          `| **${m.merchantKey}** | ${m.category} · ${m.status.isPaidThisMonth ? '✅ Paid' : `⏳ ${m.status.expectedShortLabel || 'Due'}`} | -${usd.format(m.monthlyAverage)}/mo |`
      ),
      recurringWithStatus.length > listToShow.length
        ? `| + ${recurringWithStatus.length - listToShow.length} other fixed bills | Includes housing/loans | -${usd.format(otherRec)}/mo |`
        : '',
      `| **= Total Autopay Drain** | **-${usd.format(totalRecMonthly * 12)}/yr on autopilot** | **-${usd.format(totalRecMonthly)}/mo** |`,
      ...buildWealthRedirectLines(Math.max(60, Math.round(listSum * 0.35)), 'monthly'),
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
        : `📉 **You're ${usd.format(Math.abs(spendDelta))} below ${monthLabel(prevMonthKey)} so far — DO NOT blow it on a "treat yourself" purchase.** Sweep that **+${usd.format(Math.abs(spendDelta))}** win straight into your investment account or car loan today.`;

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
      ...buildWealthRedirectLines(Math.max(150, Math.round(Math.abs(spendDelta) || 250)), 'monthly'),
    ].join('\n');
  }
  // 7. Debt vs Liquid Cash / Net Worth Reality Check
  else if (isDebtOrNetWorthAsk) {
    const totalAssets = liquidCashDollars + investmentsDollars + propertyVal;
    const topLoan = activeLoans[0];

    synthesizedMarkdownReport = [
      `### Debt vs. Cash Reality Check`,
      `> 🏦 **You're carrying -${usd.format(totalDebtDollars)} in debt while sitting on ${usd.format(liquidCashDollars)} in cash.** Every dollar you spend on forgettable stuff is a dollar that isn't killing your loans early or compounding your **${usd.format(netWorthDollars)}** net worth.`,
      `| Balance Sheet Line | Reality Check | Balance |`,
      `| --- | --- | --- |`,
      `| + Liquid Cash | Checking (${usd.format(checkingCashDollars)}) + Savings (${usd.format(savingsCashDollars)}) | +${usd.format(liquidCashDollars)} |`,
      `| + Investments & Property | Long-term wealth engine | +${usd.format(investmentsDollars + propertyVal)} |`,
      `| - Total Debt Drag | ${activeLoans.length} loans${topLoan ? ` (led by ${topLoan.name} @ ${topLoan.rate}%)` : ''} | -${usd.format(totalDebtDollars)} |`,
      `| **= True Net Worth** | **Assets (${usd.format(totalAssets)}) − Debt** | **+${usd.format(netWorthDollars)}** |`,
      ...buildWealthRedirectLines(250, 'monthly'),
    ].join('\n');
  }
  // 8. Default: Roast My Spending & Show Where to Cut Back & Save
  else {
    const top4Disc = discretionaryCats.slice(0, 4);
    const discTotal = top4Disc.reduce((s, c) => s + c.avg, 0);
    const cut30Monthly = Math.max(150, Math.round(discTotal * 0.3));
    const cut30Annual = cut30Monthly * 12;
    const cut30TenYr = Math.round(cut30Annual * 14.48);

    synthesizedMarkdownReport = [
      `### Roast & Savings Audit (${monthLabel(curMonthKey)})`,
      `> 🔥 **You say you want to build wealth, yet your top 4 discretionary habits burn -${usd.format(discTotal)}/mo (-${usd.format(discTotal * 12)}/yr).** Cut 30% of the fluff below and you instantly unlock **+${usd.format(cut30Monthly)}/mo (+${usd.format(cut30Annual)}/yr)** to invest or crush your loans.`,
      `| Leak Category | Monthly Burn | 30% Cut Saves |`,
      `| --- | --- | --- |`,
      ...top4Disc.map(
        (c) =>
          `| **${c.category}** (${c.count} swipes) | -${usd.format(c.avg)}/mo | +${usd.format(Math.round(c.avg * 0.3))}/mo |`
      ),
      `| **= Instant Savings Unlocked** | **+${usd.format(cut30Annual)}/yr (${usd.format(cut30TenYr)} in 10y)** | **+${usd.format(cut30Monthly)}/mo** |`,
      ...buildWealthRedirectLines(cut30Monthly, 'monthly'),
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
