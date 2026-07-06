import { invoke } from '@tauri-apps/api/core';

export interface MerchantForecast {
  merchantKey: string;
  category: string;
  kind: 'recurring' | 'variable';
  monthlyEstimate: number;
  cadenceLabel?: string;
  trailingCount?: number;
  lastSeen: string;
}

export async function buildForecast(isDemo: boolean = false): Promise<MerchantForecast[]> {
  try {
    return await invoke<MerchantForecast[]>('build_forecast', { isDemo });
  } catch (e) {
    console.error("Failed to build forecast natively:", e);
    return [];
  }
}

export async function lastMonthActualSpendNative(isDemo: boolean = false): Promise<number> {
  try {
    return await invoke<number>('last_month_actual_spend', { isDemo });
  } catch (e) {
    console.error("Failed to get last month actual spend natively:", e);
    return 0;
  }
}

export function lastMonthActualSpend(
  allTxns: any[],
  categories: any[],
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

