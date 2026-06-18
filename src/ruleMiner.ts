import { db } from './db';

export interface RuleSuggestion {
  pattern: string;
  category: string;
  overridesCount: number;
  sampleDescription: string;
}

export async function mineRuleSuggestions(): Promise<RuleSuggestion[]> {
  // 1. Fetch all rules and overridden transactions
  const rules = await db.rules.toArray();
  const overriddenTxns = await db.transactions
    .filter(t => !!t.userOverridden && t.category !== 'Uncategorized')
    .toArray();
    
  if (overriddenTxns.length === 0) return [];
  
  // 2. Count overrides by merchantKey + category
  // Map key: "merchantKey|category" -> { count, sampleDescription }
  const counts = new Map<string, { count: number; sampleDescription: string }>();
  
  for (const t of overriddenTxns) {
    if (!t.merchantKey) continue;
    const key = `${t.merchantKey.toLowerCase()}|${t.category}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { count: 1, sampleDescription: t.description });
    }
  }
  
  // 3. Find suggestions with at least 2 overrides
  const candidates: RuleSuggestion[] = [];
  for (const [key, info] of counts.entries()) {
    if (info.count < 2) continue;
    const [merchantKey, category] = key.split('|');
    candidates.push({
      pattern: merchantKey,
      category,
      overridesCount: info.count,
      sampleDescription: info.sampleDescription,
    });
  }
  
  // 4. Filter out candidates that already match existing rules
  // If there's an existing rule whose pattern is a case-insensitive substring of the candidate pattern,
  // or if the candidate pattern is a substring of an existing rule pattern with the same category, skip it.
  const suggestions = candidates.filter(candidate => {
    const patternLower = candidate.pattern.toLowerCase();
    const hasMatchingRule = rules.some(rule => {
      const rulePatLower = rule.pattern.toLowerCase();
      // If the patterns match exactly, or one is a substring of another and targets the same category
      return rulePatLower === patternLower || 
        (patternLower.includes(rulePatLower) && rule.category === candidate.category);
    });
    return !hasMatchingRule;
  });
  
  // Sort by override count descending
  return suggestions.sort((a, b) => b.overridesCount - a.overridesCount);
}
