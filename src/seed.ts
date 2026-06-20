// Default category taxonomy + a comprehensive US-household starter rule pack.
//
// IMPORTANT (privacy): the rules in this file are a generic "starter pack"
// covering many common US merchants and lenders per category. The presence
// of any single brand here implies nothing about the maintainer — for every
// auto lender or insurer there are a dozen alternatives in the list, so the
// rules cannot be read as personal financial history.
//
// Personal merchant additions belong either in IndexedDB (added through the
// app's Sort / Rules UI) or in an OPTIONAL local file `src/seed.local.ts`
// which is gitignored. See `src/seed.local.example.ts` for the template.

import { db } from './db';
import { recategorizeAll } from './categorize';
import { refreshRecurrenceAll } from './recurrence';
import type { Category, CategoryRule } from './types';

export const SEED_VERSION = 8;

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Groceries', color: '#4caf50', type: 'spend', sortOrder: 10, defaultRecurrence: 'onetime' },
  { name: 'Restaurants & Coffee', color: '#ff7043', type: 'spend', sortOrder: 20, defaultRecurrence: 'onetime' },
  { name: 'Transportation', color: '#5c6bc0', type: 'spend', sortOrder: 30, defaultRecurrence: 'onetime' },
  { name: 'Auto Loan', color: '#3949ab', type: 'spend', sortOrder: 35, defaultRecurrence: 'recurring' },
  { name: 'Utilities', color: '#26a69a', type: 'spend', sortOrder: 40, defaultRecurrence: 'recurring' },
  { name: 'Subscriptions', color: '#ab47bc', type: 'spend', sortOrder: 50, defaultRecurrence: 'recurring' },
  { name: 'Housing', color: '#8d6e63', type: 'spend', sortOrder: 60, defaultRecurrence: 'recurring' },
  { name: 'Mortgage', color: '#6d4c41', type: 'spend', sortOrder: 65, defaultRecurrence: 'recurring' },
  { name: 'Student Loans', color: '#5d4037', type: 'spend', sortOrder: 67, defaultRecurrence: 'recurring' },
  { name: 'Shopping', color: '#ec407a', type: 'spend', sortOrder: 70, defaultRecurrence: 'onetime' },
  { name: 'Entertainment', color: '#ffa726', type: 'spend', sortOrder: 80, defaultRecurrence: 'onetime' },
  { name: 'Health', color: '#42a5f5', type: 'spend', sortOrder: 90, defaultRecurrence: 'onetime' },
  { name: 'Insurance', color: '#0288d1', type: 'spend', sortOrder: 95, defaultRecurrence: 'recurring' },
  { name: 'Taxes', color: '#455a64', type: 'spend', sortOrder: 100, defaultRecurrence: 'onetime' },
  { name: 'Travel', color: '#66bb6a', type: 'spend', sortOrder: 110, defaultRecurrence: 'onetime' },
  { name: 'Personal Care', color: '#d4af37', type: 'spend', sortOrder: 120, defaultRecurrence: 'onetime' },
  { name: 'Fees & Interest', color: '#bdbdbd', type: 'spend', sortOrder: 130, defaultRecurrence: 'onetime' },
  { name: 'Income', color: '#2e7d32', type: 'income', sortOrder: 200, defaultRecurrence: 'recurring' },
  { name: 'Transfers', color: '#90a4ae', type: 'transfer', sortOrder: 210, defaultRecurrence: 'onetime' },
  { name: 'Uncategorized', color: '#9e9e9e', type: 'spend', sortOrder: 999, defaultRecurrence: 'onetime' },
];

type StarterRule = Omit<CategoryRule, 'id' | 'createdAt'>;

const STARTER_RULES: StarterRule[] = [
  // --- Subscriptions (streaming, software, productivity) ---
  { pattern: 'NETFLIX', category: 'Subscriptions', priority: 100 },
  { pattern: 'HULU', category: 'Subscriptions', priority: 100 },
  { pattern: 'DISNEY+', category: 'Subscriptions', priority: 100 },
  { pattern: 'DISNEY PLUS', category: 'Subscriptions', priority: 100 },
  { pattern: 'HBO MAX', category: 'Subscriptions', priority: 100 },
  { pattern: 'MAX.COM', category: 'Subscriptions', priority: 100 },
  { pattern: 'PEACOCK', category: 'Subscriptions', priority: 100 },
  { pattern: 'PARAMOUNT+', category: 'Subscriptions', priority: 100 },
  { pattern: 'PARAMNT', category: 'Subscriptions', priority: 100 },
  { pattern: 'APPLE TV', category: 'Subscriptions', priority: 100 },
  { pattern: 'PRIME VIDEO', category: 'Subscriptions', priority: 95 },
  { pattern: 'AMAZON PRIME', category: 'Subscriptions', priority: 100 },
  { pattern: 'YouTube', category: 'Subscriptions', priority: 100 },
  { pattern: 'YOUTUBE PREMIUM', category: 'Subscriptions', priority: 100 },
  { pattern: 'YOUTUBE TV', category: 'Subscriptions', priority: 100 },
  { pattern: 'SLING TV', category: 'Subscriptions', priority: 100 },
  { pattern: 'FUBO', category: 'Subscriptions', priority: 100 },
  { pattern: 'PHILO TV', category: 'Subscriptions', priority: 100 },
  { pattern: 'CRUNCHYROLL', category: 'Subscriptions', priority: 100 },
  { pattern: 'FUNIMATION', category: 'Subscriptions', priority: 100 },
  { pattern: 'SPOTIFY', category: 'Subscriptions', priority: 100 },
  { pattern: 'APPLE MUSIC', category: 'Subscriptions', priority: 100 },
  { pattern: 'PANDORA', category: 'Subscriptions', priority: 100 },
  { pattern: 'TIDAL', category: 'Subscriptions', priority: 100 },
  { pattern: 'AUDIBLE', category: 'Subscriptions', priority: 100 },
  { pattern: 'KINDLE UNLIMITED', category: 'Subscriptions', priority: 100 },
  { pattern: 'SIRIUSXM', category: 'Subscriptions', priority: 100 },
  { pattern: 'ICLOUD', category: 'Subscriptions', priority: 100 },
  { pattern: 'APPLE.COM/BILL', category: 'Subscriptions', priority: 100 },
  { pattern: 'APPLE.COM BILL', category: 'Subscriptions', priority: 100 },
  { pattern: 'GOOGLE ONE', category: 'Subscriptions', priority: 100 },
  { pattern: 'GOOGLE STORAGE', category: 'Subscriptions', priority: 100 },
  { pattern: 'DROPBOX', category: 'Subscriptions', priority: 100 },
  { pattern: 'BOX.COM', category: 'Subscriptions', priority: 100 },
  { pattern: 'MICROSOFT 365', category: 'Subscriptions', priority: 100 },
  { pattern: 'MSFT*', category: 'Subscriptions', priority: 95 },
  { pattern: 'ADOBE', category: 'Subscriptions', priority: 100 },
  { pattern: 'CANVA', category: 'Subscriptions', priority: 100 },
  { pattern: 'FIGMA', category: 'Subscriptions', priority: 100 },
  { pattern: 'NOTION', category: 'Subscriptions', priority: 100 },
  { pattern: 'EVERNOTE', category: 'Subscriptions', priority: 100 },
  { pattern: '1PASSWORD', category: 'Subscriptions', priority: 100 },
  { pattern: 'LASTPASS', category: 'Subscriptions', priority: 100 },
  { pattern: 'PROTONMAIL', category: 'Subscriptions', priority: 100 },
  { pattern: 'GITHUB', category: 'Subscriptions', priority: 100 },
  { pattern: 'GITLAB', category: 'Subscriptions', priority: 100 },
  { pattern: 'LINKEDIN', category: 'Subscriptions', priority: 100 },
  { pattern: 'OPENAI', category: 'Subscriptions', priority: 100 },
  { pattern: 'CHATGPT', category: 'Subscriptions', priority: 100 },
  { pattern: 'CLAUDE.AI', category: 'Subscriptions', priority: 100 },
  { pattern: 'ANTHROPIC', category: 'Subscriptions', priority: 100 },
  { pattern: 'MIDJOURNEY', category: 'Subscriptions', priority: 100 },
  { pattern: 'PERPLEXITY', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL APPLE', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL NETFLIX', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL HULU', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL SPOTIFY', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL PEACOCK', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL PARAMNT', category: 'Subscriptions', priority: 100 },
  { pattern: 'PAYPAL GITHUB', category: 'Subscriptions', priority: 100 },

  // --- Groceries ---
  { pattern: 'WHOLE FOODS', category: 'Groceries', priority: 100 },
  { pattern: 'KROGER', category: 'Groceries', priority: 100 },
  { pattern: 'PUBLIX', category: 'Groceries', priority: 100 },
  { pattern: 'TRADER JOE', category: 'Groceries', priority: 100 },
  { pattern: 'ALDI', category: 'Groceries', priority: 100 },
  { pattern: 'SAFEWAY', category: 'Groceries', priority: 100 },
  { pattern: 'COSTCO', category: 'Groceries', priority: 100 },
  { pattern: 'SAMS CLUB', category: 'Groceries', priority: 100 },
  { pattern: 'BJS WHOLESALE', category: 'Groceries', priority: 100 },
  { pattern: 'MEIJER', category: 'Groceries', priority: 100 },
  { pattern: 'WEGMANS', category: 'Groceries', priority: 100 },
  { pattern: 'ALBERTSONS', category: 'Groceries', priority: 100 },
  { pattern: 'FOOD LION', category: 'Groceries', priority: 100 },
  { pattern: 'SHOPRITE', category: 'Groceries', priority: 100 },
  { pattern: 'STOP & SHOP', category: 'Groceries', priority: 100 },
  { pattern: 'GIANT FOOD', category: 'Groceries', priority: 100 },
  { pattern: 'HARRIS TEETER', category: 'Groceries', priority: 100 },
  { pattern: 'H-E-B', category: 'Groceries', priority: 100 },
  { pattern: 'HEB ', category: 'Groceries', priority: 100 },
  { pattern: 'WINCO FOODS', category: 'Groceries', priority: 100 },
  { pattern: 'SPROUTS', category: 'Groceries', priority: 100 },
  { pattern: 'FRESH MARKET', category: 'Groceries', priority: 95 },
  { pattern: 'FARMERS MARKET', category: 'Groceries', priority: 95 },
  { pattern: 'WAL-MART', category: 'Groceries', priority: 80 },
  { pattern: 'WM SUPERCENTER', category: 'Groceries', priority: 90 },
  { pattern: 'INSTACART', category: 'Groceries', priority: 100 },

  // --- Restaurants & Coffee (fast food, casual, coffee, delivery) ---
  { pattern: 'STARBUCKS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DUNKIN', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DD/BR', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'TIM HORTONS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CARIBOU COFFEE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'PEETS COFFEE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'PEET\'S COFFEE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'COFFEE', category: 'Restaurants & Coffee', priority: 60 },
  { pattern: 'CAFE', category: 'Restaurants & Coffee', priority: 50 },
  { pattern: 'CHIPOTLE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CHICK-FIL-A', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'MCDONALD', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'WENDY', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'BURGER KING', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'TACO BELL', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'KFC', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'SUBWAY', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'JIMMY JOHN', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'JERSEY MIKE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'PANERA', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'FIVE GUYS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'SHAKE SHACK', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'IN-N-OUT', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'WHATABURGER', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'POPEYES', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'RAISING CANE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'ARBYS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'ZAXBY', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'BOJANGLES', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'SONIC DRIVE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'JACK IN THE BOX', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DEL TACO', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CARLS JR', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'HARDEES', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'COOKOUT', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DOMINOS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'PIZZA HUT', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'PAPA JOHN', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'MARCOS PIZZA', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'LITTLE CAESAR', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'OLIVE GARDEN', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'APPLEBEE', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CHEESECAKE FACTORY', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'BUFFALO WILD WINGS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'OUTBACK', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'IHOP', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DENNYS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CRACKER BARREL', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DAIRY QUEEN', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'BASKIN-ROBBINS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'DOORDASH', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'UBER EATS', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'GRUBHUB', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'POSTMATES', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'CAVIAR', category: 'Restaurants & Coffee', priority: 100 },
  { pattern: 'SEAMLESS', category: 'Restaurants & Coffee', priority: 100 },

  // --- Transportation (gas, rideshare, transit, rentals, parking) ---
  { pattern: 'SHELL', category: 'Transportation', priority: 100 },
  { pattern: 'CHEVRON', category: 'Transportation', priority: 100 },
  { pattern: 'EXXON', category: 'Transportation', priority: 100 },
  { pattern: 'MOBIL', category: 'Transportation', priority: 95 },
  { pattern: 'BP#', category: 'Transportation', priority: 100 },
  { pattern: '76 GAS', category: 'Transportation', priority: 100 },
  { pattern: 'ARCO', category: 'Transportation', priority: 100 },
  { pattern: 'SUNOCO', category: 'Transportation', priority: 100 },
  { pattern: 'VALERO', category: 'Transportation', priority: 100 },
  { pattern: 'PHILLIPS 66', category: 'Transportation', priority: 100 },
  { pattern: 'CONOCO', category: 'Transportation', priority: 100 },
  { pattern: 'CITGO', category: 'Transportation', priority: 100 },
  { pattern: 'GULF OIL', category: 'Transportation', priority: 100 },
  { pattern: 'MARATHON', category: 'Transportation', priority: 95 },
  { pattern: 'SHEETZ', category: 'Transportation', priority: 100 },
  { pattern: 'WAWA', category: 'Transportation', priority: 100 },
  { pattern: 'QUIKTRIP', category: 'Transportation', priority: 100 },
  { pattern: 'QT ', category: 'Transportation', priority: 80 },
  { pattern: 'CIRCLE K', category: 'Transportation', priority: 100 },
  { pattern: 'SPEEDWAY', category: 'Transportation', priority: 100 },
  { pattern: 'RACETRAC', category: 'Transportation', priority: 100 },
  { pattern: 'LOVES TRAVEL', category: 'Transportation', priority: 100 },
  { pattern: 'PILOT TRAVEL', category: 'Transportation', priority: 100 },
  { pattern: 'FLYING J', category: 'Transportation', priority: 100 },
  { pattern: 'KWIK TRIP', category: 'Transportation', priority: 100 },
  { pattern: 'AMOCO', category: 'Transportation', priority: 100 },
  { pattern: 'COSTCO GAS', category: 'Transportation', priority: 100 },
  { pattern: 'SAMS CLUB FUEL', category: 'Transportation', priority: 100 },
  { pattern: 'UBER', category: 'Transportation', priority: 90 },
  { pattern: 'LYFT', category: 'Transportation', priority: 100 },
  { pattern: 'TRANSIT', category: 'Transportation', priority: 80 },
  { pattern: 'PARKING', category: 'Transportation', priority: 80 },
  { pattern: 'TOLL', category: 'Transportation', priority: 90 },
  { pattern: 'E-Z PASS', category: 'Transportation', priority: 100 },
  { pattern: 'EZ-PASS', category: 'Transportation', priority: 100 },
  { pattern: 'AVIS', category: 'Transportation', priority: 95 },
  { pattern: 'HERTZ', category: 'Transportation', priority: 95 },
  { pattern: 'ENTERPRISE RENT', category: 'Transportation', priority: 100 },
  { pattern: 'BUDGET RENT', category: 'Transportation', priority: 100 },
  { pattern: 'NATIONAL CAR', category: 'Transportation', priority: 100 },
  { pattern: 'ALAMO', category: 'Transportation', priority: 95 },
  { pattern: 'ZIPCAR', category: 'Transportation', priority: 100 },
  { pattern: 'TURO', category: 'Transportation', priority: 100 },
  { pattern: 'GOODYEAR', category: 'Transportation', priority: 100 },
  { pattern: 'JIFFY LUBE', category: 'Transportation', priority: 100 },
  { pattern: 'VALVOLINE', category: 'Transportation', priority: 100 },
  { pattern: 'MIDAS', category: 'Transportation', priority: 100 },
  { pattern: 'PEP BOYS', category: 'Transportation', priority: 100 },
  { pattern: 'AUTOZONE', category: 'Transportation', priority: 100 },
  { pattern: 'OREILLY', category: 'Transportation', priority: 100 },
  { pattern: "O'REILLY AUTO", category: 'Transportation', priority: 100 },
  { pattern: 'ADVANCE AUTO', category: 'Transportation', priority: 100 },
  { pattern: 'NAPA AUTO', category: 'Transportation', priority: 100 },
  { pattern: 'EMISSIONS', category: 'Transportation', priority: 90 },

  // --- Auto loan / lease (banks + manufacturer finance arms) ---
  { pattern: 'TOYOTA FIN', category: 'Auto Loan', priority: 100 },
  { pattern: 'HONDA FIN', category: 'Auto Loan', priority: 100 },
  { pattern: 'NISSAN MOTOR', category: 'Auto Loan', priority: 100 },
  { pattern: 'FORD CREDIT', category: 'Auto Loan', priority: 100 },
  { pattern: 'GM FINANCIAL', category: 'Auto Loan', priority: 100 },
  { pattern: 'HYUNDAI MOTOR', category: 'Auto Loan', priority: 100 },
  { pattern: 'KIA FINANCE', category: 'Auto Loan', priority: 100 },
  { pattern: 'MAZDA CAPITAL', category: 'Auto Loan', priority: 100 },
  { pattern: 'SUBARU MOTORS', category: 'Auto Loan', priority: 100 },
  { pattern: 'VW CREDIT', category: 'Auto Loan', priority: 100 },
  { pattern: 'AUDI FINANCIAL', category: 'Auto Loan', priority: 100 },
  { pattern: 'BMW FINANCIAL', category: 'Auto Loan', priority: 100 },
  { pattern: 'MERCEDES-BENZ FIN', category: 'Auto Loan', priority: 100 },
  { pattern: 'LEXUS FINANCIAL', category: 'Auto Loan', priority: 100 },
  { pattern: 'ACURA FINANCIAL', category: 'Auto Loan', priority: 100 },
  { pattern: 'INFINITI FIN', category: 'Auto Loan', priority: 100 },
  { pattern: 'MITSUBISHI MOTORS CRED', category: 'Auto Loan', priority: 100 },
  { pattern: 'CAPITAL ONE AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'ALLY FINANCIAL', category: 'Auto Loan', priority: 100 },
  { pattern: 'CHASE AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'BANK OF AMERICA AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'WELLS FARGO AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'USAA AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'NAVY FED AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'PNC AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'TD AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'US BANK AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'FIFTH THIRD AUTO', category: 'Auto Loan', priority: 100 },
  { pattern: 'SANTANDER', category: 'Auto Loan', priority: 100 },
  { pattern: 'WESTLAKE FIN', category: 'Auto Loan', priority: 100 },
  { pattern: 'EXETER FINANCE', category: 'Auto Loan', priority: 100 },

  // --- Mortgage ---
  { pattern: 'ROCKET MORTGAGE', category: 'Mortgage', priority: 100 },
  { pattern: 'MR COOPER', category: 'Mortgage', priority: 100 },
  { pattern: 'MR.COOPER', category: 'Mortgage', priority: 100 },
  { pattern: 'MR. COOPER', category: 'Mortgage', priority: 100 },
  { pattern: 'WELLS FARGO HOME', category: 'Mortgage', priority: 100 },
  { pattern: 'CHASE HOME', category: 'Mortgage', priority: 100 },
  { pattern: 'BANK OF AMERICA HOME', category: 'Mortgage', priority: 100 },
  { pattern: 'US BANK HOME', category: 'Mortgage', priority: 100 },
  { pattern: 'PNC MORTGAGE', category: 'Mortgage', priority: 100 },
  { pattern: 'CITIZENS HOME', category: 'Mortgage', priority: 100 },
  { pattern: 'CALIBER HOME', category: 'Mortgage', priority: 100 },
  { pattern: 'LOANDEPOT', category: 'Mortgage', priority: 100 },
  { pattern: 'BETTER MORTGAGE', category: 'Mortgage', priority: 100 },
  { pattern: 'CARRINGTON MORTGAGE', category: 'Mortgage', priority: 100 },
  { pattern: 'PENNYMAC', category: 'Mortgage', priority: 100 },
  { pattern: 'FREEDOM MORTGAGE', category: 'Mortgage', priority: 100 },
  { pattern: 'GUILD MORTGAGE', category: 'Mortgage', priority: 100 },
  { pattern: 'NEW REZ', category: 'Mortgage', priority: 100 },
  { pattern: 'NEWREZ', category: 'Mortgage', priority: 100 },
  { pattern: 'FLAGSTAR', category: 'Mortgage', priority: 100 },
  { pattern: 'MORTGAGE', category: 'Mortgage', priority: 90 },

  // --- Student Loans ---
  { pattern: 'STUDENT LOAN', category: 'Student Loans', priority: 100 },
  { pattern: 'STUDENT LN', category: 'Student Loans', priority: 100 },
  { pattern: 'DEPT EDUCATION', category: 'Student Loans', priority: 95 },
  { pattern: 'NELNET', category: 'Student Loans', priority: 100 },
  { pattern: 'NAVIENT', category: 'Student Loans', priority: 100 },
  { pattern: 'SALLIE MAE', category: 'Student Loans', priority: 100 },
  { pattern: 'MOHELA', category: 'Student Loans', priority: 100 },
  { pattern: 'AIDVANTAGE', category: 'Student Loans', priority: 100 },
  { pattern: 'EDFINANCIAL', category: 'Student Loans', priority: 100 },
  { pattern: 'GREAT LAKES STUDENT', category: 'Student Loans', priority: 100 },
  { pattern: 'FEDLOAN', category: 'Student Loans', priority: 100 },
  { pattern: 'EARNEST', category: 'Student Loans', priority: 95 },
  { pattern: 'SOFI STUDENT', category: 'Student Loans', priority: 100 },

  // --- Insurance (auto, home, life, health) ---
  { pattern: 'GEICO', category: 'Insurance', priority: 100 },
  { pattern: 'STATE FARM', category: 'Insurance', priority: 100 },
  { pattern: 'ALLSTATE', category: 'Insurance', priority: 100 },
  { pattern: 'PROGRESSIVE', category: 'Insurance', priority: 100 },
  { pattern: 'USAA INSURANCE', category: 'Insurance', priority: 100 },
  { pattern: 'USAA INS', category: 'Insurance', priority: 100 },
  { pattern: 'LIBERTY MUTUAL', category: 'Insurance', priority: 100 },
  { pattern: 'NATIONWIDE INS', category: 'Insurance', priority: 100 },
  { pattern: 'FARMERS INS', category: 'Insurance', priority: 100 },
  { pattern: 'AAA INSURANCE', category: 'Insurance', priority: 100 },
  { pattern: 'AMICA', category: 'Insurance', priority: 100 },
  { pattern: 'MERCURY INS', category: 'Insurance', priority: 100 },
  { pattern: 'ESURANCE', category: 'Insurance', priority: 100 },
  { pattern: 'AMERICAN FAMILY INS', category: 'Insurance', priority: 100 },
  { pattern: 'COUNTRY FINANCIAL', category: 'Insurance', priority: 100 },
  { pattern: 'ERIE INS', category: 'Insurance', priority: 100 },
  { pattern: 'AUTO-OWNERS INS', category: 'Insurance', priority: 100 },
  { pattern: 'CSAA INS', category: 'Insurance', priority: 100 },
  { pattern: 'ROOT INSURANCE', category: 'Insurance', priority: 100 },
  { pattern: 'LEMONADE INS', category: 'Insurance', priority: 100 },
  { pattern: 'HAGERTY', category: 'Insurance', priority: 100 },
  { pattern: 'HOMESITE', category: 'Insurance', priority: 100 },
  { pattern: 'METLIFE', category: 'Insurance', priority: 100 },
  { pattern: 'PRUDENTIAL', category: 'Insurance', priority: 100 },
  { pattern: 'NEW YORK LIFE', category: 'Insurance', priority: 100 },
  { pattern: 'NORTHWESTERN MUTUAL', category: 'Insurance', priority: 100 },
  { pattern: 'MASS MUTUAL', category: 'Insurance', priority: 100 },
  { pattern: 'GUARDIAN LIFE', category: 'Insurance', priority: 100 },
  { pattern: 'GERBER LIFE', category: 'Insurance', priority: 100 },
  { pattern: 'ALLIANZ', category: 'Insurance', priority: 100 },
  { pattern: 'BLUE CROSS', category: 'Insurance', priority: 100 },
  { pattern: 'BLUECROSS', category: 'Insurance', priority: 100 },
  { pattern: 'BLUE SHIELD', category: 'Insurance', priority: 100 },
  { pattern: 'ANTHEM', category: 'Insurance', priority: 100 },
  { pattern: 'AETNA', category: 'Insurance', priority: 100 },
  { pattern: 'CIGNA', category: 'Insurance', priority: 100 },
  { pattern: 'UNITEDHEALTH', category: 'Insurance', priority: 100 },
  { pattern: 'HUMANA', category: 'Insurance', priority: 100 },
  { pattern: 'KAISER PERMANENTE', category: 'Insurance', priority: 100 },
  { pattern: 'DELTA DENTAL', category: 'Insurance', priority: 100 },
  { pattern: 'VSP VISION', category: 'Insurance', priority: 100 },

  // --- Utilities (telecom, power, water, gas, internet) ---
  { pattern: 'COMCAST', category: 'Utilities', priority: 100 },
  { pattern: 'XFINITY', category: 'Utilities', priority: 100 },
  { pattern: 'SPECTRUM', category: 'Utilities', priority: 100 },
  { pattern: 'COX COMM', category: 'Utilities', priority: 100 },
  { pattern: 'OPTIMUM', category: 'Utilities', priority: 100 },
  { pattern: 'CENTURYLINK', category: 'Utilities', priority: 100 },
  { pattern: 'FRONTIER COMMUNI', category: 'Utilities', priority: 100 },
  { pattern: 'EARTHLINK', category: 'Utilities', priority: 100 },
  { pattern: 'STARLINK', category: 'Utilities', priority: 100 },
  { pattern: 'HUGHESNET', category: 'Utilities', priority: 100 },
  { pattern: 'VIASAT', category: 'Utilities', priority: 100 },
  { pattern: 'GOOGLE FIBER', category: 'Utilities', priority: 100 },
  { pattern: 'GOOGLE *FI', category: 'Utilities', priority: 100 },
  { pattern: 'AT&T', category: 'Utilities', priority: 100 },
  { pattern: 'VERIZON', category: 'Utilities', priority: 100 },
  { pattern: 'T-MOBILE', category: 'Utilities', priority: 100 },
  { pattern: 'SPRINT', category: 'Utilities', priority: 100 },
  { pattern: 'US CELLULAR', category: 'Utilities', priority: 100 },
  { pattern: 'CRICKET WIRELESS', category: 'Utilities', priority: 100 },
  { pattern: 'METRO BY T-MOBILE', category: 'Utilities', priority: 100 },
  { pattern: 'METROPCS', category: 'Utilities', priority: 100 },
  { pattern: 'BOOST MOBILE', category: 'Utilities', priority: 100 },
  { pattern: 'MINT MOBILE', category: 'Utilities', priority: 100 },
  { pattern: 'VISIBLE', category: 'Utilities', priority: 90 },
  { pattern: 'POWER COMPANY', category: 'Utilities', priority: 100 },
  { pattern: 'ELECTRIC COMPANY', category: 'Utilities', priority: 100 },
  { pattern: 'WATER UTILITY', category: 'Utilities', priority: 100 },
  { pattern: 'NATURAL GAS', category: 'Utilities', priority: 95 },
  { pattern: 'DUKE ENERGY', category: 'Utilities', priority: 100 },
  { pattern: 'PG&E', category: 'Utilities', priority: 100 },
  { pattern: 'CONED', category: 'Utilities', priority: 100 },
  { pattern: 'ENTERGY', category: 'Utilities', priority: 100 },
  { pattern: 'EVERSOURCE', category: 'Utilities', priority: 100 },
  { pattern: 'NATIONAL GRID', category: 'Utilities', priority: 100 },
  { pattern: 'DOMINION ENERGY', category: 'Utilities', priority: 100 },
  { pattern: 'XCEL ENERGY', category: 'Utilities', priority: 100 },
  { pattern: 'AMEREN', category: 'Utilities', priority: 100 },
  { pattern: 'COMED', category: 'Utilities', priority: 100 },

  // --- Taxes ---
  { pattern: 'IRS DES:USATAXPYMT', category: 'Taxes', priority: 110 },
  { pattern: 'USATAXPYMT', category: 'Taxes', priority: 100 },
  { pattern: 'IRS ', category: 'Taxes', priority: 90 },
  { pattern: 'TURBOTAX', category: 'Taxes', priority: 100 },
  { pattern: 'H&R BLOCK', category: 'Taxes', priority: 100 },
  { pattern: 'TAXACT', category: 'Taxes', priority: 100 },
  { pattern: 'TAXSLAYER', category: 'Taxes', priority: 100 },
  { pattern: 'FREETAXUSA', category: 'Taxes', priority: 100 },
  { pattern: 'DEPT OF REVENUE', category: 'Taxes', priority: 100 },
  { pattern: 'DEPARTMENT OF REVENUE', category: 'Taxes', priority: 100 },
  { pattern: 'STATE TAX', category: 'Taxes', priority: 100 },
  { pattern: 'TAX PAYMENT', category: 'Taxes', priority: 100 },
  { pattern: 'PROPERTY TAX', category: 'Taxes', priority: 100 },
  { pattern: 'FRANCHISE TAX', category: 'Taxes', priority: 100 },

  // --- Health (pharmacy, generic medical, fitness) ---
  { pattern: 'CVS/PHARMACY', category: 'Health', priority: 100 },
  { pattern: 'CVS PHARMACY', category: 'Health', priority: 100 },
  { pattern: 'WALGREENS', category: 'Health', priority: 100 },
  { pattern: 'RITE AID', category: 'Health', priority: 100 },
  { pattern: 'MINUTECLINIC', category: 'Health', priority: 100 },
  { pattern: 'PHARMACY', category: 'Health', priority: 80 },
  { pattern: 'PHARM ', category: 'Health', priority: 80 },
  { pattern: 'DENTAL', category: 'Health', priority: 90 },
  { pattern: 'ORTHODONTIC', category: 'Health', priority: 90 },
  { pattern: 'DR.', category: 'Health', priority: 70 },
  { pattern: 'MEDICAL', category: 'Health', priority: 80 },
  { pattern: 'CLINIC', category: 'Health', priority: 80 },
  { pattern: 'HOSPITAL', category: 'Health', priority: 90 },
  { pattern: 'URGENT CARE', category: 'Health', priority: 100 },
  { pattern: 'QUEST DIAGNOSTICS', category: 'Health', priority: 100 },
  { pattern: 'LABCORP', category: 'Health', priority: 100 },
  { pattern: 'GOODRX', category: 'Health', priority: 100 },
  { pattern: 'WARBY PARKER', category: 'Health', priority: 100 },
  { pattern: 'LA FITNESS', category: 'Health', priority: 100 },
  { pattern: 'PLANET FITNESS', category: 'Health', priority: 100 },
  { pattern: 'ANYTIME FITNESS', category: 'Health', priority: 100 },
  { pattern: 'EQUINOX', category: 'Health', priority: 100 },
  { pattern: 'ORANGE THEORY', category: 'Health', priority: 100 },
  { pattern: 'ORANGETHEORY', category: 'Health', priority: 100 },
  { pattern: 'SOULCYCLE', category: 'Health', priority: 100 },
  { pattern: 'CLASSPASS', category: 'Health', priority: 100 },
  { pattern: 'PELOTON', category: 'Health', priority: 100 },
  { pattern: 'HEADSPACE', category: 'Health', priority: 100 },
  { pattern: 'CALM.COM', category: 'Health', priority: 100 },
  { pattern: 'BETTERHELP', category: 'Health', priority: 100 },
  { pattern: 'TALKSPACE', category: 'Health', priority: 100 },

  // --- Shopping (big-box, mid-tier, apparel, home goods) ---
  { pattern: 'AMAZON', category: 'Shopping', priority: 80 },
  { pattern: 'AMZN', category: 'Shopping', priority: 80 },
  { pattern: 'TARGET', category: 'Shopping', priority: 90 },
  { pattern: 'WALMART', category: 'Shopping', priority: 80 },
  { pattern: 'BEST BUY', category: 'Shopping', priority: 100 },
  { pattern: 'HOME DEPOT', category: 'Shopping', priority: 100 },
  { pattern: 'LOWE', category: 'Shopping', priority: 90 },
  { pattern: 'MENARDS', category: 'Shopping', priority: 100 },
  { pattern: 'ACE HARDWARE', category: 'Shopping', priority: 100 },
  { pattern: 'TRACTOR SUPPLY', category: 'Shopping', priority: 100 },
  { pattern: 'IKEA', category: 'Shopping', priority: 100 },
  { pattern: 'WAYFAIR', category: 'Shopping', priority: 100 },
  { pattern: 'OVERSTOCK', category: 'Shopping', priority: 100 },
  { pattern: 'ETSY', category: 'Shopping', priority: 100 },
  { pattern: 'EBAY', category: 'Shopping', priority: 100 },
  { pattern: 'POTTERY BARN', category: 'Shopping', priority: 100 },
  { pattern: 'WEST ELM', category: 'Shopping', priority: 100 },
  { pattern: 'CRATE & BARREL', category: 'Shopping', priority: 100 },
  { pattern: 'WILLIAMS-SONOMA', category: 'Shopping', priority: 100 },
  { pattern: 'BED BATH', category: 'Shopping', priority: 100 },
  { pattern: 'TJ MAXX', category: 'Shopping', priority: 100 },
  { pattern: 'T.J. MAXX', category: 'Shopping', priority: 100 },
  { pattern: 'MARSHALLS', category: 'Shopping', priority: 100 },
  { pattern: 'ROSS DRESS', category: 'Shopping', priority: 100 },
  { pattern: 'BURLINGTON', category: 'Shopping', priority: 95 },
  { pattern: 'KOHLS', category: 'Shopping', priority: 100 },
  { pattern: 'MACYS', category: 'Shopping', priority: 100 },
  { pattern: 'NORDSTROM', category: 'Shopping', priority: 100 },
  { pattern: 'JC PENNEY', category: 'Shopping', priority: 100 },
  { pattern: 'DILLARDS', category: 'Shopping', priority: 100 },
  { pattern: 'GAP', category: 'Shopping', priority: 80 },
  { pattern: 'OLDNAVY', category: 'Shopping', priority: 100 },
  { pattern: 'OLD NAVY', category: 'Shopping', priority: 100 },
  { pattern: 'BANANA REPUBLIC', category: 'Shopping', priority: 100 },
  { pattern: 'H&M', category: 'Shopping', priority: 100 },
  { pattern: 'ZARA USA', category: 'Shopping', priority: 100 },
  { pattern: 'UNIQLO', category: 'Shopping', priority: 100 },
  { pattern: 'J.CREW', category: 'Shopping', priority: 100 },
  { pattern: 'MADEWELL', category: 'Shopping', priority: 100 },
  { pattern: 'LULULEMON', category: 'Shopping', priority: 100 },
  { pattern: 'ATHLETA', category: 'Shopping', priority: 100 },
  { pattern: 'NIKE', category: 'Shopping', priority: 100 },
  { pattern: 'ADIDAS', category: 'Shopping', priority: 100 },
  { pattern: 'REI', category: 'Shopping', priority: 100 },
  { pattern: 'DICK\'S SPORTING', category: 'Shopping', priority: 100 },
  { pattern: 'ACADEMY SPORTS', category: 'Shopping', priority: 100 },
  { pattern: 'FOOT LOCKER', category: 'Shopping', priority: 100 },
  { pattern: 'DSW', category: 'Shopping', priority: 100 },
  { pattern: 'FAMOUS FOOTWEAR', category: 'Shopping', priority: 100 },
  { pattern: 'ZAPPOS', category: 'Shopping', priority: 100 },
  { pattern: 'GOODWILL', category: 'Shopping', priority: 100 },
  { pattern: 'FIVE BELOW', category: 'Shopping', priority: 100 },
  { pattern: 'DOLLAR TREE', category: 'Shopping', priority: 100 },
  { pattern: 'DOLLAR GENERAL', category: 'Shopping', priority: 100 },
  { pattern: 'FAMILY DOLLAR', category: 'Shopping', priority: 100 },
  { pattern: 'MICHAELS STORES', category: 'Shopping', priority: 100 },
  { pattern: 'HOBBY LOBBY', category: 'Shopping', priority: 100 },
  { pattern: 'JOANN', category: 'Shopping', priority: 100 },
  { pattern: 'BARNES & NOBLE', category: 'Shopping', priority: 100 },
  { pattern: 'GAMESTOP', category: 'Shopping', priority: 100 },
  { pattern: 'TERMINIX', category: 'Shopping', priority: 100 },
  { pattern: 'GOOGLE STORE', category: 'Shopping', priority: 100 },

  // --- Personal care ---
  { pattern: 'SEPHORA', category: 'Personal Care', priority: 100 },
  { pattern: 'ULTA', category: 'Personal Care', priority: 100 },
  { pattern: 'BATH AND BODY WORKS', category: 'Personal Care', priority: 100 },
  { pattern: 'BATH & BODY WORKS', category: 'Personal Care', priority: 100 },
  { pattern: 'GREAT CLIPS', category: 'Personal Care', priority: 100 },
  { pattern: 'SUPERCUTS', category: 'Personal Care', priority: 100 },
  { pattern: 'SPORT CLIPS', category: 'Personal Care', priority: 100 },
  { pattern: 'BARBER', category: 'Personal Care', priority: 80 },
  { pattern: 'SALON', category: 'Personal Care', priority: 80 },
  { pattern: 'SPA', category: 'Personal Care', priority: 70 },
  { pattern: 'NAIL BAR', category: 'Personal Care', priority: 90 },
  { pattern: 'NAIL SPA', category: 'Personal Care', priority: 90 },
  { pattern: 'MASSAGE ENVY', category: 'Personal Care', priority: 100 },

  // --- Entertainment ---
  { pattern: 'AMC THEATERS', category: 'Entertainment', priority: 100 },
  { pattern: 'REGAL CINEMAS', category: 'Entertainment', priority: 100 },
  { pattern: 'CINEMARK', category: 'Entertainment', priority: 100 },
  { pattern: 'ALAMO DRAFTHOUSE', category: 'Entertainment', priority: 100 },
  { pattern: 'AMC ', category: 'Entertainment', priority: 90 },
  { pattern: 'AXS.COM', category: 'Entertainment', priority: 100 },
  { pattern: 'TICKETMASTER', category: 'Entertainment', priority: 100 },
  { pattern: 'STUBHUB', category: 'Entertainment', priority: 100 },
  { pattern: 'VIVID SEATS', category: 'Entertainment', priority: 100 },
  { pattern: 'SEATGEEK', category: 'Entertainment', priority: 100 },
  { pattern: 'EVENTBRITE', category: 'Entertainment', priority: 100 },
  { pattern: 'PLAYSTATION', category: 'Entertainment', priority: 100 },
  { pattern: 'XBOX', category: 'Entertainment', priority: 100 },
  { pattern: 'NINTENDO', category: 'Entertainment', priority: 100 },
  { pattern: 'STEAM', category: 'Entertainment', priority: 100 },
  { pattern: 'EPIC GAMES', category: 'Entertainment', priority: 100 },
  { pattern: 'PAYPAL TICKETMASTER', category: 'Entertainment', priority: 100 },

  // --- Travel ---
  { pattern: 'MARRIOTT', category: 'Travel', priority: 100 },
  { pattern: 'COURTYARD', category: 'Travel', priority: 90 },
  { pattern: 'RESIDENCE INN', category: 'Travel', priority: 100 },
  { pattern: 'SPRINGHILL SUITES', category: 'Travel', priority: 100 },
  { pattern: 'FAIRFIELD INN', category: 'Travel', priority: 100 },
  { pattern: 'TOWNEPLACE', category: 'Travel', priority: 100 },
  { pattern: 'MOXY', category: 'Travel', priority: 100 },
  { pattern: 'ALOFT', category: 'Travel', priority: 100 },
  { pattern: 'HILTON', category: 'Travel', priority: 100 },
  { pattern: 'DOUBLETREE', category: 'Travel', priority: 100 },
  { pattern: 'EMBASSY SUITES', category: 'Travel', priority: 100 },
  { pattern: 'HAMPTON INN', category: 'Travel', priority: 100 },
  { pattern: 'HOMEWOOD SUITES', category: 'Travel', priority: 100 },
  { pattern: 'HYATT', category: 'Travel', priority: 100 },
  { pattern: 'IHG ', category: 'Travel', priority: 100 },
  { pattern: 'HOLIDAY INN', category: 'Travel', priority: 100 },
  { pattern: 'CROWNE PLAZA', category: 'Travel', priority: 100 },
  { pattern: 'INTERCONTINENTAL', category: 'Travel', priority: 100 },
  { pattern: 'BEST WESTERN', category: 'Travel', priority: 100 },
  { pattern: 'RAMADA', category: 'Travel', priority: 100 },
  { pattern: 'COMFORT INN', category: 'Travel', priority: 100 },
  { pattern: 'COMFORT SUITES', category: 'Travel', priority: 100 },
  { pattern: 'QUALITY INN', category: 'Travel', priority: 100 },
  { pattern: 'LA QUINTA', category: 'Travel', priority: 100 },
  { pattern: 'MOTEL 6', category: 'Travel', priority: 100 },
  { pattern: 'RED ROOF', category: 'Travel', priority: 100 },
  { pattern: 'FOUR SEASONS', category: 'Travel', priority: 100 },
  { pattern: 'RITZ-CARLTON', category: 'Travel', priority: 100 },
  { pattern: 'KIMPTON', category: 'Travel', priority: 100 },
  { pattern: 'RADISSON', category: 'Travel', priority: 100 },
  { pattern: 'DELTA AIR', category: 'Travel', priority: 100 },
  { pattern: 'AMERICAN AIR', category: 'Travel', priority: 100 },
  { pattern: 'UNITED AIR', category: 'Travel', priority: 100 },
  { pattern: 'SOUTHWEST AIR', category: 'Travel', priority: 100 },
  { pattern: 'JETBLUE', category: 'Travel', priority: 100 },
  { pattern: 'ALASKA AIR', category: 'Travel', priority: 100 },
  { pattern: 'SPIRIT AIR', category: 'Travel', priority: 100 },
  { pattern: 'FRONTIER AIR', category: 'Travel', priority: 100 },
  { pattern: 'ALLEGIANT AIR', category: 'Travel', priority: 100 },
  { pattern: 'HAWAIIAN AIR', category: 'Travel', priority: 100 },
  { pattern: 'AIR CANADA', category: 'Travel', priority: 100 },
  { pattern: 'AIR FRANCE', category: 'Travel', priority: 100 },
  { pattern: 'LUFTHANSA', category: 'Travel', priority: 100 },
  { pattern: 'BRITISH AIRWAYS', category: 'Travel', priority: 100 },
  { pattern: 'AIRBNB', category: 'Travel', priority: 100 },
  { pattern: 'PAYPAL AIRBNB', category: 'Travel', priority: 100 },
  { pattern: 'VRBO', category: 'Travel', priority: 100 },
  { pattern: 'EXPEDIA', category: 'Travel', priority: 100 },
  { pattern: 'BOOKING.COM', category: 'Travel', priority: 100 },
  { pattern: 'HOTELS.COM', category: 'Travel', priority: 100 },
  { pattern: 'PRICELINE', category: 'Travel', priority: 100 },
  { pattern: 'KAYAK', category: 'Travel', priority: 100 },
  { pattern: 'ORBITZ', category: 'Travel', priority: 100 },
  { pattern: 'TRAVELOCITY', category: 'Travel', priority: 100 },
  { pattern: 'TRIPADVISOR', category: 'Travel', priority: 100 },

  // --- Fees & Interest ---
  { pattern: 'LATE FEE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'INTEREST CHARGE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'OVERDRAFT', category: 'Fees & Interest', priority: 100 },
  { pattern: 'SERVICE FEE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'FINANCE CHARGE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'MONTHLY MAINTENANCE FEE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'WIRE FEE', category: 'Fees & Interest', priority: 100 },
  { pattern: 'ATM FEE', category: 'Fees & Interest', priority: 100 },

  // --- Transfers (between own accounts, credit-card payments, P2P) ---
  { pattern: 'Payment Thank You', category: 'Transfers', priority: 100 },
  { pattern: 'BANK OF AMERICA CREDIT CARD', category: 'Transfers', priority: 100 },
  { pattern: 'CHASE CREDIT CRD', category: 'Transfers', priority: 100 },
  { pattern: 'CITI CARD PAYMENT', category: 'Transfers', priority: 100 },
  { pattern: 'AMEX EPAYMENT', category: 'Transfers', priority: 100 },
  { pattern: 'DISCOVER PAYMENT', category: 'Transfers', priority: 100 },
  { pattern: 'CAPITAL ONE PAYMENT', category: 'Transfers', priority: 100 },
  { pattern: 'ONLINE PAYMENT', category: 'Transfers', priority: 90 },
  { pattern: 'TRANSFER', category: 'Transfers', priority: 90 },
  { pattern: 'ONLINE TRANSFER', category: 'Transfers', priority: 100 },
  { pattern: 'ATM CASH WITHDRAWAL', category: 'Transfers', priority: 90 },
  { pattern: 'ATM WITHDRAWAL', category: 'Transfers', priority: 90 },
  { pattern: 'WITHDRWL', category: 'Transfers', priority: 80 },
  { pattern: 'DEPOSIT', category: 'Transfers', priority: 80 },
  { pattern: 'ZELLE', category: 'Transfers', priority: 90 },
  { pattern: 'VENMO', category: 'Transfers', priority: 90 },
  { pattern: 'CASH APP', category: 'Transfers', priority: 90 },
  { pattern: 'PAYPAL TRANSFER', category: 'Transfers', priority: 100 },
  { pattern: 'FID BKG SVC', category: 'Transfers', priority: 100 },
  { pattern: 'VANGUARD', category: 'Transfers', priority: 90 },
  { pattern: 'FIDELITY', category: 'Transfers', priority: 90 },
  { pattern: 'SCHWAB', category: 'Transfers', priority: 90 },
  { pattern: 'GREENLIGHT', category: 'Transfers', priority: 90 },
  { pattern: 'CREDIT KARMA', category: 'Transfers', priority: 90 },

  // --- Income ---
  { pattern: 'PAYROLL', category: 'Income', priority: 100 },
  { pattern: 'DIRECT DEP', category: 'Income', priority: 100 },
  { pattern: 'DIRECT DEPOSIT', category: 'Income', priority: 100 },
  { pattern: 'SALARY', category: 'Income', priority: 100 },
  { pattern: 'ACH CREDIT', category: 'Income', priority: 70 },
];

// --- Optional personal extras ---
// Vite's import.meta.glob with `eager: true` resolves at build time. If the
// file `./seed.local.ts` doesn't exist, the result is `{}` and we end up with
// an empty extras array. The file is in .gitignore so personal additions
// never enter the public repo. See `src/seed.local.example.ts` for the
// template.
interface SeedLocalModule {
  LOCAL_RULES?: StarterRule[];
}
const localModules = import.meta.glob<SeedLocalModule>('./seed.local.ts', {
  eager: true,
});
const LOCAL_RULES: StarterRule[] =
  Object.values(localModules)[0]?.LOCAL_RULES ?? [];

const DEFAULT_RULES: StarterRule[] = [...STARTER_RULES, ...LOCAL_RULES];

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

  // Update recurrence defaults for existing categories
  const allDbCategories = await db.categories.toArray();
  for (const dbCat of allDbCategories) {
    const defaultCat = DEFAULT_CATEGORIES.find((c) => c.name === dbCat.name);
    if (defaultCat && dbCat.defaultRecurrence !== defaultCat.defaultRecurrence) {
      await db.categories.update(dbCat.id!, {
        defaultRecurrence: defaultCat.defaultRecurrence,
      });
    }
  }

  // If we shipped a new SEED_VERSION and the user already had transactions
  // imported under an older rule set, re-run categorization so new rules
  // retroactively re-bucket existing transactions.
  const storedVersion = Number(localStorage.getItem('seed_version') || '0');
  if (storedVersion < SEED_VERSION) {
    const hasTransactions = (await db.transactions.count()) > 0;
    if (hasTransactions) {
      await recategorizeAll();
      await refreshRecurrenceAll();
    }
    localStorage.setItem('seed_version', String(SEED_VERSION));
  }

  // Ensure default agent skills are seeded globally on bootstrap
  try {
    const setting = await db.settings.get('app:agentSkills');
    const currentSkills = (setting?.value as any[]) || [];
    
    let hasChanges = false;
    const updatedSkills = [...currentSkills];
    
    const upsertBuiltInSkill = (def: any): void => {
      const idx = updatedSkills.findIndex(s => s.id === def.id);
      if (idx >= 0) {
        const existing = updatedSkills[idx];
        if (
          existing.name !== def.name ||
          existing.description !== def.description ||
          existing.systemPromptExtension !== def.systemPromptExtension ||
          JSON.stringify(existing.stages) !== JSON.stringify(def.stages) ||
          JSON.stringify(existing.testCases) !== JSON.stringify(def.testCases)
        ) {
          updatedSkills[idx] = { ...def, enabled: existing.enabled };
          hasChanges = true;
        }
      } else {
        updatedSkills.push(def);
        hasChanges = true;
      }
    };

    upsertBuiltInSkill({
      id: 'builtin:runway',
      name: 'Financial Runway & Cash Projection',
      description: 'Uses the project_runway tool to calculate budget runway based on cash reserves, CC debt, and monthly outflow.',
      systemPromptExtension: `- When asked about financial runway, cash rundown, or CC debt:
  1. Stage 1: You MUST set 'agent_action.action' to 'project_runway'. Do NOT perform calculations or output tables in the body during Stage 1.
  2. Stage 2: Once the runway metrics are returned, output the starting cash reserves, monthly outflow, and runway months in a clean markdown table.
  3. If the user asks for a simulation (e.g. "What if I get $30k more cash?"), adjust the returned base numbers mathematically.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Project Runway', requiredAction: 'project_runway' }
      ],
      testCases: [
        {
          prompt: "How much runway do I have?",
          criteria: "Must call the project_runway action in Stage 1, and in Stage 2 format the runway metrics in a markdown table."
        },
        {
          prompt: "If I get 30k of income how much runway would I have if I raise the budget by $1000/month",
          criteria: "Must call project_runway in Stage 1, and in Stage 2 mathematically adjust the provided numbers in a markdown table (e.g. 20 months)."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:categorization',
      name: 'Manual Transaction Categorization',
      description: 'Uses local AI to auto-categorize uncategorized transactions chunk-by-chunk.',
      systemPromptExtension: `- When asked to auto-categorize, sort, organize, classify, or run AI review/categorization on remaining, new, or uncategorized transactions (e.g. phrases like "auto-categorize", "auto categorize", "AI categorize", "sort transactions using AI", "classify remaining transactions", "run categorization"):
  1. Stage 1: You MUST set 'agent_action.action' to 'categorize_transactions'. Do NOT explain results, suggest rules, or do math in the body field during Stage 1.
  2. Stage 2: Once the database updates are completed and the system returns the count of processed transactions, summarize the categorization results clearly in the body. Cite the exact count of categorized transactions.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Categorize Transactions', requiredAction: 'categorize_transactions' }
      ],
      testCases: [
        {
          prompt: "AI categorize remaining transactions",
          criteria: "Must call the categorize_transactions action in Stage 1."
        },
        {
          prompt: "please auto-categorize all uncategorized items",
          criteria: "Must call categorize_transactions to initiate the AI review."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:pnl',
      name: 'Generate Profit & Loss Statement',
      description: 'Queries financial data and generates a business Profit and Loss statement, saving it to the Documents tab.',
      systemPromptExtension: `- To generate a business Profit and Loss (P&L) document, you must follow a multi-step sequence:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd". This is required to fetch the raw transaction data. Do NOT generate the document content in Stage 1.
  2. Stage 2: Once the database query results are returned, you MUST set 'agent_action.action' to 'generate_document', specify 'documentType' as "business_pnl", and write the Profit and Loss statement in 'documentContent' based on the queried data.

In Stage 2, you MUST write the Profit and Loss document in 'documentContent' and a short conversational explanation in 'body'.
- Set 'body' to a brief summary message, e.g.: "I have successfully generated your Profit & Loss statement YTD. You can view the document or download it below."
- Write the actual Profit & Loss document inside 'agent_action.documentContent'. Do NOT write the document in 'body'.
- Do NOT start 'agent_action.documentContent' with a '{' or as a JSON object. Start it directly with the markdown heading: "# Profit & Loss Statement".

The markdown content of the P&L document in 'documentContent' MUST be structured exactly as a markdown table with an appendix containing the transaction math computation details:
# Profit & Loss Statement (YTD)
**Period:** [Start Date] to [End Date] (from the query results)
**Basis:** Cash

| Line Item / Category | Amount |
| :--- | ---: |
| **REVENUE** | |
| Income | $[Income Amount] |
| **Total Revenue** | **$[Income Amount]** |
| | |
| **OPERATING EXPENSES** | |
| [Category Name] | $[Category Amount] |
...
| **Total Operating Expenses** | **$[Total Spent Amount]** |
| | |
| **NET SUMMARY** | |
| **Net Income** | **$[Net Income Amount]** |

---
## Transaction Computation Details
This appendix contains all associated transactions that make up the computation of the summary numbers above. Group the transactions under their respective category with headers displaying the total (e.g. "### Category: [Category Name] (Total: $[Total Category Sum])").
For each category, list the transactions in a table:
| Date | Description | Original Amount | Computation Value |
| :--- | :--- | ---: | ---: |
| [Date] | [Merchant Description] | $[Original Amt] | $[Comp Value] |`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query Data', requiredAction: 'query_data' },
        { title: 'Generate Document', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "generate business P&L",
          criteria: "Must call the query_data action in Stage 1 with categories set to ['all'] and preset set to 'ytd'."
        },
        {
          prompt: "help me create a P&L for my business",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'business_pnl'."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:balance_sheet',
      name: 'Generate Balance Sheet',
      description: 'Queries asset, liability, and equity accounts to generate a business Balance Sheet.',
      systemPromptExtension: `- To generate a business Balance Sheet document:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd". Fetch the raw transaction history to compute bank/account asset balances.
  2. Stage 2: Once data is returned, set 'agent_action.action' to 'generate_document', specify 'documentType' as "business_balance_sheet", and write the Balance Sheet inside 'documentContent' as a beautiful markdown table.
- Set 'body' to a brief summary explaining you generated the Balance Sheet.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query balances', requiredAction: 'query_data' },
        { title: 'Generate Balance Sheet', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "create a balance sheet for my LLC",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'business_balance_sheet'."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:ledger',
      name: 'Generate General Ledger',
      description: 'Generates a chronological report of all transactions for tax auditing.',
      systemPromptExtension: `- To generate a General Ledger statement:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd".
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "business_ledger", and format the transactions chronologically as a markdown table in 'documentContent'.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query transactions', requiredAction: 'query_data' },
        { title: 'Generate Ledger', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "make a general ledger for this year",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'business_ledger'."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:expense_summary',
      name: 'Generate Expense Summary',
      description: 'Generates a detailed summary of business expenses grouped by standard spend and Schedule C category.',
      systemPromptExtension: `- To generate a business Expense Summary:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd".
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_expense_summary", and format the summary of expenses grouped by category in 'documentContent'.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query transactions', requiredAction: 'query_data' },
        { title: 'Generate Expense Summary', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "generate an expense summary",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_expense_summary'."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:mileage_log',
      name: 'Generate Mileage Log',
      description: 'Compiles a travel and mileage log from vehicle and business trip transactions.',
      systemPromptExtension: `- To generate a Mileage Log:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd" (or filter for Car & Truck / Travel).
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_mileage_log", and format the business travel logs as a markdown table in 'documentContent'.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query travel data', requiredAction: 'query_data' },
        { title: 'Generate Mileage Log', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "compile a mileage log",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_mileage_log'."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:assets',
      name: 'Generate Asset & Depreciation Log',
      description: 'Creates a log of high-value purchases and equipment depreciations.',
      systemPromptExtension: `- To generate an Asset & Depreciation Log:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd".
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_assets", and format the assets and equipment list as a table in 'documentContent'.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query equipment transactions', requiredAction: 'query_data' },
        { title: 'Generate Asset Log', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "generate asset purchases log",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_assets'."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:payments_estimated',
      name: 'Generate Estimated Tax Payments Voucher',
      description: 'Calculates business earnings and builds an Estimated Tax Payments reference voucher (1040-ES).',
      systemPromptExtension: `- To generate an Estimated Tax Payments (1040-ES) reference voucher:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd" to analyze net profit/loss.
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "payments_estimated", and calculate self-employment estimated tax payments, formatting the voucher in 'documentContent'.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query earnings data', requiredAction: 'query_data' },
        { title: 'Generate Estimated Tax Voucher', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "create estimated tax payments voucher",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'payments_estimated'."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:w2_w3',
      name: 'Generate W-2/W-3 Employee Payroll Summary',
      description: 'Compiles employee wage payments and withholding transactions.',
      systemPromptExtension: `- To generate a W-2/W-3 Employee Payroll Summary:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd".
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_w2_w3", and format the employee payroll wages and deductions in 'documentContent'.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query payroll transactions', requiredAction: 'query_data' },
        { title: 'Generate W-2/W-3 Summary', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "create W-2 employee summary",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_w2_w3'."
        }
      ]
    });

    upsertBuiltInSkill({
      id: 'builtin:1099_issued',
      name: 'Generate 1099-NEC Issued Log',
      description: 'Queries independent contractor payments exceeding $600 to compile a 1099-NEC filing log.',
      systemPromptExtension: `- To generate a 1099-NEC Issued Log:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd" (or filter for contractLabor).
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_1099_issued", and format independent contractors who were paid over $600 in 'documentContent'.`,
      enabled: true,
      isBuiltIn: true,
      stages: [
        { title: 'Query contractor payments', requiredAction: 'query_data' },
        { title: 'Generate 1099 Issued Log', requiredAction: 'generate_document' }
      ],
      testCases: [
        {
          prompt: "generate 1099-NEC issued log",
          criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_1099_issued'."
        }
      ]
    });

    if (hasChanges || updatedSkills.length !== currentSkills.length) {
      await db.settings.put({ key: 'app:agentSkills', value: updatedSkills });
    }
  } catch (err) {
    console.error('Failed to seed agent skills globally:', err);
  }
}
