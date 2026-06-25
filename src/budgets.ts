import type { Category, Transaction } from './types';

const TRAILING_DAYS = 90;

function daysAgoIso(today: Date, days: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the trailing-90-day-average monthly spend per spend category, using
 * ALL transactions.
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

export interface ConsolidatedMerchant {
  merchantKey: string;
  category: string;
  monthlyAverage: number;
}

/**
 * Consolidate merchants over the last 60 days to compute their monthly average.
 */
export function getConsolidatedRecurringMerchants(
  allTxns: Transaction[],
  recurringCategoryNames: Set<string>,
  today: Date = new Date()
): ConsolidatedMerchant[] {
  const cutoff = daysAgoIso(today, 60);

  const map = new Map<string, { merchantKey: string, category: string, total: number }>();

  for (const t of allTxns) {
    if (t.amount >= 0) continue;
    if (t.date < cutoff) continue;
    if (!recurringCategoryNames.has(t.category)) continue;

    const key = `${t.category}::${t.merchantKey}`;
    const existing = map.get(key) || { merchantKey: t.merchantKey, category: t.category, total: 0 };
    existing.total += Math.abs(t.amount);
    map.set(key, existing);
  }

  const result: ConsolidatedMerchant[] = [];
  for (const item of map.values()) {
    result.push({
      merchantKey: item.merchantKey,
      category: item.category,
      monthlyAverage: item.total / 2, // 60 days is roughly 2 months
    });
  }

  return result.sort((a, b) => b.monthlyAverage - a.monthlyAverage);
}
