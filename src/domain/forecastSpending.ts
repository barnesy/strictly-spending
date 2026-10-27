import type { Category, Budget, RecurrenceInfo, Transaction } from '../types';
import type { ConsolidatedMerchant, CategoryTrailingAvg } from '../api/types';
import type { IncomeStream } from '../api/scenarios';

export interface CategoryProjection {
  category: string;
  color: string;
  total: number;
  recurring: number;
  variable: number;
  basis: 'budget' | 'recurring' | 'trailing' | 'recurring + trailing' | 'last_year' | 'last_year_avg' | 'actual_exceeded';
  lastYearActual?: number;
  actualToDate?: number;
  remaining?: number;
  paidRecurring?: number;
  unpaidRecurring?: number;
}

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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MerchantBillStatus {
  isPaidThisMonth: boolean;
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
  referenceDate: Date = new Date()
): MerchantBillStatus {
  let info = recurrenceMap?.get(merchantKey);
  let lastDate = info?.lastDate || null;

  // Also check if another merchantKey variant with the same canonical stem has a newer lastDate
  if (recurrenceMap && merchantKey) {
    const targetCanon = normalizeTimelineMerchantKey(merchantKey);
    if (targetCanon.length >= 3) {
      for (const [k, v] of recurrenceMap.entries()) {
        if (!v?.lastDate) continue;
        if (k === merchantKey || normalizeTimelineMerchantKey(k) === targetCanon) {
          if (!lastDate || v.lastDate > lastDate) {
            lastDate = v.lastDate;
            info = v;
          }
        }
      }
    }
  }

  const isPaidThisMonth = Boolean(targetMonthKey && lastDate && lastDate.startsWith(targetMonthKey));
  const isExpectedThisMonth = !isPaidThisMonth && Boolean(lastDate);

  let expectedDay: number | null = null;
  let lastPaidShortLabel: string | null = null;
  let expectedDate: string | null = null;
  let expectedShortLabel: string | null = null;
  let daysSinceLastPaid: number | null = null;
  let daysUntilDue: number | null = null;
  let countdownText: string | null = null;

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
      }
    }
  }

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
      } else if (lastPaidShortLabel) {
        countdownText = `Paid ${lastPaidShortLabel}`;
      }
    }
  }

  return {
    isPaidThisMonth,
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

export function getPriorYearMonth(monthKey: string): string {
  if (!monthKey || !monthKey.includes('-')) return '';
  const [year, month] = monthKey.split('-').map(Number);
  if (isNaN(year) || isNaN(month)) return '';
  return `${year - 1}-${String(month).padStart(2, '0')}`;
}

export function computeCategoryProjections({
  categories,
  budgets,
  consolidatedMerchants,
  trailingAverages,
  disabledCategories = [],
  excludedBudgetCategories = new Set<string>(),
  excludedMerchants = new Set<string>(),
  targetMonthKey,
  historicalMonthlySpend,
  historicalCategoryAnnualAvg,
  actualSpendByCategory,
  recurrenceMap,
}: {
  categories: Category[];
  budgets: Budget[];
  consolidatedMerchants: ConsolidatedMerchant[];
  trailingAverages: CategoryTrailingAvg[];
  disabledCategories?: string[];
  excludedBudgetCategories?: Set<string>;
  excludedMerchants?: Set<string>;
  targetMonthKey?: string;
  historicalMonthlySpend?: Map<string, Map<string, number>>;
  historicalCategoryAnnualAvg?: Map<string, number>;
  actualSpendByCategory?: Map<string, number>;
  recurrenceMap?: Map<string, RecurrenceInfo>;
}): Map<string, CategoryProjection> {
  const disabledSet = new Set(disabledCategories);

  // 1. Recurring sum by category (plus paid vs unpaid split when recurrenceMap + targetMonthKey are provided)
  const recurringByCat = new Map<string, number>();
  const paidRecurringByCat = new Map<string, number>();
  const unpaidRecurringByCat = new Map<string, number>();

  const dedupedMerchants = consolidateRecurringMerchants(consolidatedMerchants, recurrenceMap);

  for (const m of dedupedMerchants) {
    if (
      disabledSet.has(m.category) ||
      excludedBudgetCategories.has(m.category) ||
      excludedMerchants.has(m.merchantKey)
    ) {
      continue;
    }
    const amt = m.monthlyAverage || 0;
    recurringByCat.set(
      m.category,
      (recurringByCat.get(m.category) || 0) + amt
    );

    if (actualSpendByCategory !== undefined && targetMonthKey && recurrenceMap) {
      const status = getMerchantBillStatus(m.merchantKey, targetMonthKey, recurrenceMap);
      if (status.isPaidThisMonth) {
        paidRecurringByCat.set(m.category, (paidRecurringByCat.get(m.category) || 0) + amt);
      } else if (status.lastDate) {
        unpaidRecurringByCat.set(m.category, (unpaidRecurringByCat.get(m.category) || 0) + amt);
      }
    }
  }

  // 2. Budget map
  const budgetByCat = new Map<string, { amount: number; userSet: boolean }>();
  if (budgets) {
    for (const b of budgets) {
      if (!disabledSet.has(b.category) && !excludedBudgetCategories.has(b.category)) {
        budgetByCat.set(b.category, { amount: b.monthlyAmount || 0, userSet: Boolean(b.userSet) });
      }
    }
  }

  // 3. Trailing average map
  const trailingByCat = new Map<string, number>();
  for (const t of trailingAverages) {
    if (!disabledSet.has(t.category) && !excludedBudgetCategories.has(t.category)) {
      trailingByCat.set(t.category, t.average || 0);
    }
  }

  // Prior year month lookup if targetMonthKey is provided
  const priorMonthKey = targetMonthKey ? getPriorYearMonth(targetMonthKey) : '';
  const lastYearMonthSpendMap = priorMonthKey && historicalMonthlySpend ? historicalMonthlySpend.get(priorMonthKey) : undefined;

  const resultMap = new Map<string, CategoryProjection>();
  const spendCats = (categories || []).filter(
    (c) => c.type === 'spend' && !disabledSet.has(c.name)
  );

  for (const cat of spendCats) {
    const isRecurringCat = cat.defaultRecurrence === 'recurring';
    const recurring = Math.round(recurringByCat.get(cat.name) || 0);
    const budgetEntry = !isRecurringCat ? budgetByCat.get(cat.name) : undefined;
    const hasExplicitBudget = budgetEntry !== undefined;
    const budget = isRecurringCat ? 0 : Math.round(budgetEntry?.amount || 0);
    const trailing = Math.round(trailingByCat.get(cat.name) || 0);

    const lastYearMonthSpend = lastYearMonthSpendMap ? lastYearMonthSpendMap.get(cat.name) : undefined;
    const annualAvgSpend = historicalCategoryAnnualAvg?.get(cat.name);
    const lastYearActual = lastYearMonthSpend !== undefined
      ? Math.round(lastYearMonthSpend)
      : (annualAvgSpend !== undefined ? Math.round(annualAvgSpend) : undefined);

    let baselineTotal = 0;
    let basis: CategoryProjection['basis'] = 'trailing';

    if (isRecurringCat) {
      // Recurring categories are driven strictly by active consolidated recurring bills
      baselineTotal = recurring;
      basis = 'recurring';
    } else if (budget > 0) {
      // User has an active budget for this category: budget dictates variable capacity
      baselineTotal = Math.max(budget, recurring);
      basis = 'budget';
    } else if (hasExplicitBudget && !budgetEntry?.userSet && trailing > 0) {
      // Auto-seeded $0 budget row before trailing averages loaded: use trailing average
      baselineTotal = Math.max(trailing, recurring);
      basis = 'trailing';
    } else if (hasExplicitBudget) {
      // Explicit $0 budget (or $0 trailing average on an isolated bank account)
      baselineTotal = recurring;
      basis = 'budget';
    } else if (lastYearMonthSpend !== undefined && lastYearMonthSpend > 0) {
      // Unbudgeted variable: look at same month last year (captures seasonality)
      baselineTotal = Math.max(recurring, Math.round(lastYearMonthSpend));
      basis = 'last_year';
    } else if (annualAvgSpend !== undefined && annualAvgSpend > 0) {
      // Unbudgeted variable: look at last year's 12-month average
      baselineTotal = Math.max(recurring, Math.round(annualAvgSpend));
      basis = 'last_year_avg';
    } else if (recurring > 0) {
      baselineTotal = Math.max(recurring, trailing);
      basis = trailing > recurring ? 'recurring + trailing' : 'recurring';
    } else if (trailing > 0) {
      baselineTotal = trailing;
      basis = 'trailing';
    }

    const hasActualsProvided = actualSpendByCategory !== undefined;
    const actualToDate = hasActualsProvided ? Math.round(actualSpendByCategory.get(cat.name) || 0) : undefined;
    const paidRecurring = hasActualsProvided ? Math.round(paidRecurringByCat.get(cat.name) || 0) : undefined;
    const unpaidRecurring = hasActualsProvided ? Math.round(unpaidRecurringByCat.get(cat.name) || 0) : undefined;
    // Guarantee remaining spend is at least any unpaid recurring bills still due this month
    const remaining = hasActualsProvided
      ? Math.max(unpaidRecurring || 0, baselineTotal - (actualToDate || 0))
      : undefined;
    const total = hasActualsProvided ? (actualToDate || 0) + (remaining || 0) : baselineTotal;

    if (hasActualsProvided && baselineTotal === 0 && (actualToDate || 0) > 0) {
      basis = 'actual_exceeded';
    }

    if (total > 0) {
      resultMap.set(cat.name, {
        category: cat.name,
        color: cat.color || '#bdbdbd',
        total,
        recurring: Math.min(total, recurring),
        variable: Math.max(0, total - Math.min(total, recurring)),
        basis,
        lastYearActual,
        ...(hasActualsProvided ? { actualToDate, remaining, paidRecurring, unpaidRecurring } : {}),
      });
    }
  }

  return resultMap;
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

export function generateFutureMonths(lastMonthStr: string, count: number): string[] {
  if (!lastMonthStr || count <= 0) return [];
  let [year, month] = lastMonthStr.split('-').map(Number);
  const futureList: string[] = [];
  for (let i = 0; i < count; i++) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    futureList.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return futureList;
}

const NOISE_WORDS = new Set([
  'ach',
  'pos',
  'checkcard',
  'card',
  'visa',
  'debit',
  'credit',
  'pmt',
  'pymt',
  'paymnt',
  'payment',
  'autopay',
  'auto',
  'recurring',
  'bill',
  'billpay',
  'online',
  'purchase',
  'web',
  'ppd',
  'ccd',
  'tel',
  'des',
  'indn',
  'id',
  'coid',
  'inc',
  'llc',
  'corp',
  'co',
  'com',
  'net',
  'org',
  'us',
  'usa',
  'www',
  'http',
  'https',
  'the',
  'and',
  'payroll',
  'direct',
  'dep',
  'deposit',
  'ca',
  'ga',
  'ny',
  'tx',
  'fl',
  'va',
  'nc',
  'mountain',
  'view',
  'decatur',
  'atlanta',
  'barnes',
  'christopher',
  'chris',
  'daniel',
  'barneschristo',
  'prem',
  'coll',
  'ins',
  'loan',
  'inst',
  'xfer',
  'syf',
  'paypalsi77',
  'wwp',
]);

/**
 * Normalizes a raw merchant key or transaction description into a canonical brand/merchant stem
 * so variations like "VERIZON WIRELESS 09/14" and "VZWRLSS*APOCC", or "google_workspace_ca_recurring"
 * and "google workspace", or "GOOGLE *FI TP6 Mountain View" and "GOOGLE *FI 4xH Mountain View" unify cleanly.
 */
export function normalizeTimelineMerchantKey(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();

  // Strip common payment processor prefixes
  s = s.replace(/^(sq\s*\*|tst\s*\*|sp\s*\*|dd\s*\*|pp\s*\*|wwp\s*\*|ach\s+|pos\s+)/i, '');
  // Strip ACH metadata fields like DES:..., INDN:..., ID:..., CO ID:...
  s = s.replace(/\b(des|indn|id|co\s*id|pmt\s*info):[^\s]*/gi, ' ');
  // Strip dates like 09/14 or 2026-10-15
  s = s.replace(/\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?\b/g, ' ');
  // Replace non-alphanumeric (including underscores) with spaces
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  // Remove masked digits or pure digit tokens
  s = s.replace(/\b[x*]*\d+[a-z0-9]*\b/g, ' ');

  const rawTokens = s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !NOISE_WORDS.has(t));

  // Deduplicate consecutive identical tokens (e.g. "google google" -> "google")
  const dedupedTokens: string[] = [];
  for (const t of rawTokens) {
    if (dedupedTokens[dedupedTokens.length - 1] !== t) {
      dedupedTokens.push(t);
    }
  }

  // If PayPal wraps a known underlying merchant (e.g. "paypal spotify ...", "paypal github ...", "paypal ouraring ..."), drop leading "paypal"
  if (dedupedTokens.length >= 2 && dedupedTokens[0] === 'paypal') {
    dedupedTokens.shift();
  }
  // Remove trailing "paypal" if still present
  while (dedupedTokens.length > 1 && dedupedTokens[dedupedTokens.length - 1] === 'paypal') {
    dedupedTokens.pop();
  }

  const joined = dedupedTokens.slice(0, 3).join(' ');

  // Canonical brand aliases for common utility/telecom/mortgage/subscription variations
  if (/^(vzwrlss|verizon)/.test(joined)) return 'verizon';
  if (/^(att|at\s+t)\b/.test(joined)) return 'att';
  if (/^(comcast|xfinity)/.test(joined)) return 'xfinity';
  if (/^(tmobile|t\s+mobile)/.test(joined)) return 'tmobile';
  if (/^netflix/.test(joined)) return 'netflix';
  if (/^spotify/.test(joined)) return 'spotify';
  if (/^github\b/.test(joined)) return 'github';
  if (/^duke\s+energy/.test(joined)) return 'duke energy';
  if (/^dominion\s+energy/.test(joined)) return 'dominion energy';
  if (/^(newrez|shellpoint)/.test(joined)) return 'shellpoint mortgage';
  if (/^rocket\s+mortgage\b/.test(joined)) return 'rocket mortgage';
  if (/^santander\b/.test(joined)) return 'santander';
  if (/^geico\b/.test(joined)) return 'geico';
  if (/^homesite\b/.test(joined)) return 'homesite';
  if (/^home\s+depot\b/.test(joined)) return 'home depot';
  if (/^google\s+fi\b/.test(joined)) return 'google fi';
  if (/^google\s+(store|st)\b/.test(joined)) return 'google store';
  if (/^google\s+workspace\b/.test(joined)) return 'google workspace';
  if (/^google\s+services\b/.test(joined)) return 'google services';
  if (/^google$/.test(joined)) return 'google';

  return joined || raw.toLowerCase().trim().slice(0, 24);
}

/**
 * Formats a raw merchant key or description into a clean human-readable display name.
 */
export function formatCleanMerchantName(raw: string): string {
  if (!raw) return 'Recurring Charge';
  const canon = normalizeTimelineMerchantKey(raw);
  const brandMap: Record<string, string> = {
    verizon: 'Verizon Wireless',
    att: 'AT&T',
    xfinity: 'Xfinity / Comcast',
    tmobile: 'T-Mobile',
    netflix: 'Netflix',
    spotify: 'Spotify',
    github: 'GitHub',
    'duke energy': 'Duke Energy',
    'dominion energy': 'Dominion Energy',
    'shellpoint mortgage': 'Shellpoint Mortgage',
    'rocket mortgage': 'Rocket Mortgage',
    santander: 'Santander',
    geico: 'Geico',
    homesite: 'Homesite',
    'home depot': 'The Home Depot',
    'google fi': 'Google Fi',
    'google store': 'Google Store',
    'google workspace': 'Google Workspace',
    'google services': 'Google Services',
    google: 'Google',
    'georgia power': 'Georgia Power',
    'dekalb county': 'Dekalb County',
    'gas south': 'Gas South',
    'state farm': 'State Farm',
    'us department of': 'US Dept. of Education',
    'arrow exterminator': 'Arrow Exterminators',
    godaddy: 'GoDaddy',
    audible: 'Audible',
  };
  if (brandMap[canon]) return brandMap[canon];

  const cleaned = raw
    .replace(/\b(des|indn|id|co\s*id|pmt\s*info):[^\s]*/gi, '')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/[*_#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const source = cleaned.length >= 2 ? cleaned : canon;
  return source
    .split(' ')
    .slice(0, 4)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/**
 * Consolidates raw recurring merchant entries (from SQL `GROUP BY merchant_key, category`)
 * so CSV vs. SimpleFIN/Plaid variations (e.g. "google workspace" and "google_workspace_ca_recurring",
 * "google fi 4xh mountain view" and "google fi tp6 mountain view", "rocket_mortgage" and "rocket mortgage loan...")
 * unify into a single canonical recurring merchant entry with the latest payment status.
 */
export function consolidateRecurringMerchants(
  merchants: ConsolidatedMerchant[],
  recurrenceMap?: Map<string, RecurrenceInfo>
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
    const groupKey = `${m.category}::${canon}`;
    const status = getMerchantBillStatus(m.merchantKey, undefined, recurrenceMap);
    const ownLastDate = recurrenceMap?.get(m.merchantKey)?.lastDate || status.lastDate || '';
    const expectedDay = status.expectedDay ?? 15;

    const existing = byCategoryAndCanon.get(groupKey);
    if (!existing) {
      byCategoryAndCanon.set(groupKey, {
        merchant: { ...m },
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
            monthlyAverage: m.monthlyAverage,
          },
          canon,
          lastDate: ownLastDate,
          expectedDay,
        });
      }
    }
  }

  // Secondary deduplication within the same category for nearly identical amount (±10%) and billing day (±3 days)
  const deduped: ConsolidatedEntry[] = [];
  for (const entry of byCategoryAndCanon.values()) {
    const dup = deduped.find(
      (e) =>
        e.merchant.category === entry.merchant.category &&
        Math.abs(e.expectedDay - entry.expectedDay) <= 3 &&
        e.merchant.monthlyAverage >= 25 &&
        Math.abs(e.merchant.monthlyAverage - entry.merchant.monthlyAverage) /
          Math.max(1, e.merchant.monthlyAverage) <=
          0.1
    );
    if (!dup) {
      deduped.push(entry);
    } else if (entry.lastDate > dup.lastDate) {
      dup.merchant = entry.merchant;
      dup.canon = entry.canon;
      dup.lastDate = entry.lastDate;
      dup.expectedDay = entry.expectedDay;
    }
  }

  return deduped
    .map((e) => e.merchant)
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage);
}

export interface ReconciledTimelineMatch {
  kind: 'bill' | 'income';
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
  amount: number;
  expectedDay: number;
  isDelayed?: boolean;
  status?: 'upcoming' | 'filled';
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

export interface MonthTimelineReconciliation {
  upcomingBillsByDay: Map<number, TimelineExpectedBill[]>;
  upcomingIncomeByDay: Map<number, TimelineExpectedIncome[]>;
  allExpectedBills: TimelineExpectedBill[];
  allExpectedIncome: TimelineExpectedIncome[];
  allExpectedBillsByDay: Map<number, TimelineExpectedBill[]>;
  allExpectedIncomeByDay: Map<number, TimelineExpectedIncome[]>;
  reconciledByTxnId: Map<number, ReconciledTimelineMatch>;
  reconciledBillsCount: number;
  totalExpectedBillsCount: number;
  reconciledBillsActualTotal: number;
  reconciledBillsExpectedTotal: number;
  reconciledPaydaysCount: number;
  totalExpectedPaydaysCount: number;
  reconciledIncomeActualTotal: number;
  reconciledIncomeExpectedTotal: number;
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
  consolidatedMerchants,
  recurrenceMap,
  incomeStreams = [],
  taxRate = 0,
  disabledCategories = [],
  enabledAccountIds = [],
  isCurrentMonth = false,
  todayDay = null,
}: {
  monthKey: string;
  daysInMonth: number;
  transactions: Transaction[];
  consolidatedMerchants: ConsolidatedMerchant[];
  recurrenceMap: Map<string, RecurrenceInfo>;
  incomeStreams?: IncomeStream[];
  taxRate?: number;
  disabledCategories?: string[];
  enabledAccountIds?: number[];
  isCurrentMonth?: boolean;
  todayDay?: number | null;
}): MonthTimelineReconciliation {
  const disabledCats = new Set(disabledCategories);
  const reconciledByTxnId = new Map<number, ReconciledTimelineMatch>();

  // 1. Deduplicate consolidated recurring merchants into unique expected monthly charges
  interface CandidateBill {
    merchantKey: string;
    displayName: string;
    canonicalKey: string;
    category: string;
    amount: number;
    expectedDay: number;
    lastDate: string | null;
    avgPeriodDays: number;
  }

  const billByCanon = new Map<string, CandidateBill>();

  for (const m of consolidatedMerchants) {
    if (disabledCats.has(m.category) || (m.monthlyAverage || 0) <= 0) continue;
    const info = recurrenceMap.get(m.merchantKey);
    const status = getMerchantBillStatus(m.merchantKey, monthKey, recurrenceMap);
    const lastDate = status.lastDate || info?.lastDate || null;
    if (!lastDate) continue;

    const avgPeriodDays = info?.meanIntervalDays || 30;
    // Skip high-frequency everyday habits (e.g. coffee/grocery visited every few days)
    if (avgPeriodDays > 0 && avgPeriodDays < 16) continue;

    const parts = lastDate.split('-');
    const rawDay = parts.length === 3 ? Number(parts[2]) : 15;
    const expectedDay = Math.min(daysInMonth, Math.max(1, isNaN(rawDay) ? 15 : rawDay));

    const canon = normalizeTimelineMerchantKey(m.merchantKey) || m.merchantKey.toLowerCase();
    const existing = billByCanon.get(canon);

    if (!existing) {
      billByCanon.set(canon, {
        merchantKey: m.merchantKey,
        displayName: formatCleanMerchantName(m.merchantKey),
        canonicalKey: canon,
        category: m.category,
        amount: Math.round(m.monthlyAverage * 100) / 100,
        expectedDay,
        lastDate,
        avgPeriodDays,
      });
    } else {
      // Keep the most recent lastDate and average the expected amount if merged
      const isNewer = lastDate > (existing.lastDate || '');
      billByCanon.set(canon, {
        ...existing,
        merchantKey: isNewer ? m.merchantKey : existing.merchantKey,
        displayName: isNewer ? formatCleanMerchantName(m.merchantKey) : existing.displayName,
        amount: isNewer ? Math.round(m.monthlyAverage * 100) / 100 : existing.amount,
        expectedDay: isNewer ? expectedDay : existing.expectedDay,
        lastDate: isNewer ? lastDate : existing.lastDate,
      });
    }
  }

  // Secondary deduplication: merge bills in the same category with nearly identical amount (±10%) and day (±3 days)
  const dedupedBills: CandidateBill[] = [];
  for (const bill of billByCanon.values()) {
    const duplicate = dedupedBills.find(
      (b) =>
        b.category === bill.category &&
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
      duplicate.amount = bill.amount;
      duplicate.expectedDay = bill.expectedDay;
      duplicate.lastDate = bill.lastDate;
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
        // Plausible amount check (allow utilities/variable recurring bills up to ±60% or ±$75, or exact canonical merchant match within 10 days)
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
        // Educated-guess fallback: same category, very similar amount, and within ±6 days of expected billing date
        const score = 70 - relAmtDiff * 30 - dayDiff * 1.5;
        billCandidates.push({ billIdx, txn: t, score });
      }
    }
  });

  billCandidates.sort((a, b) => b.score - a.score);

  const matchedBillIndices = new Set<number>();
  const matchedBillInfoByIdx = new Map<
    number,
    { actualAmount: number; actualDay: number; actualDescription: string; matchedTxnId?: number }
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
        amount: bill.amount,
        expectedDay: bill.expectedDay,
        status: 'filled',
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
      amount: bill.amount,
      expectedDay: bill.expectedDay,
      isDelayed,
      status: 'upcoming',
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
  const enabledSet = enabledAccountIds.length > 0 ? new Set(enabledAccountIds) : null;
  const rawActiveStreams = incomeStreams.filter(
    (s) => s.enabled && (!enabledSet || s.accountId === undefined || enabledSet.has(s.accountId))
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

  return {
    upcomingBillsByDay,
    upcomingIncomeByDay,
    allExpectedBills,
    allExpectedIncome,
    allExpectedBillsByDay,
    allExpectedIncomeByDay,
    reconciledByTxnId,
    reconciledBillsCount: matchedBillIndices.size,
    totalExpectedBillsCount: matchedBillIndices.size + (isCurrentMonth ? unpaidBillsIncluded : 0),
    reconciledBillsActualTotal: Math.round(reconciledBillsActualTotal * 100) / 100,
    reconciledBillsExpectedTotal: Math.round(reconciledBillsExpectedTotal * 100) / 100,
    reconciledPaydaysCount: matchedPaydayIndices.size,
    totalExpectedPaydaysCount: matchedPaydayIndices.size + (isCurrentMonth ? unpaidPaydaysIncluded : 0),
    reconciledIncomeActualTotal: Math.round(reconciledIncomeActualTotal * 100) / 100,
    reconciledIncomeExpectedTotal: Math.round(reconciledIncomeExpectedTotal * 100) / 100,
  };
}



