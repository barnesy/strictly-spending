// Pure logic for the Sort view (rapid Uncategorized triage).
//
// Two responsibilities:
//   1. Group uncategorized transactions by merchantKey into "cards", ordered
//      by total absolute $ descending (highest-impact first).
//   2. Compute a smart-suggested category per card from cascading heuristics:
//      inferTypeCategory → fuzzy rule keyword match → recurring-amount lean.
//
// No React, no DB writes — easy to test in isolation.

import type {
  Category,
  CategoryRule,
  Transaction,
} from './types';
import { inferTypeCategory } from './categorize';
import type { RecurrenceInfo } from './recurrence';
import { isRecurring } from './recurrence';

export interface SortCard {
  /** Canonical merchant key, the grouping unit. */
  merchantKey: string;
  /** Every Uncategorized txn that shares this merchantKey. */
  txns: Transaction[];
  /** Sum of |amount| across all txns in this card. */
  totalAbs: number;
  /** 3 most recent samples, newest first, for display. */
  sampleTxns: Transaction[];
  /** Auto-detected recurrence info, if any. */
  recurrence?: RecurrenceInfo;
  /** Smart-suggested category name; null when no signal is strong enough. */
  suggestedCategory: string | null;
  /** Whether the dominant sign is income (positive) or spend (negative). */
  amountSign: 'spend' | 'income';
}

/**
 * Build the Sort queue from the current set of Uncategorized transactions.
 * Returns cards sorted by totalAbs descending so the user's first decisions
 * sweep the biggest dollar amounts.
 *
 * Passing `recurrenceMap` and `allRules` is required so the suggestion
 * heuristic has full context — see `suggestCategory`.
 */
export function buildSortQueue(
  uncategorizedTxns: Transaction[],
  recurrenceMap: Map<string, RecurrenceInfo>,
  categories: Category[],
  allRules: CategoryRule[]
): SortCard[] {
  // Group by merchantKey. Rows without a key still group under "" so they
  // don't get dropped — but in practice extractMerchantKey always returns
  // something.
  const byKey = new Map<string, Transaction[]>();
  for (const t of uncategorizedTxns) {
    const k = t.merchantKey || '';
    const list = byKey.get(k);
    if (list) list.push(t);
    else byKey.set(k, [t]);
  }

  const categoryNames = new Set(categories.map((c) => c.name));

  const cards: SortCard[] = [];
  for (const [merchantKey, txns] of byKey) {
    if (txns.length === 0) continue;

    // Newest-first samples
    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
    const sampleTxns = sorted.slice(0, 10);

    const totalAbs = txns.reduce((s, t) => s + Math.abs(t.amount), 0);
    const netSign =
      txns.reduce((s, t) => s + t.amount, 0) >= 0 ? 'income' : 'spend';

    const recurrence = recurrenceMap.get(merchantKey);
    const suggestion = suggestCategory(
      txns,
      merchantKey,
      recurrence,
      allRules,
      categoryNames
    );

    cards.push({
      merchantKey,
      txns,
      totalAbs,
      sampleTxns,
      recurrence,
      suggestedCategory: suggestion,
      amountSign: netSign,
    });
  }

  // Highest-impact first
  cards.sort((a, b) => b.totalAbs - a.totalAbs);
  return cards;
}

/**
 * Suggest a category for a merchant. Cascading fallbacks, all conservative —
 * we'd rather give NO suggestion than a wrong one (the user still has the
 * full grid).
 *
 * Order:
 *   1. inferTypeCategory (sign-based, e.g. Chase positive → Transfers)
 *   2. Fuzzy keyword match: any rule pattern that appears as a whole-word
 *      token inside the merchantKey. Highest-priority match wins. Tokenized
 *      to avoid "Groceries" matching "Demo Bookshop" via "shop"/"shopping".
 *   3. Recurring-amount lean: if monthly + amount range matches a typical
 *      bucket (Subscriptions for $5-50, Housing for $1000+, etc.).
 *   4. null (no suggestion).
 */
export function suggestCategory(
  txns: Transaction[],
  merchantKey: string,
  recurrence: RecurrenceInfo | undefined,
  allRules: CategoryRule[],
  validCategoryNames: Set<string>
): string | null {
  if (txns.length === 0) return null;
  const first = txns[0];

  // 1. inferTypeCategory — sign-based bucketing (positive on credit = Transfer)
  const inferred = inferTypeCategory(
    first.amount,
    first.source,
    first.rawCategory
  );
  if (inferred && validCategoryNames.has(inferred)) return inferred;

  // 2. Fuzzy keyword match: tokenize merchantKey, look for any rule pattern
  //    that appears as a whole token (or hyphen-separated subtoken). This is
  //    stricter than substring matching — "shop" won't match "shopping".
  const keyTokens = new Set(
    merchantKey
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );
  if (keyTokens.size > 0) {
    let best: CategoryRule | null = null;
    for (const rule of allRules) {
      if (!rule.pattern) continue;
      // A rule pattern might be multi-word (e.g. "whole foods") — match if
      // ALL of its tokens appear in the merchant key.
      const patternTokens = rule.pattern
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3);
      if (patternTokens.length === 0) continue;
      const allMatch = patternTokens.every((pt) => keyTokens.has(pt));
      if (!allMatch) continue;
      if (!validCategoryNames.has(rule.category)) continue;
      if (!best || rule.priority > best.priority) best = rule;
    }
    if (best) return best.category;
  }

  // 3. Recurring-amount lean. Only fires for definitively-recurring merchants
  //    with non-zero recent mean amount.
  if (
    recurrence &&
    isRecurring(recurrence.kind) &&
    recurrence.meanAmount > 0
  ) {
    const amt = recurrence.meanAmount;
    if (recurrence.kind === 'monthly') {
      if (amt >= 1000 && validCategoryNames.has('Housing')) return 'Housing';
      if (amt >= 5 && amt <= 50 && validCategoryNames.has('Subscriptions')) {
        return 'Subscriptions';
      }
    }
  }

  return null;
}

/**
 * Helper: count Uncategorized transactions. Used by the nav badge.
 * Centralized here so the query shape is consistent.
 */
export function countUncategorized(txns: Transaction[]): number {
  return txns.filter((t) => t.category === 'Uncategorized').length;
}
