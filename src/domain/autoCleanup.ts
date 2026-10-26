import { api } from '../api';
import { categorize, inferTypeCategory, getOrCompileRules } from './categorize';
import type { CategorizeContext } from './categorize';
import { refreshRecurrenceAll } from './recurrence';
import { normalizeForMatch } from '../lib';
import { useFilters } from '../stores/store';
import type { CategoryRule } from '../types';

export interface TransactionPreview {
  id: number;
  date: string;
  description: string;
  amount: number;
}

export interface RuleSuggestion {
  pattern: string;
  category: string;
  transactions: TransactionPreview[];
}

export interface RedundantRule {
  ruleId: number;
  pattern: string;
  category: string;
  reason: string;
}

export interface RetroactiveCategoryChange {
  transactionId: number;
  date: string;
  description: string;
  amount: number;
  oldCategory: string;
  newCategory: string;
}

export interface TransferPairCandidate {
  pairKey: string;
  amountAbs: number;
  outflowTxn: {
    id: number;
    date: string;
    accountName: string;
    description: string;
    currentCategory: string;
  };
  inflowTxn: {
    id: number;
    date: string;
    accountName: string;
    description: string;
    currentCategory: string;
  };
}

export interface DuplicateTransactionCandidate {
  duplicateId: number;
  keepId: number;
  date: string;
  accountName: string;
  amount: number;
  duplicateDescription: string;
  keepDescription: string;
  reason: string;
}

export interface CleanupReport {
  suggestions: RuleSuggestion[];
  redundantRules: RedundantRule[];
  retroactiveChanges: RetroactiveCategoryChange[];
  transferPairs: TransferPairCandidate[];
  duplicateCandidates: DuplicateTransactionCandidate[];
}

function daysBetweenDates(d1: string, d2: string): number {
  const t1 = Date.parse(d1);
  const t2 = Date.parse(d2);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 999;
  return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
}

const TRANSFER_HINT_RX =
  /\b(transfer|xfer|wire|pmt|payment|autopay|epayment|crcardpmt|zelle|venmo|online|check|sav|chk|ach|credit\s*crd|card|robinhood|coinbase|fidelity|vanguard|schwab|wealthfront|betterment|acorns|etrade|merrill|ally|sofi|marcus|truist|boa|chase|citi|amex|discover|capital\s*one|wells\s*fargo|usaa|chime)\b/i;

export async function generateCleanupReport(): Promise<CleanupReport> {
  const isDemo = !!useFilters.getState().demoMode;
  const [rules, rawTxns, accounts] = await Promise.all([
    api.getRules(),
    api.getTransactions(),
    api.getAccounts(),
  ]);
  const accountNameById = new Map<number, string>();
  const accountTypeById = new Map<number, string>();
  const dynamicInstTokens = new Set<string>();
  for (const a of accounts) {
    if (a.id !== undefined) {
      accountNameById.set(a.id, a.name);
      accountTypeById.set(a.id, a.type);
    }
    for (const raw of [a.institution, a.name, a.last4]) {
      if (!raw) continue;
      for (const word of raw.toLowerCase().split(/[^a-z0-9]+/)) {
        if (word.length >= 4 && !/^(bank|checking|savings|credit|card|account|personal)$/.test(word)) {
          dynamicInstTokens.add(word);
        }
      }
    }
  }
  const hasTransferHint = (desc: string): boolean => {
    if (TRANSFER_HINT_RX.test(desc)) return true;
    const lower = desc.toLowerCase();
    for (const tok of dynamicInstTokens) {
      if (lower.includes(tok)) return true;
    }
    return false;
  };
  const allTxns = rawTxns.filter((t) => (isDemo ? t.source === 'demo' : t.source !== 'demo'));

  // Build dominant historical category per normalized merchant stem
  const stemCategoryTallies = new Map<string, Map<string, number>>();
  for (const t of allTxns) {
    if (t.category === 'Uncategorized') continue;
    const stem = normalizeForMatch(t.merchantKey || '') || normalizeForMatch(t.description);
    if (!stem || stem.length < 3) continue;
    let catMap = stemCategoryTallies.get(stem);
    if (!catMap) {
      catMap = new Map<string, number>();
      stemCategoryTallies.set(stem, catMap);
    }
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + 1);
  }

  const dominantStemCategory = new Map<string, string>();
  for (const [stem, catMap] of stemCategoryTallies.entries()) {
    let bestCat = '';
    let bestCount = 0;
    for (const [cat, cnt] of catMap.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        bestCat = cat;
      }
    }
    if (bestCat) {
      dominantStemCategory.set(stem, bestCat);
    }
  }

  // 1. Mine Suggestions (from manual overrides + repeated uncategorized stems with known historical categories)
  const overriddenTxns = allTxns.filter((t) => !!t.userOverridden && t.category !== 'Uncategorized');
  const counts = new Map<string, { category: string; transactions: TransactionPreview[] }>();
  for (const t of overriddenTxns) {
    if (!t.merchantKey) continue;
    const cleanPat = normalizeForMatch(t.merchantKey);
    if (!cleanPat || cleanPat.length < 3) continue;
    const key = `${cleanPat}|${t.category}`;
    const existing = counts.get(key);
    const preview = { id: t.id!, date: t.date, description: t.description, amount: t.amount };
    if (existing) {
      existing.transactions.push(preview);
    } else {
      counts.set(key, { category: t.category, transactions: [preview] });
    }
  }

  // Also check Uncategorized transactions that match a dominant historical merchant stem
  for (const t of allTxns) {
    if (t.category !== 'Uncategorized') continue;
    const stem = normalizeForMatch(t.merchantKey || '');
    if (!stem || stem.length < 3) continue;
    const histCat = dominantStemCategory.get(stem);
    if (!histCat) continue;
    const key = `${stem}|${histCat}`;
    const existing = counts.get(key);
    const preview = { id: t.id!, date: t.date, description: t.description, amount: t.amount };
    if (existing) {
      existing.transactions.push(preview);
    } else {
      counts.set(key, { category: histCat, transactions: [preview] });
    }
  }

  const candidates: RuleSuggestion[] = [];
  for (const [key, info] of counts.entries()) {
    if (info.transactions.length < 2) continue;
    const [merchantKey] = key.split('|');
    candidates.push({
      pattern: merchantKey,
      category: info.category,
      transactions: info.transactions,
    });
  }

  const compiledRules = getOrCompileRules(rules);

  const suggestions = candidates
    .filter((candidate) => {
      const patternLower = normalizeForMatch(candidate.pattern);
      return !compiledRules.some((rule) => {
        return (
          rule.normPattern === patternLower ||
          (patternLower.includes(rule.normPattern) && rule.rule.category === candidate.category)
        );
      });
    })
    .sort((a, b) => b.transactions.length - a.transactions.length);

  // 2. Identify Redundant Rules
  const redundantRules: RedundantRule[] = [];
  for (let i = 0; i < rules.length; i++) {
    const ruleA = rules[i];
    if (!ruleA.id) continue;
    const patA = normalizeForMatch(ruleA.pattern);

    for (let j = 0; j < rules.length; j++) {
      if (i === j) continue;
      const ruleB = rules[j];
      const patB = normalizeForMatch(ruleB.pattern);

      if (patA === patB && ruleA.category === ruleB.category) {
        if (
          ruleB.priority > ruleA.priority ||
          (ruleB.priority === ruleA.priority && ruleB.id! > ruleA.id)
        ) {
          redundantRules.push({
            ruleId: ruleA.id,
            pattern: ruleA.pattern,
            category: ruleA.category,
            reason: 'Exact duplicate of another rule.',
          });
          break;
        }
      } else if (patA.includes(patB) && patA !== patB && ruleA.category === ruleB.category) {
        redundantRules.push({
          ruleId: ruleA.id,
          pattern: ruleA.pattern,
          category: ruleA.category,
          reason: `Made redundant by broader rule: "${ruleB.pattern}"`,
        });
        break;
      }
    }
  }

  // 3. Detect Cross-Account Transfer Pairs (+$X / -$X within 3 days across different accounts)
  const transferPairs: TransferPairCandidate[] = [];
  const byCents = new Map<number, typeof allTxns>();
  for (const t of allTxns) {
    if (!t.id || t.amount === 0) continue;
    const cents = Math.round(Math.abs(t.amount) * 100);
    if (cents < 500) continue; // Ignore < $5.00
    let bucket = byCents.get(cents);
    if (!bucket) {
      bucket = [];
      byCents.set(cents, bucket);
    }
    bucket.push(t);
  }

  const pairedTxnIds = new Set<number>();
  for (const [cents, group] of byCents.entries()) {
    const outflows = group.filter((t) => t.amount < 0);
    const inflows = group.filter((t) => t.amount > 0);
    if (outflows.length === 0 || inflows.length === 0) continue;

    for (const out of outflows) {
      if (!out.id || pairedTxnIds.has(out.id)) continue;
      if (out.userOverridden && out.category !== 'Transfers') continue;

      let bestIn: (typeof inflows)[number] | null = null;
      let bestDays = 999;

      for (const inf of inflows) {
        if (!inf.id || pairedTxnIds.has(inf.id)) continue;
        if (inf.accountId === out.accountId) continue;
        if (inf.userOverridden && inf.category !== 'Transfers') continue;
        if (out.category === 'Transfers' && inf.category === 'Transfers') continue;

        const days = daysBetweenDates(out.date, inf.date);
        if (days <= 3 && days < bestDays) {
          const hasHint =
            cents >= 10000 ||
            out.category === 'Transfers' ||
            inf.category === 'Transfers' ||
            hasTransferHint(out.description) ||
            hasTransferHint(inf.description);
          if (hasHint) {
            bestDays = days;
            bestIn = inf;
          }
        }
      }

      if (bestIn && bestIn.id) {
        pairedTxnIds.add(out.id);
        pairedTxnIds.add(bestIn.id);
        transferPairs.push({
          pairKey: `${out.id}-${bestIn.id}`,
          amountAbs: cents / 100,
          outflowTxn: {
            id: out.id,
            date: out.date,
            accountName: accountNameById.get(out.accountId) || `Account #${out.accountId}`,
            description: out.description,
            currentCategory: out.category,
          },
          inflowTxn: {
            id: bestIn.id,
            date: bestIn.date,
            accountName: accountNameById.get(bestIn.accountId) || `Account #${bestIn.accountId}`,
            description: bestIn.description,
            currentCategory: bestIn.category,
          },
        });
      }
    }
  }
  transferPairs.sort((a, b) => b.outflowTxn.date.localeCompare(a.outflowTxn.date));

  // 4. Detect Exact & Cross-Source Duplicate Transactions within the same account
  const duplicateCandidates: DuplicateTransactionCandidate[] = [];
  const usedDupIds = new Set<number>();
  const byAccountAndSignedCents = new Map<string, typeof allTxns>();
  for (const t of allTxns) {
    if (!t.id) continue;
    const signedCents = Math.round(t.amount * 100);
    const key = `${t.accountId}|${signedCents}`;
    let bucket = byAccountAndSignedCents.get(key);
    if (!bucket) {
      bucket = [];
      byAccountAndSignedCents.set(key, bucket);
    }
    bucket.push(t);
  }

  for (const group of byAccountAndSignedCents.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      if (!a.id || usedDupIds.has(a.id)) continue;
      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        if (!b.id || usedDupIds.has(b.id)) continue;
        const days = daysBetweenDates(a.date, b.date);
        if (days > 1) continue;

        const normDescA = normalizeForMatch(a.description);
        const normDescB = normalizeForMatch(b.description);
        const stemA = normalizeForMatch(a.merchantKey || '');
        const stemB = normalizeForMatch(b.merchantKey || '');

        const isSameDateExactDesc = days === 0 && normDescA.length >= 3 && normDescA === normDescB;
        const isCrossSourceSameMerchant =
          a.source !== b.source && stemA.length >= 3 && stemA === stemB;

        if (isSameDateExactDesc || isCrossSourceSameMerchant) {
          // Prefer keeping the non-pending or userOverridden or earlier ID transaction
          const keepFirst =
            (a.userOverridden && !b.userOverridden) ||
            (!a.isPending && b.isPending) ||
            a.id < b.id;
          const keep = keepFirst ? a : b;
          const dup = keepFirst ? b : a;
          usedDupIds.add(dup.id!);
          duplicateCandidates.push({
            duplicateId: dup.id!,
            keepId: keep.id!,
            date: dup.date,
            accountName: accountNameById.get(dup.accountId) || `Account #${dup.accountId}`,
            amount: dup.amount,
            duplicateDescription: dup.description,
            keepDescription: keep.description,
            reason: isCrossSourceSameMerchant
              ? `Cross-source duplicate (${keep.source} vs ${dup.source})`
              : 'Identical date, account, amount, and description',
          });
        }
      }
    }
  }
  duplicateCandidates.sort((a, b) => b.date.localeCompare(a.date));

  // 5. Retroactive Categorization
  const retroactiveChanges: RetroactiveCategoryChange[] = [];
  const ctx: CategorizeContext = { rules, compiledRules };
  for (const t of allTxns) {
    if (t.userOverridden || (t.id && pairedTxnIds.has(t.id))) continue;
    let newCategory = categorize(t.description, t.merchantKey, t.rawCategory, ctx);
    if (newCategory === 'Uncategorized') {
      const inferred = inferTypeCategory(
        t.amount,
        t.source,
        t.rawCategory,
        accountTypeById.get(t.accountId),
        t.description
      );
      if (inferred) newCategory = inferred;
    }
    if (newCategory === 'Uncategorized' && t.category === 'Uncategorized') {
      const stem = normalizeForMatch(t.merchantKey || '');
      const histCat = stem ? dominantStemCategory.get(stem) : undefined;
      if (histCat) newCategory = histCat;
    }

    if (newCategory !== t.category) {
      retroactiveChanges.push({
        transactionId: t.id!,
        date: t.date,
        description: t.description,
        amount: t.amount,
        oldCategory: t.category,
        newCategory,
      });
    }
  }

  return {
    suggestions,
    redundantRules,
    retroactiveChanges,
    transferPairs,
    duplicateCandidates,
  };
}

export async function executeCleanup(
  approvedSuggestions: { pattern: string; category: string }[],
  approvedRedundantRuleIds: number[],
  approvedRetroactiveTxns: { transactionId: number; category: string }[],
  approvedTransferPairTxnIds: number[] = [],
  approvedDuplicateTxnIdsToDelete: number[] = []
): Promise<void> {
  // 1. Delete redundant rules
  if (approvedRedundantRuleIds.length > 0) {
    for (const id of approvedRedundantRuleIds) {
      await api.deleteRule(id);
    }
  }

  // 2. Delete approved duplicate transactions
  if (approvedDuplicateTxnIdsToDelete.length > 0) {
    for (const id of approvedDuplicateTxnIdsToDelete) {
      await api.deleteTransaction(id);
    }
  }

  // 3. Add suggested rules
  const now = new Date().toISOString();
  for (const sug of approvedSuggestions) {
    await api.addRule({
      pattern: sug.pattern,
      category: sug.category,
      priority: 100,
      createdAt: now,
    } as Omit<CategoryRule, 'id'>);
  }

  // 4. Execute retroactive changes, transfer pair updates, and clear manual overrides for matched suggestions
  if (
    approvedRetroactiveTxns.length > 0 ||
    approvedSuggestions.length > 0 ||
    approvedTransferPairTxnIds.length > 0
  ) {
    const isDemo = !!useFilters.getState().demoMode;
    const rawTxns = await api.getTransactions();
    const allTxns = rawTxns.filter((t) => (isDemo ? t.source === 'demo' : t.source !== 'demo'));
    const approvedMap = new Map(approvedRetroactiveTxns.map((t) => [t.transactionId, t.category]));
    const transferSet = new Set(approvedTransferPairTxnIds);
    const toUpdate: typeof allTxns = [];

    for (const t of allTxns) {
      let modified = false;
      const next = { ...t };

      if (t.id && transferSet.has(t.id) && next.category !== 'Transfers') {
        next.category = 'Transfers';
        modified = true;
      }

      const approvedCategory = approvedMap.get(t.id!);
      if (approvedCategory && next.category !== approvedCategory) {
        next.category = approvedCategory;
        modified = true;
      }

      if (next.userOverridden && approvedSuggestions.length > 0) {
        for (const sug of approvedSuggestions) {
          if (
            next.merchantKey &&
            next.merchantKey.toLowerCase() === sug.pattern.toLowerCase() &&
            next.category === sug.category
          ) {
            next.userOverridden = false;
            modified = true;
            break;
          }
        }
      }

      if (modified) {
        toUpdate.push(next);
      }
    }

    if (toUpdate.length > 0) {
      await api.bulkUpdateTransactions(toUpdate);
    }
  }

  await refreshRecurrenceAll();
}
