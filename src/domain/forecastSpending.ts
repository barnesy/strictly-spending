import type { Account, RecurrenceInfo, Transaction } from '../types';
import type { ConsolidatedMerchant } from '../api/types';
import type { DestinationAccount, IncomeStream } from '../api/scenarios';
import {
  normalizeTimelineMerchantKey,
  formatCleanMerchantName,
  getPriorYearMonth,
  generateFutureMonths,
  NON_BILL_RETAIL_CANON_REGEX,
} from './forecast/merchantIdentity';
import {
  computeSafeCheckingBalances,
  isBillManuallyMarkedPaid,
  setBillManuallyMarkedPaid,
  getManualPaidBillTokens,
  type SafeCheckingBalanceSummary,
} from './forecast/safeToSpend';
import {
  getMerchantBillStatus,
  consolidateRecurringMerchants,
  type MerchantBillStatus,
} from './forecast/recurringDetection';
import {
  projectMonthlyIncome,
  getStreamPaycheckSchedule,
  computeIncomeProjections,
  type IncomeStreamProjection,
} from './forecast/incomeProjection';
import {
  computeCategoryProjections,
  type CategoryProjection,
} from './forecast/categoryProjection';

export {
  normalizeTimelineMerchantKey,
  formatCleanMerchantName,
  getPriorYearMonth,
  generateFutureMonths,
  NON_BILL_RETAIL_CANON_REGEX,
  computeSafeCheckingBalances,
  isBillManuallyMarkedPaid,
  setBillManuallyMarkedPaid,
  getManualPaidBillTokens,
  getMerchantBillStatus,
  consolidateRecurringMerchants,
  projectMonthlyIncome,
  getStreamPaycheckSchedule,
  computeIncomeProjections,
  computeCategoryProjections,
};
export type {
  SafeCheckingBalanceSummary,
  MerchantBillStatus,
  IncomeStreamProjection,
  CategoryProjection,
};

export interface ReconciledTimelineMatch {
  kind: 'bill' | 'income' | 'savings';
  expectedName: string;
  expectedAmount: number;
  expectedDay: number;
  actualAmount: number;
  actualDay: number;
  delta: number; // actualAmount - expectedAmount
}

export interface TimelineExpectedBill {
  merchantKey: string;
  displayName: string;
  canonicalKey: string;
  category: string;
  accountId?: number;
  accountName?: string;
  amount: number;
  expectedDay: number;
  isDelayed?: boolean;
  status?: 'upcoming' | 'filled';
  isManuallyMarkedPaid?: boolean;
  actualAmount?: number;
  actualDay?: number;
  actualDescription?: string;
  matchedTxnId?: number;
}

export interface TimelineExpectedIncome {
  streamId: string;
  streamName: string;
  accountName?: string;
  amount: number;
  expectedDay: number;
  frequency: string;
  isDelayed?: boolean;
  status?: 'upcoming' | 'filled';
  actualAmount?: number;
  actualDay?: number;
  actualDescription?: string;
  matchedTxnId?: number;
}

export interface TimelineExpectedSavings {
  destinationId: string;
  destinationName: string;
  accountType: string;
  sourceAccountId?: number;
  sourceAccountName?: string;
  amount: number;
  expectedDay: number;
  isDelayed?: boolean;
  status?: 'upcoming' | 'filled';
  actualAmount?: number;
  actualDay?: number;
  actualDescription?: string;
  matchedTxnId?: number;
}

export interface MonthTimelineReconciliation {
  upcomingBillsByDay: Map<number, TimelineExpectedBill[]>;
  upcomingIncomeByDay: Map<number, TimelineExpectedIncome[]>;
  upcomingSavingsByDay: Map<number, TimelineExpectedSavings[]>;
  allExpectedBills: TimelineExpectedBill[];
  allExpectedIncome: TimelineExpectedIncome[];
  allExpectedSavings: TimelineExpectedSavings[];
  allExpectedBillsByDay: Map<number, TimelineExpectedBill[]>;
  allExpectedIncomeByDay: Map<number, TimelineExpectedIncome[]>;
  allExpectedSavingsByDay: Map<number, TimelineExpectedSavings[]>;
  reconciledByTxnId: Map<number, ReconciledTimelineMatch>;
  reconciledBillsCount: number;
  totalExpectedBillsCount: number;
  reconciledBillsActualTotal: number;
  reconciledBillsExpectedTotal: number;
  reconciledPaydaysCount: number;
  totalExpectedPaydaysCount: number;
  reconciledIncomeActualTotal: number;
  reconciledIncomeExpectedTotal: number;
  reconciledSavingsCount: number;
  totalExpectedSavingsCount: number;
  reconciledSavingsActualTotal: number;
  reconciledSavingsExpectedTotal: number;
}

/**
 * Performs an educated-guess reconciliation between forecasted bills/paydays and actual transactions
 * in `monthKey`, eliminating duplicate merchant/stream variants and matching actuals that have
 * already filled in expected items.
 */
export function reconcileMonthTimeline({
  monthKey,
  daysInMonth,
  transactions,
  allMonthTransactions,
  consolidatedMerchants,
  recurrenceMap,
  incomeStreams = [],
  destinations = [],
  accounts = [],
  taxRate = 0,
  disabledCategories = [],
  enabledAccountIds,
  isCurrentMonth = false,
  todayDay = null,
}: {
  monthKey: string;
  daysInMonth: number;
  transactions: Transaction[];
  allMonthTransactions?: Transaction[];
  consolidatedMerchants: ConsolidatedMerchant[];
  recurrenceMap: Map<string, RecurrenceInfo>;
  incomeStreams?: IncomeStream[];
  destinations?: DestinationAccount[];
  accounts?: Account[];
  taxRate?: number;
  disabledCategories?: string[];
  enabledAccountIds?: number[];
  isCurrentMonth?: boolean;
  todayDay?: number | null;
}): MonthTimelineReconciliation {
  const disabledCats = new Set(disabledCategories);
  const activeModeAccounts = (accounts || []).filter((a) => a.enabled !== false);
  const enabledSet =
    enabledAccountIds !== undefined &&
    (enabledAccountIds.length > 0 || activeModeAccounts.length > 0)
      ? new Set(enabledAccountIds)
      : null;
  const isFilteringAccounts =
    enabledSet !== null &&
    (activeModeAccounts.length > 0
      ? enabledSet.size < activeModeAccounts.length
      : enabledSet.size > 0);
  const accountNameById = new Map(
    (accounts || [])
      .filter((a) => a.id !== undefined)
      .map((a) => [a.id!, a.name])
  );
  const reconciledByTxnId = new Map<number, ReconciledTimelineMatch>();

  // 1. Deduplicate consolidated recurring merchants into unique expected monthly charges
  interface CandidateBill {
    merchantKey: string;
    displayName: string;
    canonicalKey: string;
    category: string;
    accountId?: number;
    accountName?: string;
    amount: number;
    expectedDay: number;
    lastDate: string | null;
    avgPeriodDays: number;
  }

  const billByCanon = new Map<string, CandidateBill>();

  for (const m of consolidatedMerchants) {
    if (disabledCats.has(m.category) || (m.monthlyAverage || 0) <= 0) continue;
    const rawInfo = recurrenceMap.get(m.merchantKey);
    const billAccountId = m.accountId ?? rawInfo?.accountId;
    if (
      enabledSet &&
      (isFilteringAccounts
        ? billAccountId === undefined || !enabledSet.has(billAccountId)
        : billAccountId !== undefined && !enabledSet.has(billAccountId))
    ) {
      continue;
    }
    const info =
      rawInfo &&
      (billAccountId === undefined ||
        rawInfo.accountId === undefined ||
        rawInfo.accountId === billAccountId)
        ? rawInfo
        : undefined;
    const billAccountName = billAccountId !== undefined ? accountNameById.get(billAccountId) : undefined;
    const status = getMerchantBillStatus(
      m.merchantKey,
      monthKey,
      recurrenceMap,
      new Date(),
      billAccountId,
      m.lastDate
    );
    const lastDate = status.lastDate || m.lastDate || info?.lastDate || null;
    if (!lastDate) continue;

    const avgPeriodDays = info?.meanIntervalDays || 30;
    // Skip high-frequency everyday habits (e.g. coffee/grocery visited every few days)
    if (avgPeriodDays > 0 && avgPeriodDays < 16) continue;

    const parts = lastDate.split('-');
    const rawDay = parts.length === 3 ? Number(parts[2]) : 15;
    const expectedDay = Math.min(daysInMonth, Math.max(1, isNaN(rawDay) ? 15 : rawDay));

    const canon = normalizeTimelineMerchantKey(m.merchantKey) || m.merchantKey.toLowerCase();
    const canonKey = `${canon}::${billAccountId ?? 'any'}`;
    const existing = billByCanon.get(canonKey);

    if (!existing) {
      billByCanon.set(canonKey, {
        merchantKey: m.merchantKey,
        displayName: formatCleanMerchantName(m.merchantKey),
        canonicalKey: canon,
        category: m.category,
        accountId: billAccountId,
        accountName: billAccountName,
        amount: Math.round(m.monthlyAverage * 100) / 100,
        expectedDay,
        lastDate,
        avgPeriodDays,
      });
    } else {
      // Keep the most recent lastDate and average the expected amount if merged
      const isNewer = lastDate > (existing.lastDate || '');
      billByCanon.set(canonKey, {
        ...existing,
        merchantKey: isNewer ? m.merchantKey : existing.merchantKey,
        displayName: isNewer ? formatCleanMerchantName(m.merchantKey) : existing.displayName,
        accountId: (isNewer ? billAccountId : existing.accountId) ?? billAccountId ?? existing.accountId,
        accountName: (isNewer ? billAccountName : existing.accountName) ?? billAccountName ?? existing.accountName,
        amount: isNewer ? Math.round(m.monthlyAverage * 100) / 100 : existing.amount,
        expectedDay: isNewer ? expectedDay : existing.expectedDay,
        lastDate: isNewer ? lastDate : existing.lastDate,
      });
    }
  }

  // Secondary deduplication: merge bills in the same category and account with nearly identical amount (±10%) and day (±3 days)
  const dedupedBills: CandidateBill[] = [];
  for (const bill of billByCanon.values()) {
    const duplicate = dedupedBills.find(
      (b) =>
        b.category === bill.category &&
        b.accountId === bill.accountId &&
        Math.abs(b.expectedDay - bill.expectedDay) <= 3 &&
        b.amount >= 25 &&
        Math.abs(b.amount - bill.amount) / Math.max(1, b.amount) <= 0.1
    );
    if (!duplicate) {
      dedupedBills.push(bill);
    } else if ((bill.lastDate || '') > (duplicate.lastDate || '')) {
      duplicate.merchantKey = bill.merchantKey;
      duplicate.displayName = bill.displayName;
      duplicate.canonicalKey = bill.canonicalKey;
      duplicate.accountId = bill.accountId ?? duplicate.accountId;
      duplicate.accountName = bill.accountName ?? duplicate.accountName;
      duplicate.amount = bill.amount;
      duplicate.expectedDay = bill.expectedDay;
      duplicate.lastDate = bill.lastDate;
    } else if (duplicate.accountId === undefined && bill.accountId !== undefined) {
      duplicate.accountId = bill.accountId;
      duplicate.accountName = bill.accountName;
    }
  }

  // 2. Match actual spend transactions against deduplicated expected bills (1-to-1 best match)
  const actualSpendTxns = transactions.filter((t) => t.amount < 0);
  interface BillMatchCandidate {
    billIdx: number;
    txn: Transaction;
    score: number;
  }
  const billCandidates: BillMatchCandidate[] = [];

  dedupedBills.forEach((bill, billIdx) => {
    for (const t of actualSpendTxns) {
      if (bill.accountId !== undefined && t.accountId !== undefined && t.accountId !== bill.accountId) {
        continue;
      }
      const absAmt = Math.abs(t.amount);
      const tDay = Number(t.date.split('-')[2]) || 1;
      const dayDiff = Math.abs(tDay - bill.expectedDay);
      const relAmtDiff = Math.abs(absAmt - bill.amount) / Math.max(1, bill.amount);
      const absAmtDiff = Math.abs(absAmt - bill.amount);

      const tCanon = normalizeTimelineMerchantKey(t.merchantKey || t.description);
      const exactCanon = tCanon.length >= 2 && tCanon === bill.canonicalKey;
      const substringCanon =
        tCanon.length >= 4 &&
        bill.canonicalKey.length >= 4 &&
        (tCanon.includes(bill.canonicalKey) || bill.canonicalKey.includes(tCanon));
      const firstWordMatch =
        tCanon.split(' ')[0]?.length >= 4 &&
        tCanon.split(' ')[0] === bill.canonicalKey.split(' ')[0] &&
        t.category === bill.category;

      if (exactCanon || substringCanon || firstWordMatch) {
        if (relAmtDiff <= 0.6 || absAmtDiff <= 75 || (exactCanon && dayDiff <= 10)) {
          const score =
            (exactCanon ? 100 : 85) -
            Math.min(20, relAmtDiff * 25) -
            Math.min(15, dayDiff * 0.5);
          billCandidates.push({ billIdx, txn: t, score });
        }
      } else if (
        t.category === bill.category &&
        dayDiff <= 6 &&
        (relAmtDiff <= 0.18 || absAmtDiff <= 12)
      ) {
        const score = 70 - relAmtDiff * 30 - dayDiff * 1.5;
        billCandidates.push({ billIdx, txn: t, score });
      }
    }
  });

  billCandidates.sort((a, b) => b.score - a.score);

  const matchedBillIndices = new Set<number>();
  const matchedBillInfoByIdx = new Map<
    number,
    { actualAmount: number; actualDay: number; actualDescription: string; matchedTxnId?: number; isManual?: boolean }
  >();
  const matchedSpendTxnIds = new Set<number>();
  let reconciledBillsActualTotal = 0;
  let reconciledBillsExpectedTotal = 0;

  for (const cand of billCandidates) {
    if (matchedBillIndices.has(cand.billIdx)) continue;
    if (cand.txn.id !== undefined && matchedSpendTxnIds.has(cand.txn.id)) continue;

    const bill = dedupedBills[cand.billIdx];
    const actualAmt = Math.round(Math.abs(cand.txn.amount) * 100) / 100;
    const actualDay = Number(cand.txn.date.split('-')[2]) || bill.expectedDay;

    matchedBillIndices.add(cand.billIdx);
    matchedBillInfoByIdx.set(cand.billIdx, {
      actualAmount: actualAmt,
      actualDay,
      actualDescription: cand.txn.description,
      matchedTxnId: cand.txn.id,
    });
    if (cand.txn.id !== undefined) {
      matchedSpendTxnIds.add(cand.txn.id);
      reconciledByTxnId.set(cand.txn.id, {
        kind: 'bill',
        expectedName: bill.displayName,
        expectedAmount: bill.amount,
        expectedDay: bill.expectedDay,
        actualAmount: actualAmt,
        actualDay,
        delta: Math.round((actualAmt - bill.amount) * 100) / 100,
      });
    }
    reconciledBillsActualTotal += actualAmt;
    reconciledBillsExpectedTotal += bill.amount;
  }

  // Also honor user manual "Mark Paid" overrides for bills that didn't match a posted transaction
  dedupedBills.forEach((bill, idx) => {
    if (matchedBillIndices.has(idx)) return;
    if (isBillManuallyMarkedPaid(monthKey, bill.merchantKey, bill.accountId)) {
      matchedBillIndices.add(idx);
      matchedBillInfoByIdx.set(idx, {
        actualAmount: bill.amount,
        actualDay: bill.expectedDay,
        actualDescription: 'Marked Paid Manually',
        isManual: true,
      });
      reconciledBillsActualTotal += bill.amount;
      reconciledBillsExpectedTotal += bill.amount;
    }
  });

  // Build upcoming (unmatched) bills by day and full expected bills list for current month
  const upcomingBillsByDay = new Map<number, TimelineExpectedBill[]>();
  const allExpectedBills: TimelineExpectedBill[] = [];
  const allExpectedBillsByDay = new Map<number, TimelineExpectedBill[]>();
  let unpaidBillsIncluded = 0;

  dedupedBills.forEach((bill, idx) => {
    const matchedInfo = matchedBillInfoByIdx.get(idx);
    if (matchedInfo) {
      const actualTargetDay = Math.min(daysInMonth, Math.max(1, matchedInfo.actualDay));
      const expectedTargetDay = Math.min(daysInMonth, Math.max(1, bill.expectedDay));
      const item: TimelineExpectedBill = {
        merchantKey: bill.merchantKey,
        displayName: bill.displayName,
        canonicalKey: bill.canonicalKey,
        category: bill.category,
        accountId: bill.accountId,
        accountName: bill.accountName,
        amount: bill.amount,
        expectedDay: bill.expectedDay,
        status: 'filled',
        isManuallyMarkedPaid: Boolean(matchedInfo.isManual),
        actualAmount: matchedInfo.actualAmount,
        actualDay: matchedInfo.actualDay,
        actualDescription: matchedInfo.actualDescription,
        matchedTxnId: matchedInfo.matchedTxnId,
      };
      allExpectedBills.push(item);
      const dayList = allExpectedBillsByDay.get(actualTargetDay) || [];
      dayList.push(item);
      allExpectedBillsByDay.set(actualTargetDay, dayList);
      if (expectedTargetDay !== actualTargetDay) {
        const expList = allExpectedBillsByDay.get(expectedTargetDay) || [];
        expList.push(item);
        allExpectedBillsByDay.set(expectedTargetDay, expList);
      }
      return;
    }

    if (!isCurrentMonth) return;
    // Skip if recurrenceMap already recorded a payment in this month from another filtered view
    if (bill.lastDate && bill.lastDate.startsWith(monthKey)) return;

    const isDelayed = todayDay !== null && bill.expectedDay < todayDay;
    const targetDay = Math.min(daysInMonth, Math.max(1, bill.expectedDay));
    const item: TimelineExpectedBill = {
      merchantKey: bill.merchantKey,
      displayName: bill.displayName,
      canonicalKey: bill.canonicalKey,
      category: bill.category,
      accountId: bill.accountId,
      accountName: bill.accountName,
      amount: bill.amount,
      expectedDay: bill.expectedDay,
      isDelayed,
      status: 'upcoming',
      isManuallyMarkedPaid: false,
    };

    const list = upcomingBillsByDay.get(targetDay) || [];
    list.push(item);
    upcomingBillsByDay.set(targetDay, list);

    allExpectedBills.push(item);
    const allList = allExpectedBillsByDay.get(targetDay) || [];
    allList.push(item);
    allExpectedBillsByDay.set(targetDay, allList);
    unpaidBillsIncluded++;
  });

  allExpectedBills.sort((a, b) => a.expectedDay - b.expectedDay || b.amount - a.amount);

  // 3. Deduplicate & reconcile expected income paydays against actual income transactions
  const rawActiveStreams = incomeStreams.filter(
    (s) =>
      s.enabled &&
      (!enabledSet ||
        (isFilteringAccounts
          ? s.accountId !== undefined && enabledSet.has(s.accountId)
          : s.accountId === undefined || enabledSet.has(s.accountId)))
  );

  // Deduplicate streams by canonical name + accountId
  const uniqueStreams: IncomeStream[] = [];
  const seenStreamKeys = new Set<string>();
  for (const s of rawActiveStreams) {
    const key = `${normalizeTimelineMerchantKey(s.name)}-${s.accountId ?? 'any'}`;
    if (!seenStreamKeys.has(key)) {
      seenStreamKeys.add(key);
      uniqueStreams.push(s);
    }
  }

  interface ExpectedPaydayInstance {
    stream: IncomeStream;
    canonicalStream: string;
    expectedDay: number;
    amount: number;
  }

  const expectedPaydays: ExpectedPaydayInstance[] = [];
  for (const stream of uniqueStreams) {
    const schedule = getStreamPaycheckSchedule(stream, monthKey, taxRate);
    if (schedule.netPerPaycheck <= 0) continue;
    const days = schedule.expectedDates
      .map((dStr) => Number(dStr.split('-')[2]))
      .filter((d) => !isNaN(d) && d >= 1 && d <= daysInMonth);

    for (const d of days) {
      expectedPaydays.push({
        stream,
        canonicalStream: normalizeTimelineMerchantKey(stream.name),
        expectedDay: d,
        amount: Math.round(schedule.netPerPaycheck * 100) / 100,
      });
    }
  }

  const actualIncomeTxns = transactions.filter((t) => t.amount > 0);
  interface IncomeMatchCandidate {
    paydayIdx: number;
    txn: Transaction;
    score: number;
  }
  const incomeCandidates: IncomeMatchCandidate[] = [];

  expectedPaydays.forEach((pd, paydayIdx) => {
    for (const t of actualIncomeTxns) {
      const tDay = Number(t.date.split('-')[2]) || 1;
      const dayDiff = Math.abs(tDay - pd.expectedDay);
      const relAmtDiff = Math.abs(t.amount - pd.amount) / Math.max(1, pd.amount);
      const tCanon = normalizeTimelineMerchantKey(t.merchantKey || t.description);

      const nameMatches =
        (pd.canonicalStream.length >= 3 &&
          tCanon.length >= 3 &&
          (tCanon.includes(pd.canonicalStream) || pd.canonicalStream.includes(tCanon))) ||
        pd.stream.id === 'stream-default';

      const accountMatches = pd.stream.accountId === undefined || t.accountId === pd.stream.accountId;

      if (nameMatches && dayDiff <= 8 && relAmtDiff <= 0.45) {
        const score = 100 - dayDiff * 3 - relAmtDiff * 25;
        incomeCandidates.push({ paydayIdx, txn: t, score });
      } else if (accountMatches && dayDiff <= 6 && relAmtDiff <= 0.3) {
        const score = 80 - dayDiff * 3 - relAmtDiff * 30;
        incomeCandidates.push({ paydayIdx, txn: t, score });
      }
    }
  });

  incomeCandidates.sort((a, b) => b.score - a.score);

  const matchedPaydayIndices = new Set<number>();
  const matchedPaydayInfoByIdx = new Map<
    number,
    { actualAmount: number; actualDay: number; actualDescription: string; matchedTxnId?: number }
  >();
  const matchedIncomeTxnIds = new Set<number>();
  let reconciledIncomeActualTotal = 0;
  let reconciledIncomeExpectedTotal = 0;

  for (const cand of incomeCandidates) {
    if (matchedPaydayIndices.has(cand.paydayIdx)) continue;
    if (cand.txn.id !== undefined && matchedIncomeTxnIds.has(cand.txn.id)) continue;

    const pd = expectedPaydays[cand.paydayIdx];
    const actualAmt = Math.round(cand.txn.amount * 100) / 100;
    const actualDay = Number(cand.txn.date.split('-')[2]) || pd.expectedDay;

    matchedPaydayIndices.add(cand.paydayIdx);
    matchedPaydayInfoByIdx.set(cand.paydayIdx, {
      actualAmount: actualAmt,
      actualDay,
      actualDescription: cand.txn.description,
      matchedTxnId: cand.txn.id,
    });
    if (cand.txn.id !== undefined) {
      matchedIncomeTxnIds.add(cand.txn.id);
      reconciledByTxnId.set(cand.txn.id, {
        kind: 'income',
        expectedName: pd.stream.name,
        expectedAmount: pd.amount,
        expectedDay: pd.expectedDay,
        actualAmount: actualAmt,
        actualDay,
        delta: Math.round((actualAmt - pd.amount) * 100) / 100,
      });
    }
    reconciledIncomeActualTotal += actualAmt;
    reconciledIncomeExpectedTotal += pd.amount;
  }

  const upcomingIncomeByDay = new Map<number, TimelineExpectedIncome[]>();
  const allExpectedIncome: TimelineExpectedIncome[] = [];
  const allExpectedIncomeByDay = new Map<number, TimelineExpectedIncome[]>();
  let unpaidPaydaysIncluded = 0;

  expectedPaydays.forEach((pd, idx) => {
    const matchedInfo = matchedPaydayInfoByIdx.get(idx);
    if (matchedInfo) {
      const targetDay = Math.min(daysInMonth, Math.max(1, matchedInfo.actualDay));
      const item: TimelineExpectedIncome = {
        streamId: pd.stream.id,
        streamName: pd.stream.name,
        accountName: pd.stream.accountName,
        amount: pd.amount,
        expectedDay: pd.expectedDay,
        frequency: pd.stream.frequency || 'monthly',
        status: 'filled',
        actualAmount: matchedInfo.actualAmount,
        actualDay: matchedInfo.actualDay,
        actualDescription: matchedInfo.actualDescription,
        matchedTxnId: matchedInfo.matchedTxnId,
      };
      allExpectedIncome.push(item);
      const dayList = allExpectedIncomeByDay.get(targetDay) || [];
      dayList.push(item);
      allExpectedIncomeByDay.set(targetDay, dayList);
      return;
    }

    if (!isCurrentMonth) return;

    const isDelayed = todayDay !== null && pd.expectedDay < todayDay;
    const targetDay = Math.min(daysInMonth, Math.max(1, pd.expectedDay));
    const item: TimelineExpectedIncome = {
      streamId: pd.stream.id,
      streamName: pd.stream.name,
      accountName: pd.stream.accountName,
      amount: pd.amount,
      expectedDay: pd.expectedDay,
      frequency: pd.stream.frequency || 'monthly',
      isDelayed,
      status: 'upcoming',
    };
    const list = upcomingIncomeByDay.get(targetDay) || [];
    list.push(item);
    upcomingIncomeByDay.set(targetDay, list);

    allExpectedIncome.push(item);
    const allList = allExpectedIncomeByDay.get(targetDay) || [];
    allList.push(item);
    allExpectedIncomeByDay.set(targetDay, allList);
    unpaidPaydaysIncluded++;
  });

  allExpectedIncome.sort((a, b) => a.expectedDay - b.expectedDay || b.amount - a.amount);

  // 4. Schedule & reconcile Forecasted Savings / Investment Transfers out of operating cash accounts
  const upcomingSavingsByDay = new Map<number, TimelineExpectedSavings[]>();
  const allExpectedSavings: TimelineExpectedSavings[] = [];
  const allExpectedSavingsByDay = new Map<number, TimelineExpectedSavings[]>();
  let reconciledSavingsCount = 0;
  let unpaidSavingsIncluded = 0;
  let reconciledSavingsActualTotal = 0;
  let reconciledSavingsExpectedTotal = 0;

  const enabledAccounts = (accounts || []).filter((a) => a.enabled !== false);
  const checkingOnlyAccounts = enabledAccounts.filter((a) => a.type === 'checking');
  const operatingCashAccounts =
    checkingOnlyAccounts.length > 0
      ? checkingOnlyAccounts
      : enabledAccounts.filter((a) => a.type === 'checking' || a.type === 'savings');
  const operatingAccountIds = new Set(
    operatingCashAccounts.map((a) => a.id).filter((id): id is number => id !== undefined)
  );
  const scopedOperatingAccounts = enabledSet
    ? operatingCashAccounts.filter((a) => a.id !== undefined && enabledSet.has(a.id))
    : operatingCashAccounts;

  const getAccountAllocForDest = (dest: DestinationAccount, acc: Account): number => {
    const allocs = dest.sourceAllocations || {};
    if (acc.id !== undefined && allocs[String(acc.id)] !== undefined) {
      return Math.max(0, Number(allocs[String(acc.id)] || 0));
    }
    const combined = `${acc.name || ''} ${acc.institution || ''} ${acc.last4 || ''}`.toLowerCase();
    const legacyKey = /\b6669\b/.test(combined)
      ? 'boa'
      : /\b5463\b/.test(combined)
      ? 'truist'
      : !/\b\d{4}\b/.test(combined) && /bank\s*of\s*america|\bboa\b|bofa/.test(combined)
      ? 'boa'
      : !/\b\d{4}\b/.test(combined) && /truist/.test(combined)
      ? 'truist'
      : null;
    if (legacyKey && allocs[legacyKey] !== undefined) {
      return Math.max(0, Number(allocs[legacyKey] || 0));
    }
    return 0;
  };

  interface SavingsAllocationGroup {
    groupIndex: number;
    dest: DestinationAccount;
    sourceAccount?: Account;
    monthlyAllocation: number;
  }

  const allocationGroups: SavingsAllocationGroup[] = [];
  const activeDestinations = (destinations || []).filter(
    (d) =>
      d.enabled &&
      (d.monthlyAllocation || 0) > 0 &&
      (d.accountId === undefined || !operatingAccountIds.has(d.accountId))
  );

  for (const dest of activeDestinations) {
    let matchedAnyAccount = false;
    for (const acc of scopedOperatingAccounts) {
      const alloc = getAccountAllocForDest(dest, acc);
      if (alloc > 0) {
        matchedAnyAccount = true;
        allocationGroups.push({
          groupIndex: allocationGroups.length,
          dest,
          sourceAccount: acc,
          monthlyAllocation: alloc,
        });
      }
    }
    const hasAnyConfiguredSource =
      dest.sourceAllocations &&
      Object.values(dest.sourceAllocations).some((v) => Number(v || 0) > 0);
    const defaultOperatingAccount = operatingCashAccounts[0];
    const defaultAccountAllowed =
      !enabledSet ||
      (defaultOperatingAccount?.id !== undefined && enabledSet.has(defaultOperatingAccount.id));
    if (!matchedAnyAccount && !hasAnyConfiguredSource && defaultOperatingAccount && defaultAccountAllowed) {
      allocationGroups.push({
        groupIndex: allocationGroups.length,
        dest,
        sourceAccount: defaultOperatingAccount,
        monthlyAllocation: dest.monthlyAllocation || 0,
      });
    }
  }

  interface ExpectedSavingsInstallment {
    groupIndex: number;
    dest: DestinationAccount;
    sourceAccount?: Account;
    expectedDay: number;
    amount: number;
  }

  const expectedSavingsInstallments: ExpectedSavingsInstallment[] = [];
  const allMonthPaydayDays = Array.from(new Set(expectedPaydays.map((pd) => pd.expectedDay))).sort(
    (a, b) => a - b
  );

  for (const grp of allocationGroups) {
    const accountPaydays = grp.sourceAccount?.id !== undefined
      ? Array.from(
          new Set(
            expectedPaydays
              .filter((pd) => pd.stream.accountId === grp.sourceAccount!.id)
              .map((pd) => pd.expectedDay)
          )
        ).sort((a, b) => a - b)
      : [];

    const candidateDays =
      accountPaydays.length > 0
        ? accountPaydays
        : allMonthPaydayDays.length > 0
        ? allMonthPaydayDays
        : grp.monthlyAllocation >= 1000
        ? [Math.min(daysInMonth, 15), daysInMonth]
        : [Math.min(daysInMonth, 15)];

    const installmentDays = candidateDays.slice(0, 2);
    if (installmentDays.length === 1) {
      expectedSavingsInstallments.push({
        groupIndex: grp.groupIndex,
        dest: grp.dest,
        sourceAccount: grp.sourceAccount,
        expectedDay: installmentDays[0],
        amount: Math.round(grp.monthlyAllocation * 100) / 100,
      });
    } else if (installmentDays.length >= 2) {
      const firstHalf = Math.round((grp.monthlyAllocation / 2) * 100) / 100;
      const secondHalf = Math.round((grp.monthlyAllocation - firstHalf) * 100) / 100;
      expectedSavingsInstallments.push({
        groupIndex: grp.groupIndex,
        dest: grp.dest,
        sourceAccount: grp.sourceAccount,
        expectedDay: installmentDays[0],
        amount: firstHalf,
      });
      expectedSavingsInstallments.push({
        groupIndex: grp.groupIndex,
        dest: grp.dest,
        sourceAccount: grp.sourceAccount,
        expectedDay: installmentDays[1],
        amount: secondHalf,
      });
    }
  }

  if (expectedSavingsInstallments.length > 0) {
    const rawTxnsPool = allMonthTransactions || transactions;
    const operatingCredits = rawTxnsPool.filter(
      (t) =>
        t.amount > 0 &&
        (t.accountId === undefined || operatingAccountIds.size === 0 || operatingAccountIds.has(t.accountId))
    );

    const candidateSavingsTxns = rawTxnsPool.filter((t) => {
      if (t.amount >= 0 || Math.abs(t.amount) < 100) return false;
      if (enabledSet && t.accountId !== undefined && !enabledSet.has(t.accountId)) return false;
      if (operatingAccountIds.size > 0 && t.accountId !== undefined && !operatingAccountIds.has(t.accountId)) {
        return false;
      }
      const catLower = (t.category || '').toLowerCase();
      const desc = t.description || '';
      const isTransferCatOrDesc =
        catLower.includes('transfer') ||
        /\btransfer\b|to\s+savings|to\s+3234|fidelity|robinhood|vanguard|schwab/i.test(desc);
      if (!isTransferCatOrDesc) return false;

      if (
        /credit\s*card|crd\s*\d|card\s*bill|venmo|zelle|cash\s*app|paypal|greenlight|gas\s*south|georgia\s*power|dekalb|mortgage|mobile\s*banking\s*payment|transfer\s+to\s+checking|transfer\s+to\s+5463|transfer\s+to\s+1770|transfer\s+to\s+6669/i.test(
          desc
        )
      ) {
        return false;
      }

      const tDay = Number(t.date.split('-')[2]) || 1;
      const absAmt = Math.abs(t.amount);
      const hasOppositeOperatingCredit = operatingCredits.some((c) => {
        if (c.accountId === t.accountId) return false;
        const cDay = Number(c.date.split('-')[2]) || 1;
        return Math.abs(c.amount - absAmt) < 0.01 && Math.abs(cDay - tDay) <= 3;
      });
      if (hasOppositeOperatingCredit) return false;

      return true;
    });

    interface SavingsMatchCandidate {
      instIdx: number;
      txn: Transaction;
      score: number;
    }
    const savingsCandidates: SavingsMatchCandidate[] = [];

    expectedSavingsInstallments.forEach((inst, instIdx) => {
      for (const t of candidateSavingsTxns) {
        if (inst.sourceAccount?.id !== undefined && t.accountId !== inst.sourceAccount.id) {
          continue;
        }
        const tDay = Number(t.date.split('-')[2]) || 1;
        const dayDiff = Math.abs(tDay - inst.expectedDay);
        const absAmt = Math.abs(t.amount);
        const relAmtDiff = Math.abs(absAmt - inst.amount) / Math.max(1, inst.amount);
        if (dayDiff <= 12) {
          const score = 100 - dayDiff * 3 - Math.min(35, relAmtDiff * 20);
          savingsCandidates.push({ instIdx, txn: t, score });
        }
      }
    });

    savingsCandidates.sort((a, b) => b.score - a.score);

    const matchedInstIndices = new Set<number>();
    const matchedSavingsInfoByIdx = new Map<
      number,
      { actualAmount: number; actualDay: number; actualDescription: string; matchedTxnId?: number }
    >();
    const matchedSavingsTxnIds = new Set<number>();
    const actualSumByGroup = new Map<number, number>();

    for (const cand of savingsCandidates) {
      if (matchedInstIndices.has(cand.instIdx)) continue;
      if (cand.txn.id !== undefined && matchedSavingsTxnIds.has(cand.txn.id)) continue;

      const inst = expectedSavingsInstallments[cand.instIdx];
      const actualAmt = Math.round(Math.abs(cand.txn.amount) * 100) / 100;
      const actualDay = Number(cand.txn.date.split('-')[2]) || inst.expectedDay;

      matchedInstIndices.add(cand.instIdx);
      matchedSavingsInfoByIdx.set(cand.instIdx, {
        actualAmount: actualAmt,
        actualDay,
        actualDescription: cand.txn.description,
        matchedTxnId: cand.txn.id,
      });
      actualSumByGroup.set(
        inst.groupIndex,
        (actualSumByGroup.get(inst.groupIndex) || 0) + actualAmt
      );
      if (cand.txn.id !== undefined) {
        matchedSavingsTxnIds.add(cand.txn.id);
        reconciledByTxnId.set(cand.txn.id, {
          kind: 'savings',
          expectedName: inst.dest.name,
          expectedAmount: inst.amount,
          expectedDay: inst.expectedDay,
          actualAmount: actualAmt,
          actualDay,
          delta: Math.round((actualAmt - inst.amount) * 100) / 100,
        });
      }
      reconciledSavingsActualTotal += actualAmt;
      reconciledSavingsExpectedTotal += inst.amount;
      reconciledSavingsCount++;
    }

    const remainingBudgetByGroup = new Map<number, number>();
    for (const grp of allocationGroups) {
      const actualSoFar = actualSumByGroup.get(grp.groupIndex) || 0;
      remainingBudgetByGroup.set(
        grp.groupIndex,
        Math.max(0, Math.round((grp.monthlyAllocation - actualSoFar) * 100) / 100)
      );
    }

    expectedSavingsInstallments.forEach((inst, idx) => {
      const matchedInfo = matchedSavingsInfoByIdx.get(idx);
      if (matchedInfo) {
        const targetDay = Math.min(daysInMonth, Math.max(1, matchedInfo.actualDay));
        const item: TimelineExpectedSavings = {
          destinationId: inst.dest.id,
          destinationName: inst.dest.name,
          accountType: inst.dest.accountType || 'savings',
          sourceAccountId: inst.sourceAccount?.id,
          sourceAccountName: inst.sourceAccount?.name,
          amount: matchedInfo.actualAmount,
          expectedDay: inst.expectedDay,
          status: 'filled',
          actualAmount: matchedInfo.actualAmount,
          actualDay: matchedInfo.actualDay,
          actualDescription: matchedInfo.actualDescription,
          matchedTxnId: matchedInfo.matchedTxnId,
        };
        allExpectedSavings.push(item);
        const dayList = allExpectedSavingsByDay.get(targetDay) || [];
        dayList.push(item);
        allExpectedSavingsByDay.set(targetDay, dayList);
        return;
      }

      if (!isCurrentMonth) return;

      const groupRem = remainingBudgetByGroup.get(inst.groupIndex) || 0;
      if (groupRem <= 0) return;

      const effectiveAmt = Math.min(inst.amount, groupRem);
      remainingBudgetByGroup.set(
        inst.groupIndex,
        Math.max(0, Math.round((groupRem - effectiveAmt) * 100) / 100)
      );

      const isDelayed = todayDay !== null && inst.expectedDay < todayDay;
      const targetDay = Math.min(daysInMonth, Math.max(1, inst.expectedDay));
      const item: TimelineExpectedSavings = {
        destinationId: inst.dest.id,
        destinationName: inst.dest.name,
        accountType: inst.dest.accountType || 'savings',
        sourceAccountId: inst.sourceAccount?.id,
        sourceAccountName: inst.sourceAccount?.name,
        amount: effectiveAmt,
        expectedDay: inst.expectedDay,
        isDelayed,
        status: 'upcoming',
      };
      const list = upcomingSavingsByDay.get(targetDay) || [];
      list.push(item);
      upcomingSavingsByDay.set(targetDay, list);

      allExpectedSavings.push(item);
      const allList = allExpectedSavingsByDay.get(targetDay) || [];
      allList.push(item);
      allExpectedSavingsByDay.set(targetDay, allList);
      unpaidSavingsIncluded++;
    });

    allExpectedSavings.sort((a, b) => a.expectedDay - b.expectedDay || b.amount - a.amount);
  }

  return {
    upcomingBillsByDay,
    upcomingIncomeByDay,
    upcomingSavingsByDay,
    allExpectedBills,
    allExpectedIncome,
    allExpectedSavings,
    allExpectedBillsByDay,
    allExpectedIncomeByDay,
    allExpectedSavingsByDay,
    reconciledByTxnId,
    reconciledBillsCount: matchedBillIndices.size,
    totalExpectedBillsCount: matchedBillIndices.size + (isCurrentMonth ? unpaidBillsIncluded : 0),
    reconciledBillsActualTotal: Math.round(reconciledBillsActualTotal * 100) / 100,
    reconciledBillsExpectedTotal: Math.round(reconciledBillsExpectedTotal * 100) / 100,
    reconciledPaydaysCount: matchedPaydayIndices.size,
    totalExpectedPaydaysCount: matchedPaydayIndices.size + (isCurrentMonth ? unpaidPaydaysIncluded : 0),
    reconciledIncomeActualTotal: Math.round(reconciledIncomeActualTotal * 100) / 100,
    reconciledIncomeExpectedTotal: Math.round(reconciledIncomeExpectedTotal * 100) / 100,
    reconciledSavingsCount,
    totalExpectedSavingsCount: reconciledSavingsCount + (isCurrentMonth ? unpaidSavingsIncluded : 0),
    reconciledSavingsActualTotal: Math.round(reconciledSavingsActualTotal * 100) / 100,
    reconciledSavingsExpectedTotal: Math.round(reconciledSavingsExpectedTotal * 100) / 100,
  };
}
