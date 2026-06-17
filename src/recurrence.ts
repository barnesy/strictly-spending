import type { RecurrenceKind, Transaction, MerchantOverride, Category } from './types';
import { db } from './db';

export interface RecurrenceInfo {
  kind: RecurrenceKind;
  count: number;
  meanIntervalDays: number;
  meanAmount: number;
  /** Normalized to a monthly figure ($/month) regardless of cadence. */
  estMonthlyCost: number;
  lastDate: string | null;
  source: 'auto' | 'override';
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

/** Auto-detect recurrence purely from transaction history. */
export function detectRecurrence(txns: Transaction[]): RecurrenceInfo {
  const spend = txns
    .filter((t) => t.amount < 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (spend.length < 3) {
    return { ...NONE, count: spend.length, lastDate: spend.at(-1)?.date ?? null };
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
  // Tolerances tuned for noisy bank dates (weekends shift bills 1-3 days).
  if (mean >= 25 && mean <= 35 && stddev <= 7) kind = 'monthly';
  else if (mean >= 12 && mean <= 17 && stddev <= 5) kind = 'biweekly';
  else if (mean >= 5 && mean <= 9 && stddev <= 3) kind = 'weekly';
  else if (mean >= 330 && mean <= 400 && stddev <= 40) kind = 'annual';

  // Use mean of the MOST RECENT 3 charges so the estimate reflects the
  // current subscription price (subscriptions often change tier; raw mean of
  // all history understates "what you'll pay next month").
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
  };
}

/** Apply a user override on top of the auto-detected info. */
export function applyOverride(
  auto: RecurrenceInfo,
  override: MerchantOverride | undefined
): RecurrenceInfo {
  if (!override) return auto;
  const kind = override.recurrence;
  let estMonthlyCost = auto.estMonthlyCost;
  // If the override forces a different cadence, recompute the monthly cost from
  // the observed mean amount + the forced cadence so the burn panel is honest.
  if (kind !== auto.kind && auto.meanAmount > 0) {
    switch (kind) {
      case 'monthly':
        estMonthlyCost = auto.meanAmount;
        break;
      case 'biweekly':
        estMonthlyCost = auto.meanAmount * (30 / 14);
        break;
      case 'weekly':
        estMonthlyCost = auto.meanAmount * (30 / 7);
        break;
      case 'annual':
        estMonthlyCost = auto.meanAmount / 12;
        break;
      case 'none':
        estMonthlyCost = 0;
        break;
    }
  }
  return { ...auto, kind, estMonthlyCost, source: 'override' };
}

/**
 * Build a map of merchantKey -> RecurrenceInfo for a transaction set, applying
 * any user overrides. Pass ALL transactions for the merchant (not just the
 * filtered set) so detection has enough history to be confident.
 */
export function buildRecurrenceMap(
  allTxns: Transaction[],
  overrides: MerchantOverride[]
): Map<string, RecurrenceInfo> {
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of allTxns) {
    const k = t.merchantKey || '';
    if (!k) continue;
    const list = byMerchant.get(k);
    if (list) list.push(t);
    else byMerchant.set(k, [t]);
  }
  const overrideMap = new Map(overrides.map((o) => [o.merchantKey, o]));
  const result = new Map<string, RecurrenceInfo>();
  for (const [merchantKey, txns] of byMerchant) {
    const recurringTxns = txns.filter(t => t.recurrence === 'recurring');
    if (recurringTxns.length === 0) continue;

    const auto = detectRecurrence(txns.filter(t => t.amount < 0));
    const final = applyOverride(auto, overrideMap.get(merchantKey));

    if (final.kind === 'none') {
      final.kind = 'monthly';
      const meanAmount = recurringTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0) / recurringTxns.length;
      final.meanAmount = meanAmount;
      final.estMonthlyCost = meanAmount;
    }

    final.count = recurringTxns.length;
    final.lastDate = recurringTxns[recurringTxns.length - 1]?.date ?? null;

    result.set(merchantKey, final);
  }
  return result;
}

export function isRecurring(kind: RecurrenceKind): boolean {
  return kind !== 'none';
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

export function resolveRecurrenceForTransaction(
  txn: Omit<Transaction, 'id' | 'recurrence'> & { recurrenceOverride?: 'recurring' | 'onetime' | null },
  categoryMap: Map<string, Category>,
  merchantOverrideMap: Map<string, MerchantOverride>,
  autoRecurringMerchantKeys: Set<string>
): 'recurring' | 'onetime' {
  // 1. Transaction override
  if (txn.recurrenceOverride === 'recurring') return 'recurring';
  if (txn.recurrenceOverride === 'onetime') return 'onetime';

  // 2. Merchant override
  const mkey = txn.merchantKey;
  if (mkey) {
    const override = merchantOverrideMap.get(mkey);
    if (override) {
      return override.recurrence === 'none' ? 'onetime' : 'recurring';
    }
  }

  // 3. Auto-detection fallback
  if (mkey && autoRecurringMerchantKeys.has(mkey)) {
    return 'recurring';
  }

  // 4. Category default
  const cat = categoryMap.get(txn.category);
  if (cat?.defaultRecurrence) {
    return cat.defaultRecurrence;
  }

  return 'onetime';
}

export async function refreshRecurrenceAll(): Promise<{ updated: number }> {
  const categories = await db.categories.toArray();
  const overrides = await db.merchantOverrides.toArray();
  const allTxns = await db.transactions.toArray();

  const categoryMap = new Map(categories.map((c) => [c.name, c]));
  const merchantOverrideMap = new Map(overrides.map((o) => [o.merchantKey, o]));

  const byMerchant = new Map<string, Transaction[]>();
  for (const t of allTxns) {
    const k = t.merchantKey || '';
    if (!k) continue;
    const list = byMerchant.get(k);
    if (list) list.push(t);
    else byMerchant.set(k, [t]);
  }

  const autoRecurringMerchantKeys = new Set<string>();
  for (const [mkey, txns] of byMerchant) {
    const auto = detectRecurrence(txns);
    if (auto.kind !== 'none') {
      autoRecurringMerchantKeys.add(mkey);
    }
  }

  let updated = 0;
  await db.transaction('rw', db.transactions, async () => {
    for (const t of allTxns) {
      const resolved = resolveRecurrenceForTransaction(
        t,
        categoryMap,
        merchantOverrideMap,
        autoRecurringMerchantKeys
      );
      if (t.recurrence !== resolved) {
        await db.transactions.update(t.id!, { recurrence: resolved });
        updated++;
      }
    }
  });

  return { updated };
}
