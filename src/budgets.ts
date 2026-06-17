import type { Category, Transaction } from './types';

const TRAILING_DAYS = 90;

function daysAgoIso(today: Date, days: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the trailing-90-day-average monthly spend per spend category, using
 * ONLY non-recurring transactions (since recurring is handled separately).
 * "Non-recurring" here is determined by the supplied recurringMerchantKeys set.
 */
export function categoryTrailingAvg(
  allTxns: Transaction[],
  categories: Category[],
  today: Date = new Date()
): Map<string, number> {
  const spendCategoryNames = new Set(
    categories.filter((c) => c.type === 'spend').map((c) => c.name)
  );
  const trailingCutoff = daysAgoIso(today, TRAILING_DAYS);

  const totals = new Map<string, number>();
  for (const t of allTxns) {
    if (t.amount >= 0) continue;
    if (!spendCategoryNames.has(t.category)) continue;
    if (t.date < trailingCutoff) continue;
    if (t.recurrence === 'recurring') continue;
    totals.set(t.category, (totals.get(t.category) || 0) + Math.abs(t.amount));
  }
  // Divide each total by 3 (months) to get $/mo
  const result = new Map<string, number>();
  for (const [cat, total] of totals) {
    result.set(cat, total / 3);
  }
  return result;
}

export interface CategoryBudgetView {
  category: string;
  color: string;
  monthlyAmount: number;
  userSet: boolean;
  trailingAvg: number;
}
