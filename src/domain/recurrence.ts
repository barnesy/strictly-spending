import { api } from '../api';
import type { RecurrenceKind, RecurrenceInfo, Transaction, Category } from '../types';

export type { RecurrenceInfo };

export async function buildRecurrenceMap(isDemo: boolean = false, accountId?: number): Promise<Record<string, RecurrenceInfo>> {
  try {
    const res = await api.buildRecurrenceMap(isDemo, accountId);
    return res || {};
  } catch (e) {
    console.error("Failed to build recurrence map natively:", e);
    return {};
  }
}

export function isRecurring(
  kindOrTxn: RecurrenceKind | Transaction,
  recurrenceMap?: Map<string, RecurrenceInfo>
): boolean {
  if (typeof kindOrTxn === 'string') {
    return kindOrTxn !== 'none';
  }
  if (kindOrTxn.recurrence === 'recurring') return true;
  if (kindOrTxn.merchantKey && recurrenceMap) {
    const info = recurrenceMap.get(kindOrTxn.merchantKey);
    if (info && info.kind !== 'none') return true;
  }
  return false;
}

export function recurrenceLabel(kind: RecurrenceKind): string {
  switch (kind) {
    case 'monthly':
      return 'Monthly';
    case 'biweekly':
      return 'Biweekly';
    case 'weekly':
      return 'Weekly';
    case 'annual':
      return 'Annual';
    case 'none':
      return 'One-time';
  }
}

export async function refreshRecurrenceAll(): Promise<{ updated: number }> {
  try {
    return await api.refreshRecurrenceAll();
  } catch (e) {
    console.error("Failed to refresh recurrence natively:", e);
    return { updated: 0 };
  }
}

const NONE: RecurrenceInfo = {
  kind: 'none',
  count: 0,
  meanIntervalDays: 0,
  meanAmount: 0,
  estMonthlyCost: 0,
  lastDate: null,
  source: 'auto',
};

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000
  );
}

function computePriceHike(spend: Transaction[]): Pick<RecurrenceInfo, 'lastAmount' | 'priorAmount' | 'priceHikeDelta' | 'priceHikePct'> {
  if (spend.length === 0) return {};
  const lastAmount = Math.abs(spend[spend.length - 1].amount);
  if (spend.length < 2) return { lastAmount };
  const priorSlice = spend.slice(Math.max(0, spend.length - 4), spend.length - 1);
  if (priorSlice.length === 0) return { lastAmount };
  const priorAmount = priorSlice.reduce((s, t) => s + Math.abs(t.amount), 0) / priorSlice.length;
  const delta = lastAmount - priorAmount;
  if (priorAmount > 1 && delta >= 1 && delta / priorAmount >= 0.03 && delta / priorAmount <= 1.5) {
    return {
      lastAmount,
      priorAmount,
      priceHikeDelta: delta,
      priceHikePct: (delta / priorAmount) * 100,
    };
  }
  return { lastAmount, priorAmount };
}

export function detectRecurrence(txns: Transaction[]): RecurrenceInfo {
  const spend = txns
    .filter((t) => t.amount < 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const hikeFields = computePriceHike(spend);

  if (spend.length < 3) {
    return { ...NONE, count: spend.length, lastDate: spend.at(-1)?.date ?? null, ...hikeFields };
  }

  const intervals: number[] = [];
  for (let i = 1; i < spend.length; i++) {
    intervals.push(daysBetween(spend[i - 1].date, spend[i].date));
  }
  const mean = intervals.reduce((s, x) => s + x, 0) / intervals.length;
  const variance =
    intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / intervals.length;
  const stddev = Math.sqrt(variance);

  let kind: RecurrenceKind = 'none';

  const meanAmt = spend.reduce((s, t) => s + Math.abs(t.amount), 0) / spend.length;
  const amtVariance = spend.reduce((s, t) => s + (Math.abs(t.amount) - meanAmt) ** 2, 0) / spend.length;
  const amtStddev = Math.sqrt(amtVariance);
  const isStableAmount = amtStddev <= (meanAmt * 0.3) + 5; 

  if (isStableAmount) {
    if (mean >= 25 && mean <= 35 && stddev <= 7) kind = 'monthly';
    else if (mean >= 12 && mean <= 17 && stddev <= 5) kind = 'biweekly';
    else if (mean >= 5 && mean <= 9 && stddev <= 3) kind = 'weekly';
    else if (mean >= 330 && mean <= 400 && stddev <= 40) kind = 'annual';
  }

  const recentSpend = spend.slice(-3);
  const meanAmount =
    recentSpend.reduce((s, t) => s + Math.abs(t.amount), 0) /
    recentSpend.length;

  let estMonthlyCost = 0;
  switch (kind) {
    case 'monthly':
      estMonthlyCost = meanAmount;
      break;
    case 'biweekly':
      estMonthlyCost = meanAmount * (30 / 14);
      break;
    case 'weekly':
      estMonthlyCost = meanAmount * (30 / 7);
      break;
    case 'annual':
      estMonthlyCost = meanAmount / 12;
      break;
  }

  return {
    kind,
    count: spend.length,
    meanIntervalDays: mean,
    meanAmount,
    estMonthlyCost,
    lastDate: spend[spend.length - 1].date,
    source: 'auto',
    ...hikeFields,
  };
}

export function resolveRecurrenceForTransaction(
  txn: Omit<Transaction, 'id' | 'recurrence'> & { recurrenceOverride?: 'recurring' | 'onetime' | null },
  categoryMap: Map<string, Category>,
  merchantOverrideMap: Map<string, any>,
  autoRecurringMerchantKeys: Set<string>
): 'recurring' | 'onetime' {
  if (txn.recurrenceOverride === 'recurring') return 'recurring';
  if (txn.recurrenceOverride === 'onetime') return 'onetime';
  const mkey = txn.merchantKey;
  if (mkey) {
    const override = merchantOverrideMap.get(mkey);
    if (override) {
      return override.recurrence === 'none' || override.recurrence === 'onetime' ? 'onetime' : 'recurring';
    }
  }
  if (mkey && autoRecurringMerchantKeys.has(mkey)) {
    return 'recurring';
  }
  const cat = categoryMap.get(txn.category);
  if (cat?.defaultRecurrence) {
    return cat.defaultRecurrence;
  }
  return 'onetime';
}
