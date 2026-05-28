import { db } from './db';
import { recategorizeAll } from './categorize';
import type { Category, CategoryRule } from './types';

export const SEED_VERSION = 6;

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Groceries', color: '#4caf50', type: 'spend', sortOrder: 10 },
  { name: 'Restaurants & Coffee', color: '#ff7043', type: 'spend', sortOrder: 20 },
  { name: 'Transportation', color: '#5c6bc0', type: 'spend', sortOrder: 30 },
  { name: 'Auto Loan', color: '#3949ab', type: 'spend', sortOrder: 35 },
  { name: 'Utilities', color: '#26a69a', type: 'spend', sortOrder: 40 },
  { name: 'Subscriptions', color: '#ab47bc', type: 'spend', sortOrder: 50 },
  { name: 'Housing', color: '#8d6e63', type: 'spend', sortOrder: 60 },
  { name: 'Mortgage', color: '#6d4c41', type: 'spend', sortOrder: 65 },
  { name: 'Student Loans', color: '#5d4037', type: 'spend', sortOrder: 67 },
  { name: 'Shopping', color: '#ec407a', type: 'spend', sortOrder: 70 },
  { name: 'Entertainment', color: '#ffa726', type: 'spend', sortOrder: 80 },
  { name: 'Health', color: '#42a5f5', type: 'spend', sortOrder: 90 },
  { name: 'Insurance', color: '#0288d1', type: 'spend', sortOrder: 95 },
  { name: 'Taxes', color: '#455a64', type: 'spend', sortOrder: 100 },
  { name: 'Travel', color: '#66bb6a', type: 'spend', sortOrder: 110 },
  { name: 'Personal Care', color: '#d4af37', type: 'spend', sortOrder: 120 },
  { name: 'Fees & Interest', color: '#bdbdbd', type: 'spend', sortOrder: 130 },
  { name: 'Income', color: '#2e7d32', type: 'income', sortOrder: 200 },
  { name: 'Transfers', color: '#90a4ae', type: 'transfer', sortOrder: 210 },
  { name: 'Uncategorized', color: '#9e9e9e', type: 'spend', sortOrder: 999 },
];

const DEFAULT_RULES: Omit<CategoryRule, 'id' | 'createdAt'>[] = [
  // Subscriptions
  { pattern: 'NETFLIX', category: 'Subscriptions', priority: 100 },
  { pattern: 'SPOTIFY', category: 'Subscriptions', priority: 100 },
  { pattern: 'HULU', category: 'Subscriptions', priority: 100 },
  { pattern: 'DISNEY+', category: 'Subscriptions', priority: 100 },
  { pattern: 'YouTube', category: 'Subscriptions', priority: 100 },
  { pattern: 'CLAUDE.AI', category: 'Subscriptions', priority: 100 },
  { pattern: 'OPENAI', category: 'Subscriptions', priority: 100 },
  { pattern: 'CHATGPT', category: 'Subscriptions', priority: 100 },
  { pattern: 'GITHUB', category: 'Subscriptions', priority: 100 },
  { pattern: 'ICLOUD', category: 'Subscriptions', priority: 100 },
  { pattern: 'APPLE.COM/BILL', category: 'Subscriptions', priority: 100 },
  { pattern: 'GOOGLE *FI', category: 'Utilities', priority: 100 },
  { pattern: 'PlayStation', category: 'Entertainment', priority: 100 },
  { pattern: 'STEAM', category: 'Entertainment', priority: 100 },
  { pattern: 'AMC', category: 'Entertainment', priority: 95 },
  { pattern: 'AXS.COM', category: 'Entertainment', priority: 100 },

  // Groceries
  { pattern: 'WHOLE FOODS', category: 'Groceries', priority: 100 },
  { pattern: 'KROGER', category: 'Groceries', priority: 100 },
  { pattern: 'PUBLIX', category: 'Groceries', priority: 100 },
  { pattern: 'TRADER JOE', category: 'Groceries', priority: 100 },
  { pattern: 'ALDI', category: 'Groceries', priority: 100 },
  { pattern: 'SAFEWAY', category: 'Groceries', priority: 100 },
  { pattern: 'COSTCO', category: 'Groceries', priority: 100 },
  { pattern: 'INSTACART', category: 'Groceries', priority: 100 },

  // Restaurants & Coffee
  { pattern: 'STARBUCKS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CHIPOTLE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'MCDONALD', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DOORDASH', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'UBER EATS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'GRUBHUB', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CHICK-FIL-A', category: 'Restaurants & Coffee', priority: 100 },

  // Transportation (gas + rideshare + transit)
  { pattern: 'SHELL', category: 'Transportation', priority: 100 },
  { pattern: 'CHEVRON', category: 'Transportation', priority: 100 },
  { pattern: 'EXXON', category: 'Transportation', priority: 100 },
  { pattern: 'BP#', category: 'Transportation', priority: 100 },
  { pattern: 'UBER', category: 'Transportation', priority: 90 },
  { pattern: 'LYFT', category: 'Transportation', priority: 100 },
  { pattern: 'TRANSIT', category: 'Transportation', priority: 80 },
  { pattern: 'PARKING', category: 'Transportation', priority: 80 },
  { pattern: 'CRASH CHAMPIONS', category: 'Transportation', priority: 100 },
  { pattern: 'TESLA SUPERCHARGE', category: 'Transportation', priority: 100 },

  // Auto loan / lease payments
  { pattern: 'SANTANDER', category: 'Auto Loan', priority: 100 },
  { pattern: 'TOYOTA FIN', category: 'Auto Loan', priority: 100 },
  { pattern: 'HONDA FIN', category: 'Auto Loan', priority: 100 },
  { pattern: 'NISSAN FIN', category: 'Auto Loan', priority: 100 },
  { pattern: 'FORD CREDIT', category: 'Auto Loan', priority: 100 },
  { pattern: 'CAPITAL ONE AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'ALLY FINANCIAL', category: 'Auto Loan', priority: 100 },
  { pattern: 'CHASE AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'GM FINANCIAL', category: 'Auto Loan', priority: 100 },

  // Mortgage
  { pattern: 'ROCKET MORTGAGE', category: 'Mortgage', priority: 100 },
  { pattern: 'MR.COOPER', category: 'Mortgage', priority: 100 },
  { pattern: 'MR. COOPER', category: 'Mortgage', priority: 100 },
  { pattern: 'NSM DBAMR.COOPER', category: 'Mortgage', priority: 100 },
  { pattern: 'MORTGAGE', category: 'Mortgage', priority: 90 },
  { pattern: 'WELLS FARGO HOME', category: 'Mortgage', priority: 100 },
  { pattern: 'CHASE HOME', category: 'Mortgage', priority: 100 },
  { pattern: 'BANK OF AMERICA HOME', category: 'Mortgage', priority: 100 },

  // Student Loans
  { pattern: 'STUDENT LN DEPT EDUCATION', category: 'Student Loans', priority: 100 },
  { pattern: 'STUDENT LOAN', category: 'Student Loans', priority: 100 },
  { pattern: 'DEPT EDUCATION', category: 'Student Loans', priority: 95 },
  { pattern: 'NELNET', category: 'Student Loans', priority: 100 },
  { pattern: 'NAVIENT', category: 'Student Loans', priority: 100 },
  { pattern: 'SALLIE MAE', category: 'Student Loans', priority: 100 },

  // Insurance (auto, home, life, etc.)
  { pattern: 'GEICO', category: 'Insurance', priority: 100 },
  { pattern: 'STATE FARM', category: 'Insurance', priority: 100 },
  { pattern: 'ALLSTATE', category: 'Insurance', priority: 100 },
  { pattern: 'PROGRESSIVE', category: 'Insurance', priority: 100 },
  { pattern: 'USAA INSURANCE', category: 'Insurance', priority: 100 },
  { pattern: 'LIBERTY MUTUAL', category: 'Insurance', priority: 100 },
  { pattern: 'NATIONWIDE INS', category: 'Insurance', priority: 100 },
  { pattern: 'FARMERS INS', category: 'Insurance', priority: 100 },
  { pattern: 'HOMESITE', category: 'Insurance', priority: 100 },
  { pattern: 'ALLIANZ', category: 'Insurance', priority: 100 },
  { pattern: 'BLUE CROSS', category: 'Insurance', priority: 100 },
  { pattern: 'BLUECROSS', category: 'Insurance', priority: 100 },
  { pattern: 'ANTHEM', category: 'Insurance', priority: 100 },
  { pattern: 'AETNA', category: 'Insurance', priority: 100 },
  { pattern: 'CIGNA', category: 'Insurance', priority: 100 },
  { pattern: 'UNITEDHEALTH', category: 'Insurance', priority: 100 },
  { pattern: 'KAISER PERMANENTE', category: 'Insurance', priority: 100 },

  // Taxes
  { pattern: 'IRS DES:USATAXPYMT', category: 'Taxes', priority: 110 },
  { pattern: 'USATAXPYMT', category: 'Taxes', priority: 100 },
  { pattern: 'IRS ', category: 'Taxes', priority: 90 },
  { pattern: 'INTUIT *TURBOTAX', category: 'Taxes', priority: 100 },
  { pattern: 'TURBOTAX', category: 'Taxes', priority: 100 },
  { pattern: 'DEPT OF REVENUE', category: 'Taxes', priority: 100 },
  { pattern: 'DEPARTMENT OF REVENUE', category: 'Taxes', priority: 100 },
  { pattern: 'STATE TAX', category: 'Taxes', priority: 100 },
  { pattern: 'PROPERTY TAX', category: 'Taxes', priority: 100 },
  { pattern: 'FRANCHISE TAX', category: 'Taxes', priority: 100 },

  // Health
  { pattern: 'CVS/PHARMACY', category: 'Health', priority: 100 },
  { pattern: 'CVS PHARMACY', category: 'Health', priority: 100 },
  { pattern: 'WALGREENS', category: 'Health', priority: 100 },
  { pattern: 'RITE AID', category: 'Health', priority: 100 },
  { pattern: 'PHARMACY', category: 'Health', priority: 80 },
  { pattern: 'DENTAL', category: 'Health', priority: 90 },
  { pattern: 'DR.', category: 'Health', priority: 70 },
  { pattern: 'MEDICAL', category: 'Health', priority: 80 },
  { pattern: 'CLINIC', category: 'Health', priority: 80 },
  { pattern: 'HOSPITAL', category: 'Health', priority: 90 },

  // Utilities
  { pattern: 'COMCAST', category: 'Utilities', priority: 100 },
  { pattern: 'XFINITY', category: 'Utilities', priority: 100 },
  { pattern: 'AT&T', category: 'Utilities', priority: 100 },
  { pattern: 'VERIZON', category: 'Utilities', priority: 100 },
  { pattern: 'T-MOBILE', category: 'Utilities', priority: 100 },
  { pattern: 'POWER COMPANY', category: 'Utilities', priority: 100 },
  { pattern: 'ELECTRIC COMPANY', category: 'Utilities', priority: 100 },
  { pattern: 'WATER UTILITY', category: 'Utilities', priority: 100 },
  { pattern: 'NATURAL GAS', category: 'Utilities', priority: 95 },

  // Shopping
  { pattern: 'AMAZON', category: 'Shopping', priority: 90 },
  { pattern: 'AMZN', category: 'Shopping', priority: 90 },
  { pattern: 'TARGET', category: 'Shopping', priority: 90 },
  { pattern: 'WALMART', category: 'Shopping', priority: 90 },
  { pattern: 'BEST BUY', category: 'Shopping', priority: 100 },
  { pattern: 'HOME DEPOT', category: 'Shopping', priority: 100 },
  { pattern: 'LOWE', category: 'Shopping', priority: 90 },
  { pattern: 'WAL-MART', category: 'Shopping', priority: 100 },
  { pattern: 'GOOGLE STORE', category: 'Shopping', priority: 100 },
  { pattern: 'WARBY PARKER', category: 'Health', priority: 100 },

  // Fees
  { pattern: 'LATE FEE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'INTEREST CHARGE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'OVERDRAFT', category: 'Fees & Interest', priority: 100 },
  { pattern: 'SERVICE FEE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'FINANCE CHARGE', category: 'Fees & Interest', priority: 100 },

  // Transfers (between own accounts / credit card payments)
  { pattern: 'Payment Thank You', category: 'Transfers', priority: 100 },
  { pattern: 'BANK OF AMERICA CREDIT CARD', category: 'Transfers', priority: 100 },
  { pattern: 'CHASE CREDIT CRD', category: 'Transfers', priority: 100 },
  { pattern: 'ONLINE PAYMENT', category: 'Transfers', priority: 90 },
  { pattern: 'TRANSFER', category: 'Transfers', priority: 90 },
  { pattern: 'TRUIST ONLINE TRANSFER', category: 'Transfers', priority: 100 },
  { pattern: 'TRUIST ATM', category: 'Transfers', priority: 100 },
  { pattern: 'ATM CASH WITHDRAWAL', category: 'Transfers', priority: 90 },
  { pattern: 'ZELLE', category: 'Transfers', priority: 90 },
  { pattern: 'VENMO', category: 'Transfers', priority: 90 },
  { pattern: 'FID BKG SVC LLC', category: 'Transfers', priority: 100 },
  { pattern: 'WITHDRWL', category: 'Transfers', priority: 80 },
  { pattern: 'DEPOSIT', category: 'Transfers', priority: 80 },
  { pattern: 'GREENLIGHT', category: 'Transfers', priority: 90 },
  { pattern: 'CREDIT KARMA', category: 'Transfers', priority: 90 },

  // Income
  { pattern: 'PAYROLL', category: 'Income', priority: 100 },
  { pattern: 'DIRECT DEP', category: 'Income', priority: 100 },
  { pattern: 'PAYROLL VERTEX INC', category: 'Income', priority: 110 },
  { pattern: 'ACH CREDIT', category: 'Income', priority: 70 },

  // Subscriptions (additional, surfaced from Truist data)
  { pattern: 'APPLE.COM/BILL', category: 'Subscriptions', priority: 100 },
  { pattern: 'APPLE.COM BILL', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL APPLE', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL NETFLIX', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL HULU', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL SPOTIFY', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL PEACOCK', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL PARAMNT', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL GITHUB', category: 'Subscriptions', priority: 100 },
  { pattern: 'PRIME VIDEO', category: 'Subscriptions', priority: 95 },
  { pattern: 'AMAZON PRIME', category: 'Subscriptions', priority: 100 },
  { pattern: 'AUDIBLE', category: 'Subscriptions', priority: 100 },
  { pattern: 'PHILO TV', category: 'Subscriptions', priority: 100 },
  { pattern: 'LINKEDIN', category: 'Subscriptions', priority: 100 },
  { pattern: 'PADDLE.NET CHATAI', category: 'Subscriptions', priority: 100 },

  // Entertainment (PayPal-wrapped event/ticket purchases)
  { pattern: 'PAYPAL TICKETMASTER', category: 'Entertainment', priority: 100 },
  { pattern: 'PAYPAL AIRBNB', category: 'Travel', priority: 100 },

  // Health
  { pattern: 'LA FITNESS', category: 'Health', priority: 100 },
  { pattern: 'GOODRX', category: 'Health', priority: 100 },
  { pattern: 'TELYRX', category: 'Health', priority: 100 },
  { pattern: 'DUTCH PET', category: 'Health', priority: 100 },

  // Utilities (additional)
  { pattern: 'GAS SOUTH', category: 'Utilities', priority: 100 },

  // Insurance (additional)
  { pattern: 'STATE FARM INSURA', category: 'Insurance', priority: 100 },

  // Household / Shopping
  { pattern: 'TERMINIX', category: 'Shopping', priority: 100 },
  { pattern: 'ACE HARDWARE', category: 'Shopping', priority: 100 },
  { pattern: 'ACE HDWE', category: 'Shopping', priority: 100 },
  { pattern: 'LULULEMON', category: 'Shopping', priority: 100 },
  { pattern: 'OLDNAVY', category: 'Shopping', priority: 100 },
  { pattern: 'H&M', category: 'Shopping', priority: 100 },
  { pattern: 'ZARA USA', category: 'Shopping', priority: 100 },
  { pattern: 'NORDSTROM', category: 'Shopping', priority: 100 },
  { pattern: 'GOODWILL', category: 'Shopping', priority: 100 },
  { pattern: 'TJ MAXX', category: 'Shopping', priority: 100 },
  { pattern: 'T.J. MAXX', category: 'Shopping', priority: 100 },
  { pattern: 'FIVE BELOW', category: 'Shopping', priority: 100 },
  { pattern: 'MICHAELS STORES', category: 'Shopping', priority: 100 },
  { pattern: 'BATH AND BODY WORKS', category: 'Personal Care', priority: 100 },
  { pattern: 'SEPHORA', category: 'Personal Care', priority: 100 },
  { pattern: 'ULTA', category: 'Personal Care', priority: 100 },
  { pattern: 'NAIL BAR', category: 'Personal Care', priority: 90 },
  { pattern: 'NAIL SPA', category: 'Personal Care', priority: 90 },

  // Groceries (additional)
  { pattern: 'TRADER JOE', category: 'Groceries', priority: 100 },
  { pattern: 'FRESH MARKET', category: 'Groceries', priority: 95 },
  { pattern: 'FARMERS MARKET', category: 'Groceries', priority: 95 },
  { pattern: 'WM SUPERCENTER', category: 'Groceries', priority: 100 },
  { pattern: 'KROGER', category: 'Groceries', priority: 100 },

  // Restaurants & Coffee (additional)
  { pattern: 'CHICK-FIL-A', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CHIPOTLE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'ZAXBY', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'TACO BELL', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'SONIC DRIVE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DD/BR', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DUNKIN', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'MARCOS PIZZA', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'COFFEE', category: 'Restaurants & Coffee', priority: 60 },
  { pattern: 'CAFE', category: 'Restaurants & Coffee', priority: 50 },

  // Transportation (additional gas stations seen in Truist)
  { pattern: 'QUIKTRIP', category: 'Transportation', priority: 100 },
  { pattern: 'QT ', category: 'Transportation', priority: 80 },
  { pattern: 'CIRCLE K', category: 'Transportation', priority: 100 },
  { pattern: 'AMOCO', category: 'Transportation', priority: 100 },
  { pattern: 'MARATHON', category: 'Transportation', priority: 95 },
  { pattern: 'SHEETZ', category: 'Transportation', priority: 100 },
  { pattern: 'ENMARKET', category: 'Transportation', priority: 100 },
  { pattern: 'REFUEL MARKET', category: 'Transportation', priority: 100 },
  { pattern: 'EMISSIONS', category: 'Transportation', priority: 90 },
  { pattern: 'SAFELITE AUTOGLASS', category: 'Transportation', priority: 100 },
  { pattern: 'GOODYEAR', category: 'Transportation', priority: 100 },
  { pattern: 'SUBARU', category: 'Transportation', priority: 95 },

  // Taxes
  { pattern: 'STATE TAX', category: 'Taxes', priority: 100 },
  { pattern: 'TAX PAYMENT', category: 'Taxes', priority: 100 },
  { pattern: 'FREETAXUSA', category: 'Taxes', priority: 100 },
  { pattern: 'TURBOTAX', category: 'Taxes', priority: 100 },

  // Travel
  { pattern: 'COURTYARD', category: 'Travel', priority: 90 },
  { pattern: 'MARRIOTT', category: 'Travel', priority: 100 },
  { pattern: 'HILTON', category: 'Travel', priority: 100 },
  { pattern: 'HYATT', category: 'Travel', priority: 100 },
  { pattern: 'DELTA AIR', category: 'Travel', priority: 100 },
  { pattern: 'AMERICAN AIR', category: 'Travel', priority: 100 },
  { pattern: 'UNITED AIR', category: 'Travel', priority: 100 },
  { pattern: 'SOUTHWEST AIR', category: 'Travel', priority: 100 },
  { pattern: 'AIRBNB', category: 'Travel', priority: 100 },
  { pattern: 'VRBO', category: 'Travel', priority: 100 },

  // Entertainment
  { pattern: 'AMC THEATERS', category: 'Entertainment', priority: 100 },
];

export async function seedAndMigrate(): Promise<void> {
  // Ensure all default categories exist (by name)
  const existingCategoryNames = new Set(
    (await db.categories.toArray()).map((c) => c.name)
  );
  const newCategories = DEFAULT_CATEGORIES.filter(
    (c) => !existingCategoryNames.has(c.name)
  );
  if (newCategories.length > 0) {
    await db.categories.bulkAdd(newCategories);
  }

  // Ensure all default rules exist (by pattern)
  const existingPatterns = new Set(
    (await db.rules.toArray()).map((r) => r.pattern)
  );
  const now = new Date().toISOString();
  const newRules = DEFAULT_RULES.filter(
    (r) => !existingPatterns.has(r.pattern)
  ).map((r) => ({ ...r, createdAt: now }));
  if (newRules.length > 0) {
    await db.rules.bulkAdd(newRules);
  }

  // If we shipped a new SEED_VERSION and the user already had transactions
  // imported under an older rule set, re-run categorization so new rules
  // retroactively re-bucket existing transactions.
  const storedVersion = Number(localStorage.getItem('seed_version') || '0');
  if (storedVersion < SEED_VERSION) {
    const hasTransactions = (await db.transactions.count()) > 0;
    if (hasTransactions) {
      await recategorizeAll();
    }
    localStorage.setItem('seed_version', String(SEED_VERSION));
  }
}
