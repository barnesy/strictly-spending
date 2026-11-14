import type { RecurrenceInfo, Transaction } from '../../types';
import type { ConsolidatedMerchant } from '../../api/types';
import { normalizeTimelineMerchantKey, NON_BILL_RETAIL_CANON_REGEX } from './merchantIdentity';
import { isBillManuallyMarkedPaid } from './safeToSpend';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MerchantBillStatus {
  isPaidThisMonth: boolean;
  isManuallyMarkedPaid?: boolean;
  isExpectedThisMonth: boolean;
  lastDate: string | null;
  lastPaidShortLabel: string | null;
  expectedDate: string | null;
  expectedShortLabel: string | null;
  expectedDay: number | null;
  expectedDayOfMonth: number | null;
  daysSinceLastPaid: number | null;
  daysUntilDue: number | null;
  countdownText: string | null;
}

export function getMerchantBillStatus(
  merchantKey: string,
  targetMonthKey?: string,
  recurrenceMap?: Map<string, RecurrenceInfo>,
  referenceDate: Date = new Date(),
  accountId?: number,
  ownLastDate?: string | null
): MerchantBillStatus {
  const rawInfo = recurrenceMap?.get(merchantKey);
  const infoMatchesAccount =
    !rawInfo || accountId === undefined || rawInfo.accountId === undefined || rawInfo.accountId === accountId;
  let info = infoMatchesAccount ? rawInfo : undefined;
  let lastDate = ownLastDate || (infoMatchesAccount ? rawInfo?.lastDate || null : null);
  if (infoMatchesAccount && rawInfo?.lastDate && (!lastDate || rawInfo.lastDate > lastDate)) {
    lastDate = rawInfo.lastDate;
  }

  // Also check if another merchantKey variant with the same canonical stem on the same account has a newer lastDate
  if (recurrenceMap && merchantKey) {
    const targetCanon = normalizeTimelineMerchantKey(merchantKey);
    if (targetCanon.length >= 3) {
      for (const [k, v] of recurrenceMap.entries()) {
        if (!v?.lastDate) continue;
        if (accountId !== undefined && v.accountId !== undefined && v.accountId !== accountId) {
          continue;
        }
        if (k === merchantKey || normalizeTimelineMerchantKey(k) === targetCanon) {
          if (!lastDate || v.lastDate > lastDate) {
            lastDate = v.lastDate;
            info = v;
          }
        }
      }
    }
  }

  const manualPaid = isBillManuallyMarkedPaid(targetMonthKey, merchantKey, accountId);
  const isPaidThisMonth =
    manualPaid || Boolean(targetMonthKey && lastDate && lastDate.startsWith(targetMonthKey));
  const isStoppedOverride = info?.kind === 'none';

  let expectedDay: number | null = null;
  let lastPaidShortLabel: string | null = null;
  let expectedDate: string | null = null;
  let expectedShortLabel: string | null = null;
  let daysSinceLastPaid: number | null = null;
  let daysUntilDue: number | null = null;
  let countdownText: string | null = null;
  let missedPriorMonthCycle = false;

  const todayMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  if (lastDate) {
    const parts = lastDate.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const [lYear, lMonth, lDay] = parts;
      if (lDay >= 1 && lDay <= 31 && lMonth >= 1 && lMonth <= 12) {
        expectedDay = lDay;
        const mName = SHORT_MONTHS[lMonth - 1] || '';
        lastPaidShortLabel =
          lYear === todayMidnight.getFullYear()
            ? `${mName} ${lDay}`
            : `${mName} ${lDay}, ${lYear}`;

        const lastMidnight = new Date(lYear, lMonth - 1, lDay);
        daysSinceLastPaid = Math.max(
          0,
          Math.round((todayMidnight.getTime() - lastMidnight.getTime()) / 86_400_000)
        );

        // If evaluating the current month (or an earlier month) and a monthly merchant hasn't charged in >42 days
        // and skipped the entire preceding calendar month, do not treat it as an active monthly bill due this month.
        const refMonthKey = `${todayMidnight.getFullYear()}-${String(todayMidnight.getMonth() + 1).padStart(2, '0')}`;
        if (!targetMonthKey || targetMonthKey <= refMonthKey) {
          const [cmpY, cmpM] = (targetMonthKey || refMonthKey).split('-').map(Number);
          const monthGap = (cmpY - lYear) * 12 + (cmpM - lMonth);
          const cadence = info?.kind || 'monthly';
          if (cadence === 'monthly' && monthGap >= 2 && daysSinceLastPaid > 42) {
            missedPriorMonthCycle = true;
          }
        }
      }
    }
  }

  const isExpectedThisMonth = !isPaidThisMonth && !isStoppedOverride && !missedPriorMonthCycle && Boolean(lastDate);

  if (expectedDay !== null && targetMonthKey && targetMonthKey.includes('-')) {
    const [tYear, tMonth] = targetMonthKey.split('-').map(Number);
    if (!isNaN(tYear) && !isNaN(tMonth) && tMonth >= 1 && tMonth <= 12) {
      const maxDaysInTarget = new Date(tYear, tMonth, 0).getDate();
      const clampedDay = Math.min(maxDaysInTarget, Math.max(1, expectedDay));
      expectedDay = clampedDay;
      expectedDate = `${tYear}-${String(tMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
      expectedShortLabel = `${SHORT_MONTHS[tMonth - 1]} ${clampedDay}`;

      if (!isPaidThisMonth) {
        const expectedMidnight = new Date(tYear, tMonth - 1, clampedDay);
        daysUntilDue = Math.round(
          (expectedMidnight.getTime() - todayMidnight.getTime()) / 86_400_000
        );

        if (daysUntilDue > 1) {
          countdownText = `Due in ${daysUntilDue}d`;
        } else if (daysUntilDue === 1) {
          countdownText = 'Due tomorrow';
        } else if (daysUntilDue === 0) {
          countdownText = 'Due today';
        } else if (daysUntilDue === -1) {
          countdownText = '1d past usual date';
        } else {
          countdownText = `${Math.abs(daysUntilDue)}d past usual date`;
        }
      } else if (manualPaid && (!lastDate || !lastDate.startsWith(targetMonthKey))) {
        countdownText = 'Marked paid';
      } else if (lastPaidShortLabel) {
        countdownText = `Paid ${lastPaidShortLabel}`;
      }
    }
  }

  return {
    isPaidThisMonth,
    isManuallyMarkedPaid: manualPaid,
    isExpectedThisMonth,
    lastDate,
    lastPaidShortLabel,
    expectedDate,
    expectedShortLabel,
    expectedDay,
    expectedDayOfMonth: expectedDay,
    daysSinceLastPaid,
    daysUntilDue,
    countdownText,
  };
}

/**
 * Consolidates raw recurring merchant entries (from SQL `GROUP BY merchant_key, category`)
 * so CSV vs. SimpleFIN/Plaid variations unify into a single canonical recurring merchant entry
 * with the latest payment status.
 */
export function consolidateRecurringMerchants(
  merchants: ConsolidatedMerchant[],
  recurrenceMap?: Map<string, RecurrenceInfo>,
  currentMonthTransactions?: Transaction[],
  unitemizedHoldByAccountId?: Map<number, number>
): ConsolidatedMerchant[] {
  if (!merchants || merchants.length === 0) return [];

  interface ConsolidatedEntry {
    merchant: ConsolidatedMerchant;
    canon: string;
    lastDate: string;
    expectedDay: number;
  }

  const byCategoryAndCanon = new Map<string, ConsolidatedEntry>();

  for (const m of merchants) {
    if (!m.merchantKey || (m.monthlyAverage || 0) <= 0) continue;
    const canon = normalizeTimelineMerchantKey(m.merchantKey) || m.merchantKey.toLowerCase();
    const recInfo = recurrenceMap?.get(m.merchantKey);
    if ((recInfo?.kind as string | undefined) === 'none') continue;
    if (
      NON_BILL_RETAIL_CANON_REGEX.test(canon) &&
      !(recInfo?.source === 'override' && (recInfo?.kind as string | undefined) !== 'none')
    ) {
      continue;
    }

    const resolvedAccountId = m.accountId ?? recInfo?.accountId;
    const groupKey = `${m.category}::${canon}::${resolvedAccountId ?? 'any'}`;
    const status = getMerchantBillStatus(
      m.merchantKey,
      undefined,
      recurrenceMap,
      new Date(),
      resolvedAccountId,
      m.lastDate
    );
    const ownLastDate =
      m.lastDate ||
      (recInfo &&
      (resolvedAccountId === undefined ||
        recInfo.accountId === undefined ||
        recInfo.accountId === resolvedAccountId)
        ? recInfo.lastDate
        : undefined) ||
      status.lastDate ||
      '';
    const expectedDay = status.expectedDay ?? 15;

    const existing = byCategoryAndCanon.get(groupKey);
    if (!existing) {
      byCategoryAndCanon.set(groupKey, {
        merchant: { ...m, accountId: resolvedAccountId, lastDate: ownLastDate || m.lastDate },
        canon,
        lastDate: ownLastDate,
        expectedDay,
      });
    } else {
      const isNewer = ownLastDate > existing.lastDate;
      if (isNewer) {
        byCategoryAndCanon.set(groupKey, {
          merchant: {
            ...m,
            accountId: resolvedAccountId ?? existing.merchant.accountId,
            lastDate: ownLastDate || m.lastDate || existing.merchant.lastDate,
            monthlyAverage: m.monthlyAverage,
          },
          canon,
          lastDate: ownLastDate,
          expectedDay,
        });
      }
    }
  }

  // Secondary deduplication within the same category and account for nearly identical amount (±10%) and billing day (±3 days)
  const deduped: ConsolidatedEntry[] = [];
  for (const entry of byCategoryAndCanon.values()) {
    const dup = deduped.find(
      (e) =>
        e.merchant.category === entry.merchant.category &&
        e.merchant.accountId === entry.merchant.accountId &&
        Math.abs(e.expectedDay - entry.expectedDay) <= 3 &&
        e.merchant.monthlyAverage >= 25 &&
        Math.abs(e.merchant.monthlyAverage - entry.merchant.monthlyAverage) /
          Math.max(1, e.merchant.monthlyAverage) <=
          0.1
    );
    if (!dup) {
      deduped.push(entry);
    } else if (entry.lastDate > dup.lastDate) {
      dup.merchant = {
        ...entry.merchant,
        accountId: entry.merchant.accountId ?? dup.merchant.accountId,
      };
      dup.canon = entry.canon;
      dup.lastDate = entry.lastDate;
      dup.expectedDay = entry.expectedDay;
    } else if (dup.merchant.accountId === undefined && entry.merchant.accountId !== undefined) {
      dup.merchant = { ...dup.merchant, accountId: entry.merchant.accountId };
    }
  }

  // Reconcile current-month settled AND pending transactions 1-to-1 against recurring bills so neither
  // pending nor settled charges are ever double-counted as still-unpaid bills.
  const now = new Date();
  const sysMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = `${sysMonthPrefix}-${String(now.getDate()).padStart(2, '0')}`;

  if (currentMonthTransactions && currentMonthTransactions.length > 0) {
    const spendTxns = currentMonthTransactions
      .filter(
        (t) =>
          t.amount < 0 &&
          t.category !== 'Transfer' &&
          t.category !== 'Credit Card Payment'
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);

    const usedTxKeys = new Set<string | number>();
    const sortedEntries = [...deduped].sort(
      (a, b) => a.expectedDay - b.expectedDay || b.merchant.monthlyAverage - a.merchant.monthlyAverage
    );

    for (const entry of sortedEntries) {
      const expAmt = entry.merchant.monthlyAverage;
      let bestTx: Transaction | null = null;
      let bestScore = Infinity;

      for (let idx = 0; idx < spendTxns.length; idx++) {
        const tx = spendTxns[idx];
        const txKey = tx.id ?? `${tx.date}::${tx.amount}::${idx}`;
        if (usedTxKeys.has(txKey)) continue;
        if (
          entry.merchant.accountId !== undefined &&
          tx.accountId !== undefined &&
          entry.merchant.accountId !== tx.accountId
        ) {
          continue;
        }

        const txCanon = normalizeTimelineMerchantKey(tx.merchantKey || tx.description || '');
        const txAmt = Math.abs(tx.amount);
        const txDay = Number(tx.date.slice(8, 10)) || 1;
        const amtRatio = Math.abs(txAmt - expAmt) / Math.max(1, expAmt);
        const dayDiff = Math.abs(txDay - entry.expectedDay);

        const isCanonMatch =
          txCanon.length >= 3 &&
          entry.canon.length >= 3 &&
          (txCanon === entry.canon ||
            txCanon.includes(entry.canon) ||
            entry.canon.includes(txCanon));

        if (isCanonMatch && (amtRatio <= 0.65 || Math.abs(txAmt - expAmt) <= 35)) {
          const score = amtRatio * 10 + dayDiff * 0.25;
          if (score < bestScore) {
            bestScore = score;
            bestTx = tx;
          }
        } else if (
          !isCanonMatch &&
          tx.category === entry.merchant.category &&
          expAmt >= 25 &&
          amtRatio <= 0.12 &&
          dayDiff <= 5
        ) {
          const score = 20 + amtRatio * 20 + dayDiff;
          if (score < bestScore) {
            bestScore = score;
            bestTx = tx;
          }
        }
      }

      if (bestTx) {
        const winIdx = spendTxns.indexOf(bestTx);
        const winKey = bestTx.id ?? `${bestTx.date}::${bestTx.amount}::${winIdx}`;
        usedTxKeys.add(winKey);
        if (bestTx.date > entry.lastDate) {
          entry.lastDate = bestTx.date;
          entry.merchant = { ...entry.merchant, lastDate: bestTx.date };
        }
      }
    }
  }

  // Reconcile un-itemized bank holds (where SimpleFIN's available_balance has already deducted a due bill
  // before the bank itemizes the pending transaction row) so the bill is not subtracted a second time.
  if (unitemizedHoldByAccountId && unitemizedHoldByAccountId.size > 0) {
    const remainingHolds = new Map<number, number>(unitemizedHoldByAccountId);
    const todayDay = now.getDate();
    const dueEntries = [...deduped]
      .filter(
        (e) =>
          e.merchant.accountId !== undefined &&
          !e.lastDate.startsWith(sysMonthPrefix) &&
          e.expectedDay <= todayDay + 2 &&
          e.merchant.monthlyAverage >= 25
      )
      .sort((a, b) => a.expectedDay - b.expectedDay || b.merchant.monthlyAverage - a.merchant.monthlyAverage);

    for (const entry of dueEntries) {
      const acctId = entry.merchant.accountId!;
      const remHold = remainingHolds.get(acctId) || 0;
      if (remHold >= entry.merchant.monthlyAverage * 0.9) {
        remainingHolds.set(acctId, Math.max(0, remHold - entry.merchant.monthlyAverage));
        entry.lastDate = todayStr;
        entry.merchant = { ...entry.merchant, lastDate: todayStr };
      }
    }
  }

  return deduped
    .map((e) => e.merchant)
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage);
}
