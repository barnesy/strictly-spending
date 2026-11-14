import type { Category, Budget, RecurrenceInfo, Transaction } from '../../types';
import type { ConsolidatedMerchant, CategoryTrailingAvg } from '../../api/types';
import { getPriorYearMonth } from './merchantIdentity';
import { consolidateRecurringMerchants, getMerchantBillStatus } from './recurringDetection';

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
  currentMonthTransactions,
  unitemizedHoldByAccountId,
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
  currentMonthTransactions?: Transaction[];
  unitemizedHoldByAccountId?: Map<number, number>;
}): Map<string, CategoryProjection> {
  const disabledSet = new Set(disabledCategories);

  // 1. Recurring sum by category (plus paid vs unpaid split when recurrenceMap + targetMonthKey are provided)
  const recurringByCat = new Map<string, number>();
  const paidRecurringByCat = new Map<string, number>();
  const unpaidRecurringByCat = new Map<string, number>();

  const dedupedMerchants = consolidateRecurringMerchants(
    consolidatedMerchants,
    recurrenceMap,
    currentMonthTransactions,
    unitemizedHoldByAccountId
  );

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
      const status = getMerchantBillStatus(
        m.merchantKey,
        targetMonthKey,
        recurrenceMap,
        new Date(),
        m.accountId,
        m.lastDate
      );
      if (status.isPaidThisMonth) {
        paidRecurringByCat.set(m.category, (paidRecurringByCat.get(m.category) || 0) + amt);
      } else if (status.isExpectedThisMonth && status.lastDate) {
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

  // 3. Trailing average map (populate for all non-disabled categories so actuals/trailing aren't hidden by budget switch)
  const trailingByCat = new Map<string, number>();
  for (const t of trailingAverages) {
    if (!disabledSet.has(t.category)) {
      trailingByCat.set(t.category, t.average || 0);
    }
  }

  // Prior year month lookup if targetMonthKey is provided
  const priorMonthKey = targetMonthKey ? getPriorYearMonth(targetMonthKey) : '';
  const lastYearMonthSpendMap = priorMonthKey && historicalMonthlySpend ? historicalMonthlySpend.get(priorMonthKey) : undefined;

  const resultMap = new Map<string, CategoryProjection>();
  const nonSpendCatNames = new Set(
    (categories || []).filter((c) => c.type === 'income' || c.type === 'transfer').map((c) => c.name)
  );
  const baseSpendCats = (categories || []).filter(
    (c) => c.type === 'spend' && !disabledSet.has(c.name)
  );
  const seenCatNames = new Set(baseSpendCats.map((c) => c.name));
  const extraSpendCats: Category[] = [];
  if (actualSpendByCategory) {
    for (const catName of actualSpendByCategory.keys()) {
      if (catName && !seenCatNames.has(catName) && !nonSpendCatNames.has(catName) && !disabledSet.has(catName)) {
        seenCatNames.add(catName);
        extraSpendCats.push({ name: catName, color: '#78909c', defaultRecurrence: 'onetime', type: 'spend', sortOrder: 999 });
      }
    }
  }
  for (const catName of trailingByCat.keys()) {
    if (catName && !seenCatNames.has(catName) && !nonSpendCatNames.has(catName) && !disabledSet.has(catName)) {
      seenCatNames.add(catName);
      extraSpendCats.push({ name: catName, color: '#78909c', defaultRecurrence: 'onetime', type: 'spend', sortOrder: 999 });
    }
  }
  const spendCats = extraSpendCats.length > 0 ? [...baseSpendCats, ...extraSpendCats] : baseSpendCats;

  for (const cat of spendCats) {
    const isRecurringCat = cat.defaultRecurrence === 'recurring';
    const isExcludedCat = excludedBudgetCategories.has(cat.name);
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

    if (isExcludedCat) {
      baselineTotal = isRecurringCat ? recurring : 0;
      basis = isRecurringCat ? 'recurring' : 'budget';
    } else if (isRecurringCat) {
      baselineTotal = recurring;
      basis = 'recurring';
    } else if (hasExplicitBudget && !budgetEntry?.userSet && budget > 0 && trailing > 0) {
      baselineTotal = Math.max(trailing, budget, recurring);
      basis = 'trailing';
    } else if (budget > 0) {
      baselineTotal = Math.max(budget, recurring);
      basis = 'budget';
    } else if (hasExplicitBudget) {
      baselineTotal = recurring;
      basis = 'budget';
    } else if (lastYearMonthSpend !== undefined && lastYearMonthSpend > 0) {
      baselineTotal = Math.max(recurring, Math.round(lastYearMonthSpend));
      basis = 'last_year';
    } else if (annualAvgSpend !== undefined && annualAvgSpend > 0) {
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

    if (total > 0 || (actualToDate || 0) > 0 || (!hasExplicitBudget && trailing > 0)) {
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
