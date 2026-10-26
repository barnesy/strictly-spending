import { api } from '../api';
import type { CategoryRule, Source } from '../types';

import { refreshRecurrenceAll } from './recurrence';
import { normalizeForMatch, deriveRulePattern } from '../lib';
export { deriveRulePattern };

const SOURCE_CATEGORY_MAP: Record<string, string> = {
  // Chase top-level Categories
  'Bills & Utilities': 'Utilities',
  Entertainment: 'Entertainment',
  'Fees & Adjustments': 'Fees & Interest',
  Shopping: 'Shopping',
  'Food & Drink': 'Restaurants & Coffee',
  Gas: 'Transportation',
  Groceries: 'Groceries',
  Travel: 'Travel',
  'Health & Wellness': 'Health',
  Personal: 'Personal Care',
  Home: 'Shopping',
  Automotive: 'Transportation',
  'Gifts & Donations': 'Shopping',
  'Professional Services': 'Shopping',
  Education: 'Shopping',

  // BOA credit "Expense Category" values
  'Amusement and Entertainment': 'Entertainment',
  'Business Services': 'Shopping',
  'Mail Order/Telephone Order Providers': 'Shopping',
  Transportation: 'Transportation',
  Utilities: 'Utilities',
  'Wholesale Distributors & Manufacturers': 'Shopping',
  'Service Stations': 'Transportation',
  'Eating Places, Restaurants': 'Restaurants & Coffee',
  Restaurants: 'Restaurants & Coffee',

  // Truist top-level Categories (parser passes sub-category when available; these
  // are fallbacks for rows where sub-category is empty).
  'Dining & Entertainment': 'Restaurants & Coffee',
  Household: 'Shopping',
  Auto: 'Transportation',
  Insurance: 'Insurance',
  Health: 'Health',
  Loans: 'Student Loans',
  Deposits: 'Income',
  'Transfers & Payments': 'Transfers',
  'Cash & Checks': 'Transfers',
  'Taxes & Fees': 'Taxes',
  Family: 'Shopping',
  Business: 'Shopping',

  // Truist Sub-category values (more precise; preferred when present)
  // Dining & Entertainment
  'Fast food': 'Restaurants & Coffee',
  'Cafes & coffee shops': 'Restaurants & Coffee',
  'Bars & pubs': 'Restaurants & Coffee',
  'Digital entertainment': 'Entertainment',
  'Movies music & shows': 'Entertainment',
  Attractions: 'Entertainment',
  // Shopping
  'Beauty products': 'Personal Care',
  'Hobbies & gifts': 'Shopping',
  'Clothing shoes & accessories': 'Shopping',
  'Department & discount stores': 'Shopping',
  Furniture: 'Shopping',
  Jewelry: 'Shopping',
  'Other shopping': 'Shopping',
  // Groceries
  'Supermarket grocery & convenience stores': 'Groceries',
  'Liquor stores': 'Groceries',
  // Utilities
  Electricity: 'Utilities',
  'Other utilities': 'Utilities',
  // Auto
  'Gas stations': 'Transportation',
  'Vehicle operating expenses': 'Transportation',
  'Vehicle dealers': 'Transportation',
  'Parking & tolls': 'Transportation',
  // Loans
  'Student loans': 'Student Loans',
  // Transfers & Payments
  'Transfers between own accounts': 'Transfers',
  P2P: 'Transfers',
  'Digital wallet': 'Transfers',
  // Insurance
  'Special insurance': 'Insurance',
  // Health
  'Fitness & leisure': 'Health',
  'Drugs & pharmacy': 'Health',
  'Medical & healthcare': 'Health',
  // Household
  Cleaning: 'Shopping',
  'Hardware & appliances': 'Shopping',
  Gardening: 'Shopping',
  // Family
  "Children's clothing stores": 'Shopping',
  // Cash & Checks
  'Cash withdrawals': 'Transfers',
  // Taxes & Fees
  'Other fees and charges': 'Fees & Interest',
  'Government services': 'Taxes',
  'Taxes fines & bail bonds': 'Taxes',
  // Travel
  'Hotels resorts & lodgings': 'Travel',
  Airlines: 'Travel',
  // Deposits
  Paychecks: 'Income',
  // Business (Truist)
  'Photography publishing & printing': 'Shopping',
  'Electronics & computers': 'Shopping',
  // Capital One / Discover / Amex / Citi / Apple Card common categories
  Dining: 'Restaurants & Coffee',
  'Merchandise': 'Shopping',
  'Supermarkets': 'Groceries',
  'Gas/Automotive': 'Transportation',
  'Phone/Cable': 'Utilities',
  'Internet': 'Utilities',
  'Airfare': 'Travel',
  'Lodging': 'Travel',
  'Other Travel': 'Travel',
  'Healthcare': 'Health',
  'Medical Services': 'Health',
  'Payment/Credit': 'Transfers',
  'Payments and Credits': 'Transfers',
  'Payment': 'Transfers',
  'Awards and Rebate Credits': 'Income',
  // Other
  Other: 'Uncategorized',
  'Other Services': 'Shopping',
};

export function normalizeRawCategory(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return SOURCE_CATEGORY_MAP[trimmed] ?? null;
}

export function extractMerchantKey(description: string): string {
  let s = description.toLowerCase();
  // Strip processor prefixes like "SQ *", "TST*", "SP *", "PY *"
  s = s.replace(/^[a-z]{1,3}\s*\*+/, '');
  s = s.replace(/^\s*[a-z]{2,4}\*+/i, '');
  // Strip dates (mm/dd, mm/dd/yyyy)
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ');
  // Strip any digit run of 4+ digits (refs, phone numbers, store IDs) — no word
  // boundary required, because banks often glue them to merchant names (e.g. "OIL13076915").
  s = s.replace(/\d{4,}/g, ' ');
  // Strip trailing city + state code (e.g. "STARBUCKS BROOKLYN NY")
  s = s.replace(/\s+[a-z]{2}\s*$/i, '');
  // Strip common bank/POS verbs
  s = s.replace(
    /\b(mobile purchase|purchase|debit card|des:|id:|indn:|co id:|ach|web|ppd|tel|pos|recurring|payment)\b/gi,
    ' '
  );
  // Strip punctuation
  s = s.replace(/[^a-z0-9\s]+/g, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // Take first ~40 chars
  return s.slice(0, 40);
}

export interface CategorizeContext {
  rules: CategoryRule[];
  compiledRules?: CompiledCategoryRule[];
}

export interface CompiledCategoryRule {
  rule: CategoryRule;
  normPattern: string;
  patternLength: number;
  regex: RegExp;
}

export function compileRule(rule: CategoryRule): CompiledCategoryRule | null {
  if (!rule.pattern) return null;
  const p = normalizeForMatch(rule.pattern);
  if (!p) return null;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
    return {
      rule,
      normPattern: p,
      patternLength: p.length,
      regex,
    };
  } catch {
    return null;
  }
}

export function compileRules(rules: CategoryRule[]): CompiledCategoryRule[] {
  const compiled: CompiledCategoryRule[] = [];
  for (const r of rules) {
    const c = compileRule(r);
    if (c) compiled.push(c);
  }
  return compiled;
}

const compiledRulesCache = new WeakMap<CategoryRule[], CompiledCategoryRule[]>();

export function getOrCompileRules(rules: CategoryRule[]): CompiledCategoryRule[] {
  let compiled = compiledRulesCache.get(rules);
  if (!compiled) {
    compiled = compileRules(rules);
    compiledRulesCache.set(rules, compiled);
  }
  return compiled;
}

export function matchPattern(text: string, pattern: string): boolean {
  if (!text || !pattern) return false;
  const p = normalizeForMatch(pattern);
  if (!p) return false;
  const t = normalizeForMatch(text);
  if (!t) return false;

  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
  return regex.test(t);
}

export function matchBestCompiledRule(
  normalizedDesc: string,
  normalizedMkey: string,
  compiledRules: CompiledCategoryRule[]
): CategoryRule | null {
  let best: CompiledCategoryRule | null = null;
  for (const cr of compiledRules) {
    if ((normalizedDesc && cr.regex.test(normalizedDesc)) || (normalizedMkey && cr.regex.test(normalizedMkey))) {
      if (
        !best ||
        cr.rule.priority > best.rule.priority ||
        (cr.rule.priority === best.rule.priority && cr.patternLength > best.patternLength) ||
        (cr.rule.priority === best.rule.priority &&
          cr.patternLength === best.patternLength &&
          (cr.rule.id ?? 0) > (best.rule.id ?? 0))
      ) {
        best = cr;
      }
    }
  }
  return best ? best.rule : null;
}

export function matchBestRule(
  description: string,
  merchantKey: string | undefined,
  rules: CategoryRule[]
): CategoryRule | null {
  const desc = normalizeForMatch(description);
  const mkey = merchantKey ? normalizeForMatch(merchantKey) : '';
  const compiled = getOrCompileRules(rules);
  return matchBestCompiledRule(desc, mkey, compiled);
}

export function categorize(
  description: string,
  merchantKey: string | undefined,
  rawCategory: string | undefined,
  ctx: CategorizeContext
): string {
  const desc = normalizeForMatch(description);
  const mkey = merchantKey ? normalizeForMatch(merchantKey) : '';
  const compiled = ctx.compiledRules ?? getOrCompileRules(ctx.rules);
  const best = matchBestCompiledRule(desc, mkey, compiled);
  if (best) return best.category;

  const fromSource = normalizeRawCategory(rawCategory);
  if (fromSource) return fromSource;

  return 'Uncategorized';
}

export function inferTypeCategory(
  amount: number,
  source: Source,
  rawCategory: string | undefined,
  accountType?: string,
  description?: string
): string | null {
  // Heuristic fallbacks for things rules might miss:
  // - Positive amount on any credit card account (or Chase/BoA credit source) -> Transfers
  // - Explicit credit card payment descriptions -> Transfers
  if (amount > 0 && !rawCategory) {
    if (source === 'chase' || source === 'boa-credit' || accountType === 'credit') {
      return 'Transfers';
    }
    if (
      description &&
      /\b(payment\s+thank\s+you|autopay|online\s+payment|mobile\s+pymt|credit\s+card\s+pmt|crcardpmt|epayment|payment\s+received)\b/i.test(
        description
      )
    ) {
      return 'Transfers';
    }
  }
  return null;
}

export interface RecategorizeProgress {
  processed: number;
  total: number;
  phase: string;
  percent: number;
}

export async function recategorizeAll(options?: {
  forceUserRules?: boolean;
  onProgress?: (progress: RecategorizeProgress) => void;
}): Promise<{ updated: number }> {
  options?.onProgress?.({
    processed: 0,
    total: 100,
    phase: 'Loading rules and transactions...',
    percent: 5,
  });
  await new Promise((r) => setTimeout(r, 0));

  options?.onProgress?.({
    processed: 50,
    total: 100,
    phase: 'Evaluating rules and updating categories...',
    percent: 50,
  });
  const updated = await api.recategorizeAll(options?.forceUserRules !== false);
  options?.onProgress?.({
    processed: 1,
    total: 1,
    phase: 'Updating recurrence schedules...',
    percent: 95,
  });
  await refreshRecurrenceAll();
  options?.onProgress?.({
    processed: 100,
    total: 100,
    phase: 'Complete',
    percent: 100,
  });
  return { updated };
}

export async function categorizeBatch(
  transactions: {
    description: string;
    merchantKey?: string;
    rawCategory?: string;
    amount: number;
    source: Source;
  }[]
): Promise<string[]> {
  const rules = await api.getRules();
  const compiledRules = compileRules(rules);
  const ctx: CategorizeContext = { rules, compiledRules };
  return transactions.map((t) => {
    let category = categorize(t.description, t.merchantKey, t.rawCategory, ctx);
    if (category === 'Uncategorized') {
      const inferred = inferTypeCategory(t.amount, t.source, t.rawCategory);
      if (inferred) category = inferred;
    }
    return category;
  });
}
