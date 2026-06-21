import { db } from './db';
import { categorize, inferTypeCategory } from './categorize';
import type { CategorizeContext } from './categorize';
import { refreshRecurrenceAll } from './recurrence';
import { normalizeForMatch } from './lib';

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

export interface CleanupReport {
  suggestions: RuleSuggestion[];
  redundantRules: RedundantRule[];
  retroactiveChanges: RetroactiveCategoryChange[];
}

export async function generateCleanupReport(): Promise<CleanupReport> {
  const rules = await db.rules.toArray();
  const allTxns = await db.transactions.toArray();
  
  // 1. Mine Suggestions
  const overriddenTxns = allTxns.filter(t => !!t.userOverridden && t.category !== 'Uncategorized');
  const counts = new Map<string, { category: string; transactions: TransactionPreview[] }>();
  for (const t of overriddenTxns) {
    if (!t.merchantKey) continue;
    const key = `${t.merchantKey.toLowerCase()}|${t.category}`;
    const existing = counts.get(key);
    const preview = { id: t.id!, date: t.date, description: t.description, amount: t.amount };
    if (existing) {
      existing.transactions.push(preview);
    } else {
      counts.set(key, { category: t.category, transactions: [preview] });
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
  
  const suggestions = candidates.filter(candidate => {
    const patternLower = normalizeForMatch(candidate.pattern);
    return !rules.some(rule => {
      const rulePatLower = normalizeForMatch(rule.pattern);
      return rulePatLower === patternLower || 
        (patternLower.includes(rulePatLower) && rule.category === candidate.category);
    });
  }).sort((a, b) => b.transactions.length - a.transactions.length);

  // 2. Identify Redundant Rules
  const redundantRules: RedundantRule[] = [];
  for (let i = 0; i < rules.length; i++) {
    const ruleA = rules[i];
    if (!ruleA.id) continue;
    const patA = normalizeForMatch(ruleA.pattern);

    // Look for another rule that makes this one redundant
    for (let j = 0; j < rules.length; j++) {
      if (i === j) continue;
      const ruleB = rules[j];
      const patB = normalizeForMatch(ruleB.pattern);

      // Exact match, but B has higher priority or same priority and higher ID
      if (patA === patB && ruleA.category === ruleB.category) {
        if (ruleB.priority > ruleA.priority || (ruleB.priority === ruleA.priority && ruleB.id! > ruleA.id)) {
          redundantRules.push({
            ruleId: ruleA.id,
            pattern: ruleA.pattern,
            category: ruleA.category,
            reason: 'Exact duplicate of another rule.',
          });
          break; // Stop checking for A
        }
      } 
      // B's pattern is a substring of A's pattern AND they assign the same category
      // This means A is unnecessarily specific.
      else if (patA.includes(patB) && patA !== patB && ruleA.category === ruleB.category) {
        redundantRules.push({
          ruleId: ruleA.id,
          pattern: ruleA.pattern,
          category: ruleA.category,
          reason: `Made redundant by broader rule: "${ruleB.pattern}"`,
        });
        break; // Stop checking for A
      }
    }
  }

  // 3. Retroactive Categorization
  const retroactiveChanges: RetroactiveCategoryChange[] = [];
  const ctx: CategorizeContext = { rules };
  for (const t of allTxns) {
    if (t.userOverridden) continue;
    let newCategory = categorize(t.description, t.merchantKey, t.rawCategory, ctx);
    if (newCategory === 'Uncategorized') {
      const inferred = inferTypeCategory(t.amount, t.source, t.rawCategory);
      if (inferred) newCategory = inferred;
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

  return { suggestions, redundantRules, retroactiveChanges };
}

export async function executeCleanup(
  approvedSuggestions: { pattern: string; category: string }[],
  approvedRedundantRuleIds: number[],
  approvedRetroactiveTxns: { transactionId: number; category: string }[]
): Promise<void> {
  // 1. Delete redundant rules
  if (approvedRedundantRuleIds.length > 0) {
    await db.rules.bulkDelete(approvedRedundantRuleIds);
  }

  // 2. Add suggested rules
  const now = new Date().toISOString();
  for (const sug of approvedSuggestions) {
    await db.rules.add({
      pattern: sug.pattern,
      category: sug.category,
      priority: 100, // default priority
      createdAt: now,
    });
  }

  // Reload rules context if we changed them
  // (No longer needed since we use approved categories directly)
  
  // 3. Execute retroactive changes and clear manual overrides for matched suggestions
  await db.transaction('rw', db.transactions, async () => {
    // Process retroactive categorizations
    if (approvedRetroactiveTxns.length > 0) {
      const allTxns = await db.transactions.toArray();
      const approvedMap = new Map(approvedRetroactiveTxns.map(t => [t.transactionId, t.category]));
      
      for (const t of allTxns) {
        const approvedCategory = approvedMap.get(t.id!);
        if (approvedCategory) {
           await db.transactions.update(t.id!, { category: approvedCategory });
        }
      }
    }

    // Clear overrides for the accepted suggestions (consolidation)
    if (approvedSuggestions.length > 0) {
      const allTxns = await db.transactions.toArray();
      for (const t of allTxns) {
        if (!t.userOverridden) continue;
        for (const sug of approvedSuggestions) {
          if (t.merchantKey && t.merchantKey.toLowerCase() === sug.pattern.toLowerCase() && t.category === sug.category) {
             await db.transactions.update(t.id!, { userOverridden: false });
             break; // done with this transaction
          }
        }
      }
    }
  });

  await refreshRecurrenceAll();
}
