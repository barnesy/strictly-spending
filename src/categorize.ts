import { db } from './db/drizzle';
import * as schema from './db/schema';
import { eq } from 'drizzle-orm';
import type { CategoryRule, Source } from './types';

import { refreshRecurrenceAll } from './recurrence';
import { normalizeForMatch } from './lib';

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
  // Other
  Other: 'Uncategorized',
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
}



export function categorize(
  description: string,
  merchantKey: string | undefined,
  rawCategory: string | undefined,
  ctx: CategorizeContext
): string {
  const desc = normalizeForMatch(description);
  const mkey = merchantKey ? normalizeForMatch(merchantKey) : '';
  let best: CategoryRule | null = null;
  for (const rule of ctx.rules) {
    if (!rule.pattern) continue;
    const pattern = normalizeForMatch(rule.pattern);
    if (!pattern) continue;
    if (desc.includes(pattern) || (mkey && mkey.includes(pattern))) {
      if (!best || rule.priority > best.priority) {
        best = rule;
      }
    }
  }
  if (best) return best.category;

  const fromSource = normalizeRawCategory(rawCategory);
  if (fromSource) return fromSource;

  return 'Uncategorized';
}

export function inferTypeCategory(
  amount: number,
  source: Source,
  rawCategory: string | undefined
): string | null {
  // Heuristic fallbacks for things rules might miss:
  // - Chase positive amount (payment) -> Transfers
  // - BOA credit positive amount (credit/payment) -> Transfers
  if ((source === 'chase' || source === 'boa-credit') && amount > 0) {
    if (!rawCategory) return 'Transfers';
  }
  return null;
}

export async function recategorizeAll(): Promise<{ updated: number }> {
  const rules = await db.select().from(schema.rules);
  const ctx: CategorizeContext = { rules };

  let updated = 0;
  await (async () => {
    const all = await db.select().from(schema.transactions);
    for (const t of all) {
      if (t.userOverridden) continue;
      let category = categorize(t.description, t.merchantKey, t.rawCategory, ctx);
      if (category === 'Uncategorized') {
        const inferred = inferTypeCategory(t.amount, t.source, t.rawCategory);
        if (inferred) category = inferred;
      }
      if (category !== t.category) {
        await db.update(schema.transactions).set({ category }).where(eq(schema.transactions.id, t.id!));
        updated++;
      }
    }
  });
  
  await refreshRecurrenceAll();
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
  const rules = await db.select().from(schema.rules);
  const ctx: CategorizeContext = { rules };
  return transactions.map((t) => {
    let category = categorize(t.description, t.merchantKey, t.rawCategory, ctx);
    if (category === 'Uncategorized') {
      const inferred = inferTypeCategory(t.amount, t.source, t.rawCategory);
      if (inferred) category = inferred;
    }
    return category;
  });
}
