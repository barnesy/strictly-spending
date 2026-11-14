import type { Account, Transaction } from '../../types';
import { roundDollars, toCents, fromCents } from '../money';
import { normalizeTimelineMerchantKey } from './merchantIdentity';

export interface SafeCheckingBalanceSummary {
  postedBalance: number;
  availableBalance: number;
  pendingHoldAmount: number;
  itemizedPendingOutflow: number;
  unitemizedBankHold: number;
  unitemizedHoldByAccountId: Map<number, number>;
}

/**
 * Computes checking account balances accounting for both settled (`currentBalance` / `is_pending = 0`)
 * and pending (`is_pending = 1` + bank `available_balance` holds) transactions without double-counting.
 */
export function computeSafeCheckingBalances({
  accounts,
  simplefinAccounts = [],
  pendingTransactions = [],
}: {
  accounts: Account[];
  simplefinAccounts?: Array<{
    account_id?: string;
    name: string;
    balance?: number;
    available_balance?: number | null;
    strictly_account_id?: number | null;
  }>;
  pendingTransactions?: Transaction[];
}): SafeCheckingBalanceSummary {
  let postedBalanceCents = 0;
  let availableBalanceCents = 0;
  let itemizedPendingOutflowCents = 0;
  let unitemizedBankHoldCents = 0;
  const unitemizedHoldByAccountId = new Map<number, number>();

  const pendingOutflowByAccount = new Map<number, number>();
  for (const tx of pendingTransactions) {
    if (!tx.isPending || tx.amount >= 0) continue;
    if (tx.accountId !== undefined) {
      pendingOutflowByAccount.set(
        tx.accountId,
        (pendingOutflowByAccount.get(tx.accountId) || 0) + Math.abs(tx.amount)
      );
    }
  }

  for (const a of accounts) {
    const posted = Number(a.currentBalance || 0);
    postedBalanceCents += toCents(posted);

    const acctItemizedPending = a.id !== undefined ? pendingOutflowByAccount.get(a.id) || 0 : 0;
    itemizedPendingOutflowCents += toCents(acctItemizedPending);

    const sfMatch = simplefinAccounts.find(
      (sf) =>
        (a.id !== undefined && sf.strictly_account_id === a.id) ||
        (a.last4 && sf.name.includes(a.last4)) ||
        sf.name.toLowerCase() === a.name.toLowerCase()
    );

    const sfAvailable =
      sfMatch && typeof sfMatch.available_balance === 'number' && !Number.isNaN(sfMatch.available_balance)
        ? sfMatch.available_balance
        : null;
    const refPosted =
      sfMatch && typeof sfMatch.balance === 'number' && !Number.isNaN(sfMatch.balance) && sfMatch.balance > 0
        ? sfMatch.balance
        : posted;

    const bankReportedHold =
      sfAvailable !== null && sfAvailable >= 0 && sfAvailable < refPosted
        ? Math.max(0, refPosted - sfAvailable)
        : 0;

    // Never double-count: SimpleFIN's available_balance already deducts itemized pending transactions.
    // Take the larger of itemized pending outflows vs. the bank's total hold.
    const effectiveHold = Math.max(acctItemizedPending, bankReportedHold);
    const acctUnitemizedHold = Math.max(0, bankReportedHold - acctItemizedPending);

    availableBalanceCents += toCents(posted - effectiveHold);
    unitemizedBankHoldCents += toCents(acctUnitemizedHold);
    if (a.id !== undefined && acctUnitemizedHold > 0.01) {
      unitemizedHoldByAccountId.set(a.id, roundDollars(acctUnitemizedHold));
    }
  }

  const postedBalance = fromCents(postedBalanceCents);
  const availableBalance = fromCents(availableBalanceCents);
  const itemizedPendingOutflow = fromCents(itemizedPendingOutflowCents);
  const unitemizedBankHold = fromCents(unitemizedBankHoldCents);
  const pendingHoldAmount = Math.max(0, fromCents(postedBalanceCents - availableBalanceCents));

  return {
    postedBalance,
    availableBalance,
    pendingHoldAmount,
    itemizedPendingOutflow,
    unitemizedBankHold,
    unitemizedHoldByAccountId,
  };
}

const MANUAL_PAID_BILLS_STORAGE_KEY = 'strictly_manual_paid_bills_v1';
const fallbackMemoryManualPaidBills: Record<string, string[]> = {};

function buildManualBillToken(merchantKey: string, accountId?: number): string {
  const canon = normalizeTimelineMerchantKey(merchantKey) || merchantKey.toLowerCase().trim();
  return `${canon}::${accountId ?? 'any'}`;
}

export function getManualPaidBillTokens(monthKey: string): Set<string> {
  if (!monthKey) return new Set();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(MANUAL_PAID_BILLS_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      return new Set(parsed[monthKey] || []);
    }
    return new Set(fallbackMemoryManualPaidBills[monthKey] || []);
  } catch {
    return new Set(fallbackMemoryManualPaidBills[monthKey] || []);
  }
}

export function isBillManuallyMarkedPaid(
  monthKey: string | undefined,
  merchantKey: string,
  accountId?: number
): boolean {
  if (!monthKey || !merchantKey) return false;
  const set = getManualPaidBillTokens(monthKey);
  if (set.size === 0) return false;
  const exactToken = buildManualBillToken(merchantKey, accountId);
  const anyAccountToken = buildManualBillToken(merchantKey, undefined);
  return set.has(exactToken) || set.has(anyAccountToken);
}

export function setBillManuallyMarkedPaid(
  monthKey: string,
  merchantKey: string,
  paid: boolean,
  accountId?: number
): void {
  if (!monthKey || !merchantKey) return;
  try {
    let parsed: Record<string, string[]> = fallbackMemoryManualPaidBills;
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(MANUAL_PAID_BILLS_STORAGE_KEY);
      parsed = raw ? JSON.parse(raw) : {};
    }
    const set = new Set(parsed[monthKey] || []);
    const exactToken = buildManualBillToken(merchantKey, accountId);
    const anyToken = buildManualBillToken(merchantKey, undefined);
    if (paid) {
      set.add(exactToken);
      set.add(anyToken);
    } else {
      set.delete(exactToken);
      set.delete(anyToken);
    }
    parsed[monthKey] = Array.from(set);
    fallbackMemoryManualPaidBills[monthKey] = parsed[monthKey];
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(MANUAL_PAID_BILLS_STORAGE_KEY, JSON.stringify(parsed));
      window.dispatchEvent(new Event('db-update'));
      window.dispatchEvent(new CustomEvent('manual-paid-bills-changed', { detail: { monthKey } }));
    }
  } catch (e) {
    console.error('Failed to persist manual bill paid status:', e);
  }
}
