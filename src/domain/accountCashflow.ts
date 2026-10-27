import type { Account } from '../types';
import type { DestinationAccount, IncomeStream } from '../api/scenarios';
import {
  computeTotalNetIncome,
  computeBaseCalendarNetIncome,
  computeBonusPaycheckWindfalls,
} from '../stores/forecastStore';

export type CheckingSourceKey = 'boa' | 'truist' | string;

/**
 * Returns all enabled depository accounts that act as operating cashflow accounts:
 * - Any `checking` account (or account named Checking / Banking / Cash Management / Money Market / Share Draft)
 * - Any `savings` account that directly receives an active income stream (e.g. high-yield savings with direct deposit)
 * - Falls back to enabled `savings` accounts if the user has no `checking` accounts connected.
 */
export function getOperatingCashAccounts(
  accounts: Account[] = [],
  incomeStreams: IncomeStream[] = []
): Account[] {
  const enabled = (accounts || []).filter((a) => a.enabled !== false);
  const streamAccountIds = new Set(
    (incomeStreams || [])
      .filter((s) => s.enabled && s.accountId !== undefined)
      .map((s) => s.accountId as number)
  );

  const primaryOperating = enabled.filter(
    (a) =>
      a.type === 'checking' ||
      /checking|banking|cash\s*management|money\s*market|share\s*draft/i.test(a.name || '') ||
      (a.type === 'savings' && a.id !== undefined && streamAccountIds.has(a.id))
  );

  if (primaryOperating.length > 0) {
    return primaryOperating;
  }

  // Fallback for users who only connect savings accounts and have no checking account
  return enabled.filter((a) => a.type === 'savings');
}

/**
 * Resolves the unique per-account key used by DestinationAccount.sourceAllocations
 * for a given checking account. Always prefers the account's unique ID so multiple
 * accounts at the same bank (e.g. Truist 1770, Truist 5463, Truist 4322) stay independent.
 */
export function getCheckingSourceKey(account?: Account | null): CheckingSourceKey | null {
  if (!account) return null;
  if (account.id !== undefined && account.id !== null) {
    return String(account.id);
  }
  const combined = `${account.name || ''} ${account.institution || ''} ${account.last4 || ''}`.toLowerCase();
  const hasFourDigitSuffix = /\b\d{4}\b/.test(combined);
  if (!hasFourDigitSuffix) {
    if (/bank\s*of\s*america|\bboa\b|bofa/.test(combined)) return 'boa';
    if (/truist/.test(combined)) return 'truist';
  }
  return account.name || null;
}

/**
 * Backward-compatible legacy alias key ('boa' or 'truist') for reading pre-existing
 * sourceAllocations before per-account ID keys were written.
 * Only matches the specific primary checking accounts (6669 for BoA, 5463 for Truist)
 * or unnumbered demo accounts so other Truist accounts (1770, 4322) never inherit it.
 */
export function getLegacyCheckingSourceKey(account?: Account | null): 'boa' | 'truist' | null {
  if (!account) return null;
  const combined = `${account.name || ''} ${account.institution || ''} ${account.last4 || ''}`.toLowerCase();
  if (/\b6669\b/.test(combined)) return 'boa';
  if (/\b5463\b/.test(combined)) return 'truist';
  const hasFourDigitSuffix = /\b\d{4}\b/.test(combined);
  if (!hasFourDigitSuffix) {
    if (/bank\s*of\s*america|\bboa\b|bofa/.test(combined)) return 'boa';
    if (/truist/.test(combined)) return 'truist';
  }
  return null;
}

/**
 * Reads the monthly savings/investment allocation from a single checking account into a destination.
 */
export function getSingleAccountSavingsAllocation(
  dest: DestinationAccount,
  account?: Account | null
): number {
  if (!account) return 0;
  const allocs = dest.sourceAllocations || {};
  const primaryKey = getCheckingSourceKey(account);
  if (primaryKey && allocs[primaryKey] !== undefined) {
    return Math.max(0, Number(allocs[primaryKey] || 0));
  }
  const legacyKey = getLegacyCheckingSourceKey(account);
  if (legacyKey && allocs[legacyKey] !== undefined) {
    return Math.max(0, Number(allocs[legacyKey] || 0));
  }
  return 0;
}

/**
 * Computes the total monthly savings/investment transfer out of a specific checking account
 * or subset of checking accounts (or across all accounts when `accountOrAccounts` is null/undefined).
 */
export function getAccountSavingsTransferOut(
  destinations: DestinationAccount[],
  accountOrAccounts?: Account | Account[] | null
): {
  totalTransferOut: number;
  breakdown: Array<{ id: string; name: string; amount: number; accountType: string }>;
} {
  const activeDests = (destinations || []).filter((d) => d.enabled);
  const accountsList = Array.isArray(accountOrAccounts)
    ? accountOrAccounts
    : accountOrAccounts
    ? [accountOrAccounts]
    : [];

  if (accountsList.length === 0) {
    const breakdown = activeDests
      .filter((d) => (d.monthlyAllocation || 0) > 0)
      .map((d) => ({
        id: d.id,
        name: d.name,
        amount: d.monthlyAllocation || 0,
        accountType: d.accountType,
      }));
    const totalTransferOut = breakdown.reduce((sum, d) => sum + d.amount, 0);
    return { totalTransferOut, breakdown };
  }

  const breakdown: Array<{ id: string; name: string; amount: number; accountType: string }> = [];

  for (const d of activeDests) {
    let amt = 0;
    const seenKeys = new Set<string>();
    for (const acc of accountsList) {
      const sourceKey = getCheckingSourceKey(acc);
      if (!sourceKey || seenKeys.has(sourceKey)) continue;
      seenKeys.add(sourceKey);
      amt += getSingleAccountSavingsAllocation(d, acc);
    }
    if (amt > 0) {
      breakdown.push({
        id: d.id,
        name: d.name,
        amount: amt,
        accountType: d.accountType,
      });
    }
  }

  const totalTransferOut = breakdown.reduce((sum, d) => sum + d.amount, 0);
  return { totalTransferOut, breakdown };
}

/**
 * Updates the monthly savings transfer out of a specific checking account (or set of accounts)
 * into the primary savings destination, preserving other checking accounts' allocations,
 * clearing duplicate allocations for the edited account from any secondary destinations,
 * and keeping `monthlyAllocation` synchronized.
 */
export function buildUpdatedDestinationsForAccountTransfer(
  destinations: DestinationAccount[],
  accountOrAccounts: Account | Account[] | null | undefined,
  newMonthlyTransferOut: number
): DestinationAccount[] {
  const cleanAmount = Math.max(0, Math.round(newMonthlyTransferOut));
  const accountsList = Array.isArray(accountOrAccounts)
    ? accountOrAccounts
    : accountOrAccounts
    ? [accountOrAccounts]
    : [];

  const baseDestinations: DestinationAccount[] =
    destinations && destinations.length > 0
      ? destinations
      : [
          {
            id: 'account-savings-transfer',
            name: 'Savings Transfer',
            accountType: 'savings',
            currentBalance: 0,
            realBalance: 0,
            monthlyAllocation: 0,
            sourceAllocations: {},
            annualGrowthRate: 4.0,
            enabled: true,
            isOverridden: true,
          },
        ];

  const targetDest =
    baseDestinations.find((d) => d.enabled && d.accountType === 'savings' && /\b3234\b|shared/i.test(d.name || '')) ||
    baseDestinations.find((d) => d.enabled && d.accountType === 'savings') ||
    baseDestinations.find((d) => d.accountType === 'savings') ||
    baseDestinations.find((d) => d.enabled) ||
    baseDestinations[0];

  if (!targetDest) return baseDestinations;

  // All Accounts / no specific checking account list provided
  if (accountsList.length === 0) {
    return baseDestinations.map((d) => {
      if (d.id === targetDest.id) {
        return {
          ...d,
          enabled: cleanAmount > 0 ? true : d.enabled,
          sourceAllocations: {},
          monthlyAllocation: cleanAmount,
          isOverridden: true,
        };
      }
      return {
        ...d,
        sourceAllocations: {},
        monthlyAllocation: 0,
        isOverridden: true,
      };
    });
  }

  // Collect keys for all target accounts being updated
  const targetKeys = new Set<string>();
  const legacyKeys = new Set<string>();
  for (const acc of accountsList) {
    const sk = getCheckingSourceKey(acc);
    if (sk) targetKeys.add(sk);
    const lk = getLegacyCheckingSourceKey(acc);
    if (lk) legacyKeys.add(lk);
  }

  if (targetKeys.size === 0) return baseDestinations;

  // Compute per-account split when multiple accounts are selected
  const nextAmountBySourceKey = new Map<string, number>();
  if (accountsList.length === 1) {
    const sk = getCheckingSourceKey(accountsList[0]);
    if (sk) nextAmountBySourceKey.set(sk, cleanAmount);
  } else {
    const currentAmounts = accountsList.map((acc) => {
      let sum = 0;
      for (const d of baseDestinations) {
        if (!d.enabled) continue;
        sum += getSingleAccountSavingsAllocation(d, acc);
      }
      return { key: getCheckingSourceKey(acc), amount: sum };
    }).filter((x): x is { key: string; amount: number } => Boolean(x.key));

    const currentTotal = currentAmounts.reduce((s, x) => s + x.amount, 0);
    if (currentTotal > 0) {
      let allocated = 0;
      currentAmounts.forEach((item, idx) => {
        if (idx === currentAmounts.length - 1) {
          nextAmountBySourceKey.set(item.key, Math.max(0, cleanAmount - allocated));
        } else {
          const share = Math.round((cleanAmount * item.amount) / currentTotal);
          nextAmountBySourceKey.set(item.key, share);
          allocated += share;
        }
      });
    } else if (currentAmounts[0]) {
      nextAmountBySourceKey.set(currentAmounts[0].key, cleanAmount);
      for (let i = 1; i < currentAmounts.length; i++) {
        nextAmountBySourceKey.set(currentAmounts[i].key, 0);
      }
    }
  }

  return baseDestinations.map((d) => {
    const prevAllocs = { ...(d.sourceAllocations || {}) };
    for (const lk of legacyKeys) {
      if (!targetKeys.has(lk) && prevAllocs[lk] !== undefined) {
        delete prevAllocs[lk];
      }
    }

    if (d.id === targetDest.id) {
      for (const [sk, amt] of nextAmountBySourceKey.entries()) {
        prevAllocs[sk] = amt;
      }
      const totalFromSources = Object.values(prevAllocs).reduce<number>(
        (sum, v) => sum + (typeof v === 'number' && !Number.isNaN(v) ? v : 0),
        0
      );
      return {
        ...d,
        enabled: totalFromSources > 0 ? true : d.enabled,
        sourceAllocations: prevAllocs,
        monthlyAllocation: totalFromSources,
        isOverridden: true,
      };
    }

    // Clear edited checking account(s) from all other destinations so they cannot double-count
    let modifiedOther = false;
    for (const sk of targetKeys) {
      if (prevAllocs[sk] !== undefined && prevAllocs[sk] !== 0) {
        prevAllocs[sk] = 0;
        modifiedOther = true;
      }
    }
    for (const lk of legacyKeys) {
      if (prevAllocs[lk] !== undefined) {
        delete prevAllocs[lk];
        modifiedOther = true;
      }
    }
    const hasSourceKeys = Object.keys(prevAllocs).length > 0;
    const totalFromSources = Object.values(prevAllocs).reduce<number>(
      (sum, v) => sum + (typeof v === 'number' && !Number.isNaN(v) ? v : 0),
      0
    );
    return {
      ...d,
      sourceAllocations: prevAllocs,
      monthlyAllocation: hasSourceKeys ? totalFromSources : modifiedOther ? 0 : d.monthlyAllocation,
      isOverridden: true,
    };
  });
}

/**
 * Filters income streams to those belonging to `accountScope` (single accountId or array of accountIds, when specified)
 * and computes both the base calendar monthly inflow (2x bi-weekly / 2x semi-monthly / 1x monthly)
 * and annualized monthly inflow, plus bonus paycheck windfalls over `months`.
 */
export function computeScopedAccountIncome(
  incomeStreams: IncomeStream[],
  taxRate: number,
  accountScope: number | number[] | null | undefined,
  useExactPaycheckCalendar: boolean = true,
  months: number = 36,
  incomeGaps: number[] = []
) {
  const allowedIds = Array.isArray(accountScope)
    ? new Set(accountScope)
    : accountScope != null
    ? new Set([accountScope])
    : null;

  const scopedStreams = (incomeStreams || []).filter((s) => {
    if (!s.enabled) return false;
    if (allowedIds && allowedIds.size > 0) {
      return s.accountId !== undefined && allowedIds.has(s.accountId);
    }
    return true;
  });

  const annualizedNetMonthly = computeTotalNetIncome(scopedStreams, taxRate);
  const baseCalendarNetMonthly = computeBaseCalendarNetIncome(scopedStreams, taxRate);
  const effectiveMonthlyInflow = useExactPaycheckCalendar
    ? baseCalendarNetMonthly
    : annualizedNetMonthly;

  const bonusWindfalls = useExactPaycheckCalendar
    ? computeBonusPaycheckWindfalls(scopedStreams, taxRate, months, incomeGaps)
    : [];

  return {
    scopedStreams,
    annualizedNetMonthly: Math.round(annualizedNetMonthly),
    baseCalendarNetMonthly: Math.round(baseCalendarNetMonthly),
    effectiveMonthlyInflow: Math.round(effectiveMonthlyInflow),
    bonusWindfalls,
  };
}
