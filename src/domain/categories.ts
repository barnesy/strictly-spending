/**
 * Canonical category taxonomy constants and normalizers.
 * Ensures starter rules, demo data, loan matchers, and budget rollups
 * reference identical category names.
 */

export const CANONICAL_CATEGORIES = {
  GROCERIES: 'Groceries',
  RESTAURANTS: 'Restaurants & Coffee',
  TRANSPORTATION: 'Transportation',
  AUTO_LOAN: 'Auto Loan',
  UTILITIES: 'Utilities',
  SUBSCRIPTIONS: 'Subscriptions',
  HOUSING: 'Housing',
  MORTGAGE: 'Mortgage',
  STUDENT_LOANS: 'Student Loans',
  SHOPPING: 'Shopping',
  ENTERTAINMENT: 'Entertainment',
  HEALTH: 'Health',
  INSURANCE: 'Insurance',
  TAXES: 'Taxes',
  TRAVEL: 'Travel',
  PERSONAL_CARE: 'Personal Care',
  FEES_AND_INTEREST: 'Fees & Interest',
  INCOME: 'Income',
  TRANSFERS: 'Transfers',
  UNCATEGORIZED: 'Uncategorized',
} as const;

export type CanonicalCategoryName =
  (typeof CANONICAL_CATEGORIES)[keyof typeof CANONICAL_CATEGORIES];

const CATEGORY_ALIASES: Record<string, CanonicalCategoryName> = {
  'gas station': CANONICAL_CATEGORIES.TRANSPORTATION,
  'gas stations': CANONICAL_CATEGORIES.TRANSPORTATION,
  'auto & transport': CANONICAL_CATEGORIES.TRANSPORTATION,
  'student loan': CANONICAL_CATEGORIES.STUDENT_LOANS,
  'student loans': CANONICAL_CATEGORIES.STUDENT_LOANS,
  'home loan': CANONICAL_CATEGORIES.MORTGAGE,
  'mortgage': CANONICAL_CATEGORIES.MORTGAGE,
  'car loan': CANONICAL_CATEGORIES.AUTO_LOAN,
  'auto loan': CANONICAL_CATEGORIES.AUTO_LOAN,
  'dining': CANONICAL_CATEGORIES.RESTAURANTS,
  'restaurants': CANONICAL_CATEGORIES.RESTAURANTS,
  'transfer': CANONICAL_CATEGORIES.TRANSFERS,
  'credit card payment': CANONICAL_CATEGORIES.TRANSFERS,
};

/**
 * Normalizes legacy or alias category names (e.g. "Gas Station" -> "Transportation",
 * "Student Loan" -> "Student Loans", "Home Loan" -> "Mortgage") to the canonical name.
 */
export function normalizeCategoryName(category: string | null | undefined): string {
  const trimmed = (category || '').trim();
  if (!trimmed) return CANONICAL_CATEGORIES.UNCATEGORIZED;
  const alias = CATEGORY_ALIASES[trimmed.toLowerCase()];
  return alias || trimmed;
}
