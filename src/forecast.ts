import type { Category, Transaction } from './types';
import { isRecurring, type RecurrenceInfo } from './recurrence';

export interface MerchantForecast {
  merchantKey: string;
  category: string;
  kind: 'recurring' | 'variable';
  monthlyEstimate: number;
  cadenceLabel?: string;
  trailingCount?: number;
  lastSeen: string;
}

const TRAILING_DAYS = 90;

function daysAgoIso(today: Date, days: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildForecast(
  allTxns: Transaction[],
  recurrenceMap: Map<string, RecurrenceInfo>,
  categories: Category[],
  today: Date = new Date()
): MerchantForecast[] {
  const spendCategoryNames = new Set(
    categories.filter((c) => c.type === 'spend').map((c) => c.name)
  );
  const trailingCutoff = daysAgoIso(today, TRAILING_DAYS);

  // Group by merchantKey
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of allTxns) {
    if (!t.merchantKey) continue;
    const list = byMerchant.get(t.merchantKey);
    if (list) list.push(t);
    else byMerchant.set(t.merchantKey, [t]);
  }

  const out: MerchantForecast[] = [];
  for (const [merchantKey, txns] of byMerchant) {
    // Sort by date asc to compute lastSeen and the most-recent category
    txns.sort((a, b) => a.date.localeCompare(b.date));
    const mostRecent = txns[txns.length - 1];
    const category = mostRecent.category;

    // Exclude non-spend categories (Income, Transfers)
    if (!spendCategoryNames.has(category)) continue;

    const info = recurrenceMap.get(merchantKey);
    const recurring = !!info && isRecurring(info.kind);

    if (recurring && info) {
      // Recurring: use the pre-computed monthly cost
      if (info.estMonthlyCost <= 0) continue;
      out.push({
        merchantKey,
        category,
        kind: 'recurring',
        monthlyEstimate: info.estMonthlyCost,
        cadenceLabel: info.kind,
        lastSeen: mostRecent.date,
      });
    } else {
      // Variable: trailing 90-day average / 3 months
      const trailing = txns.filter(
        (t) => t.date >= trailingCutoff && t.amount < 0
      );
      if (trailing.length === 0) continue;
      const total = trailing.reduce((s, t) => s + Math.abs(t.amount), 0);
      const monthlyEstimate = total / 3;
      if (monthlyEstimate <= 0) continue;
      out.push({
        merchantKey,
        category,
        kind: 'variable',
        monthlyEstimate,
        trailingCount: trailing.length,
        lastSeen: mostRecent.date,
      });
    }
  }

  return out;
}

export function lastMonthActualSpend(
  allTxns: Transaction[],
  categories: Category[],
  today: Date = new Date()
): number {
  const spendCategoryNames = new Set(
    categories.filter((c) => c.type === 'spend').map((c) => c.name)
  );
  // Previous calendar month bounds
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 10);
  const end = new Date(today.getFullYear(), today.getMonth(), 0)
    .toISOString()
    .slice(0, 10);
  return allTxns
    .filter(
      (t) =>
        t.amount < 0 &&
        spendCategoryNames.has(t.category) &&
        t.date >= start &&
        t.date <= end
    )
    .reduce((s, t) => s + Math.abs(t.amount), 0);
}
