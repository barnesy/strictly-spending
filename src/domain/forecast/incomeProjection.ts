import type { IncomeStream } from '../../api/scenarios';
import { getPriorYearMonth } from './merchantIdentity';

export interface IncomeStreamProjection {
  id: string;
  name: string;
  accountId?: number;
  accountName: string;
  category: string;
  color: string;
  frequency: 'monthly' | 'biweekly' | 'semimonthly' | 'weekly' | 'custom';
  paycheckAmount: number;
  grossMonthly: number;
  netMonthly: number;
  total: number;
  basis: 'recurring_stream' | 'last_year_month' | 'last_year_avg' | 'recent_avg' | 'actual_exceeded';
  lastDate: string | null;
  receivedToDate?: number;
  remaining?: number;
  receivedCount?: number;
  expectedCount?: number;
  upcomingDays: number[];
  nextExpectedDay: number | null;
}

export function projectMonthlyIncome({
  monthKey,
  historicalMonthlyIncome,
  historicalAnnualAvgIncome,
  recentAvgIncome = 0,
  recurringIncome = 0,
}: {
  monthKey?: string;
  historicalMonthlyIncome?: Map<string, number>;
  historicalAnnualAvgIncome?: number;
  recentAvgIncome?: number;
  recurringIncome?: number;
}): {
  amount: number;
  basis: 'recurring_stream' | 'last_year_month' | 'last_year_avg' | 'recent_avg' | 'none';
  priorYearMonth?: string;
} {
  // If employer recurring income or user-overridden stream exists, prioritize it as the recurring baseline!
  if (recurringIncome > 0) {
    return { amount: Math.round(recurringIncome), basis: 'recurring_stream' };
  }

  if (monthKey && historicalMonthlyIncome) {
    const priorYearMonth = getPriorYearMonth(monthKey);
    const priorIncome = historicalMonthlyIncome.get(priorYearMonth);
    if (priorIncome !== undefined && priorIncome > 0) {
      return { amount: Math.round(priorIncome), basis: 'last_year_month', priorYearMonth };
    }
  }

  if (historicalAnnualAvgIncome !== undefined && historicalAnnualAvgIncome > 0) {
    return { amount: Math.round(historicalAnnualAvgIncome), basis: 'last_year_avg' };
  }

  if (recentAvgIncome > 0) {
    return { amount: Math.round(recentAvgIncome), basis: 'recent_avg' };
  }

  return { amount: 0, basis: 'none' };
}

export function getStreamPaycheckSchedule(
  stream: IncomeStream & { lastPaymentDate?: string },
  targetMonthKey?: string,
  defaultTaxRate = 0
): {
  lastDate: string | null;
  receivedToDate: number;
  receivedCount: number;
  expectedCount: number;
  upcomingDays: number[];
  nextExpectedDay: number | null;
  paychecksInMonth: number;
  unpaidPaychecks: number;
  netPerPaycheck: number;
  expectedDates: string[];
} {
  const payments = stream.recentPayments || [];
  const lastDate = payments.length > 0 ? payments[0].date : stream.lastPaymentDate || null;
  const freq = stream.frequency || 'monthly';

  const effectiveRate = stream.isTaxed
    ? 0
    : stream.taxRate !== undefined
    ? stream.taxRate
    : defaultTaxRate > 0
    ? defaultTaxRate
    : 25;
  const netFactor = 1 - effectiveRate / 100;
  const grossMonthly = stream.monthlyAmount || 0;
  const paycheckGross =
    stream.paycheckAmount ||
    (freq === 'biweekly'
      ? (grossMonthly * 12) / 26
      : freq === 'weekly'
      ? (grossMonthly * 12) / 52
      : freq === 'semimonthly'
      ? grossMonthly / 2
      : grossMonthly);
  const netPerPaycheck = Math.round(paycheckGross * netFactor * 100) / 100;

  const defaultExpectedCount =
    freq === 'weekly' ? 4 : freq === 'biweekly' || freq === 'semimonthly' ? 2 : 1;

  if (!targetMonthKey || !targetMonthKey.includes('-')) {
    return {
      lastDate,
      receivedToDate: 0,
      receivedCount: 0,
      expectedCount: defaultExpectedCount,
      upcomingDays: [],
      nextExpectedDay: null,
      paychecksInMonth: defaultExpectedCount,
      unpaidPaychecks: defaultExpectedCount,
      netPerPaycheck,
      expectedDates: [],
    };
  }

  const [targetYear, targetMonth] = targetMonthKey.split('-').map(Number);
  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();

  const monthPayments = payments.filter((p) => p.date && p.date.startsWith(targetMonthKey));
  const receivedToDate = Math.round(monthPayments.reduce((sum, p) => sum + Math.abs(p.amount), 0));
  const receivedCount = monthPayments.length;

  const upcomingDays: number[] = [];
  const allMonthDays: number[] = [];

  if (lastDate) {
    const [ly, lm, ld] = lastDate.split('-').map(Number);
    if (!isNaN(ly) && !isNaN(lm) && !isNaN(ld)) {
      if (freq === 'biweekly' || freq === 'weekly') {
        const stepDays = freq === 'weekly' ? 7 : 14;
        const stepMs = stepDays * 86_400_000;
        // Use UTC noon to avoid DST off-by-one issues when stepping by 7/14 days
        let cursor = Date.UTC(ly, lm - 1, ld, 12, 0, 0);
        const targetStart = Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0);
        const targetEnd = Date.UTC(targetYear, targetMonth - 1, daysInTargetMonth, 23, 59, 59);

        // Fast-forward or rewind cursor to the first payday >= targetStart
        if (cursor < targetStart) {
          const stepsForward = Math.ceil((targetStart - cursor) / stepMs);
          cursor += stepsForward * stepMs;
        } else if (cursor > targetStart) {
          const stepsBack = Math.floor((cursor - targetStart) / stepMs);
          cursor -= stepsBack * stepMs;
        }

        while (cursor <= targetEnd) {
          if (cursor >= targetStart) {
            const d = new Date(cursor).getUTCDate();
            if (!allMonthDays.includes(d)) {
              allMonthDays.push(d);
            }
            const dateStr = `${targetMonthKey}-${String(d).padStart(2, '0')}`;
            const alreadyReceived = monthPayments.some((p) => p.date === dateStr) || (payments.length > 0 && dateStr <= lastDate);
            if (!alreadyReceived && !upcomingDays.includes(d)) {
              upcomingDays.push(d);
            }
          }
          cursor += stepMs;
        }
      } else if (freq === 'semimonthly') {
        const paymentDays = payments.map((p) => Number(p.date.split('-')[2] || 0)).filter((d) => d > 0);
        const hasEndOfMonthPattern =
          paymentDays.some((d) => d >= 27) ||
          ld >= 27 ||
          (ld >= 13 && ld <= 16 && !paymentDays.some((d) => d >= 1 && d <= 4));
        const hasFirstAndMidPattern =
          paymentDays.some((d) => d >= 1 && d <= 4) && paymentDays.some((d) => d >= 13 && d <= 16);

        let firstDay: number;
        let secondDay: number;
        if (hasFirstAndMidPattern) {
          firstDay = 1;
          secondDay = 15;
        } else if (hasEndOfMonthPattern) {
          firstDay = 15;
          secondDay = daysInTargetMonth;
        } else {
          firstDay = Math.min(ld, Math.max(1, ld > 15 ? ld - 15 : ld));
          secondDay = Math.min(daysInTargetMonth, firstDay + 15);
        }

        const candidateDays = [firstDay, secondDay];
        for (let idx = 0; idx < candidateDays.length; idx++) {
          const d = candidateDays[idx];
          if (!allMonthDays.includes(d)) allMonthDays.push(d);
          const dateStr = `${targetMonthKey}-${String(d).padStart(2, '0')}`;
          const alreadyPaidThisSlot =
            monthPayments.length >= 2 ||
            (monthPayments.length === 1 && idx === 0) ||
            (payments.length > 0 && dateStr <= lastDate);
          if (!alreadyPaidThisSlot && !upcomingDays.includes(d)) {
            upcomingDays.push(d);
          }
        }
      } else {
        const expectedDay = Math.min(daysInTargetMonth, Math.max(1, ld));
        allMonthDays.push(expectedDay);
        const dateStr = `${targetMonthKey}-${String(expectedDay).padStart(2, '0')}`;
        if (payments.length === 0 || dateStr > lastDate) {
          upcomingDays.push(expectedDay);
        }
      }
    }
  }

  upcomingDays.sort((a, b) => a - b);
  allMonthDays.sort((a, b) => a - b);
  const expectedCount =
    allMonthDays.length > 0
      ? Math.max(allMonthDays.length, receivedCount + upcomingDays.length)
      : receivedCount + upcomingDays.length > 0
      ? receivedCount + upcomingDays.length
      : defaultExpectedCount;

  const expectedDates = (allMonthDays.length > 0 ? allMonthDays : upcomingDays).map(
    (d) => `${targetMonthKey}-${String(d).padStart(2, '0')}`
  );
  const unpaidPaychecks = Math.max(0, upcomingDays.length);

  return {
    lastDate,
    receivedToDate,
    receivedCount,
    expectedCount,
    upcomingDays,
    nextExpectedDay: upcomingDays.length > 0 ? upcomingDays[0] : null,
    paychecksInMonth: expectedCount,
    unpaidPaychecks,
    netPerPaycheck,
    expectedDates,
  };
}

export function computeIncomeProjections({
  incomeStreams = [],
  taxRate = 0,
  targetMonthKey,
  historicalMonthlyIncome,
  historicalAnnualAvgIncome,
  recentAvgIncome = 0,
  actualIncomeToDate,
  enabledAccountIds,
  incomeCategoryColor = '#2e7d32',
}: {
  incomeStreams?: IncomeStream[];
  taxRate?: number;
  targetMonthKey?: string;
  historicalMonthlyIncome?: Map<string, number>;
  historicalAnnualAvgIncome?: number;
  recentAvgIncome?: number;
  actualIncomeToDate?: number;
  enabledAccountIds?: number[];
  incomeCategoryColor?: string;
}): IncomeStreamProjection[] {
  const hasActuals = actualIncomeToDate !== undefined;
  const enabledSet = enabledAccountIds && enabledAccountIds.length > 0 ? new Set(enabledAccountIds) : null;

  const activeStreams = incomeStreams.filter((s) => {
    if (!s.enabled) return false;
    if (enabledSet && s.accountId !== undefined && !enabledSet.has(s.accountId)) {
      return false;
    }
    return true;
  });

  const results: IncomeStreamProjection[] = [];

  if (activeStreams.length > 0) {
    let streamReceivedSum = 0;

    for (const s of activeStreams) {
      const grossMonthly = Math.round(s.monthlyAmount || 0);
      const effectiveRate = s.isTaxed ? 0 : (s.taxRate !== undefined ? s.taxRate : (taxRate > 0 ? taxRate : 25));
      const netFactor = 1 - effectiveRate / 100;
      const netMonthly = Math.round(grossMonthly * netFactor);
      const paycheckGross = s.paycheckAmount ?? grossMonthly;
      const paycheckNet = Math.round(paycheckGross * netFactor);

      const schedule = getStreamPaycheckSchedule(s, targetMonthKey);
      const received = hasActuals ? schedule.receivedToDate : undefined;
      if (hasActuals && received) {
        streamReceivedSum += received;
      }

      let remaining: number | undefined = undefined;
      if (hasActuals) {
        // Estimate remaining from either upcoming scheduled paychecks or monthly baseline minus received
        const upcomingFromPaychecks =
          schedule.upcomingDays.length > 0 && paycheckNet > 0
            ? schedule.upcomingDays.length * paycheckNet
            : 0;
        remaining = Math.max(
          0,
          upcomingFromPaychecks > 0 ? upcomingFromPaychecks : netMonthly - (received || 0)
        );
      }

      const calendarFutureTotal =
        !hasActuals &&
        schedule.paychecksInMonth > 0 &&
        paycheckNet > 0 &&
        (s.frequency === 'biweekly' || s.frequency === 'weekly' || s.frequency === 'semimonthly')
          ? Math.round(schedule.paychecksInMonth * paycheckNet)
          : netMonthly;
      const total = hasActuals ? (received || 0) + (remaining || 0) : calendarFutureTotal;

      if (total > 0 || (received || 0) > 0) {
        results.push({
          id: s.id,
          name: s.name,
          accountId: s.accountId,
          accountName: s.accountName || 'Checking',
          category: 'Income',
          color: incomeCategoryColor,
          frequency: s.frequency || 'monthly',
          paycheckAmount: paycheckNet,
          grossMonthly,
          netMonthly,
          total,
          basis: 'recurring_stream',
          lastDate: schedule.lastDate,
          ...(hasActuals
            ? {
                receivedToDate: received || 0,
                remaining: remaining || 0,
                receivedCount: schedule.receivedCount,
                expectedCount: schedule.expectedCount,
              }
            : {
                expectedCount: schedule.expectedCount,
              }),
          upcomingDays: schedule.upcomingDays,
          nextExpectedDay: schedule.nextExpectedDay,
        });
      }
    }

    // If actualIncomeToDate in the current month exceeds what was matched in stream.recentPayments
    // (e.g. bonus, other deposits, or newly imported transactions), capture the difference cleanly
    if (hasActuals && (actualIncomeToDate || 0) > streamReceivedSum) {
      const extraActual = Math.round((actualIncomeToDate || 0) - streamReceivedSum);
      if (results.length === 1 && results[0].receivedToDate === 0) {
        // Attribute directly to the primary stream if recentPayments wasn't refreshed yet
        const primary = results[0];
        primary.receivedToDate = extraActual;
        primary.remaining = Math.max(0, primary.netMonthly - extraActual);
        primary.total = primary.receivedToDate + primary.remaining;
      } else if (extraActual > 0) {
        results.push({
          id: 'other-income-actual',
          name: 'Other Deposits & Credits',
          accountName: 'All Accounts',
          category: 'Income',
          color: '#66bb6a',
          frequency: 'custom',
          paycheckAmount: extraActual,
          grossMonthly: extraActual,
          netMonthly: extraActual,
          total: extraActual,
          basis: 'actual_exceeded',
          lastDate: targetMonthKey ? `${targetMonthKey}-01` : null,
          receivedToDate: extraActual,
          remaining: 0,
          receivedCount: 1,
          expectedCount: 1,
          upcomingDays: [],
          nextExpectedDay: null,
        });
      }
    }

    return results;
  }

  // Fallback when no active incomeStreams match: use historical / seasonal monthly income projection
  const fallbackProj = projectMonthlyIncome({
    monthKey: targetMonthKey,
    historicalMonthlyIncome,
    historicalAnnualAvgIncome,
    recentAvgIncome,
    recurringIncome: 0,
  });

  const baseline = fallbackProj.amount;
  const received = hasActuals ? Math.round(actualIncomeToDate || 0) : undefined;
  const remaining = hasActuals ? Math.max(0, baseline - (received || 0)) : undefined;
  const total = hasActuals ? (received || 0) + (remaining || 0) : baseline;

  if (total > 0) {
    const basisMap: Record<string, IncomeStreamProjection['basis']> = {
      recurring_stream: 'recurring_stream',
      last_year_month: 'last_year_month',
      last_year_avg: 'last_year_avg',
      recent_avg: 'recent_avg',
      none: 'actual_exceeded',
    };
    results.push({
      id: 'historical-income-baseline',
      name:
        fallbackProj.basis === 'last_year_month'
          ? 'Seasonal Historical Income'
          : fallbackProj.basis === 'last_year_avg'
          ? '12-Month Average Income'
          : 'Projected Monthly Income',
      accountName: 'All Accounts',
      category: 'Income',
      color: incomeCategoryColor,
      frequency: 'monthly',
      paycheckAmount: baseline,
      grossMonthly: baseline,
      netMonthly: baseline,
      total,
      basis: basisMap[fallbackProj.basis] || 'recent_avg',
      lastDate: null,
      ...(hasActuals
        ? {
            receivedToDate: received || 0,
            remaining: remaining || 0,
            receivedCount: (received || 0) > 0 ? 1 : 0,
            expectedCount: 1,
          }
        : { expectedCount: 1 }),
      upcomingDays: [],
      nextExpectedDay: null,
    });
  }

  return results;
}
