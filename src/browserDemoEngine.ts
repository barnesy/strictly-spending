import type { Account, Budget, Category, CategoryRule, CsvMapping, ImportBatch, Loan, MerchantOverride, RecurrenceInfo, Transaction } from './types';
import type { Scenario } from './api/scenarios';
import type { ProjectionParams } from './api/forecast';
import type { SimpleFinAccountRecord, SimpleFinConfig, SimpleFinSyncResponse } from './api/simplefin';
import type { ProjectionPoint } from './components/ForecastCharts';
import { buildDemoTransactions } from './demoData';
import { categorize, extractMerchantKey, inferTypeCategory } from './domain/categorize';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BROWSER_DB_STORAGE_KEY = 'strictly_browser_db_v1';

const DEMO_CATEGORIES: Category[] = [
  { id: 1, name: 'Groceries', color: '#4caf50', type: 'spend', sortOrder: 10, defaultRecurrence: 'onetime' },
  { id: 2, name: 'Restaurants & Coffee', color: '#ff7043', type: 'spend', sortOrder: 20, defaultRecurrence: 'onetime' },
  { id: 3, name: 'Transportation', color: '#5c6bc0', type: 'spend', sortOrder: 30, defaultRecurrence: 'onetime' },
  { id: 4, name: 'Auto Loan', color: '#3949ab', type: 'spend', sortOrder: 35, defaultRecurrence: 'recurring' },
  { id: 5, name: 'Utilities', color: '#26a69a', type: 'spend', sortOrder: 40, defaultRecurrence: 'recurring' },
  { id: 6, name: 'Subscriptions', color: '#ab47bc', type: 'spend', sortOrder: 50, defaultRecurrence: 'recurring' },
  { id: 7, name: 'Housing', color: '#8d6e63', type: 'spend', sortOrder: 60, defaultRecurrence: 'recurring' },
  { id: 8, name: 'Mortgage', color: '#6d4c41', type: 'spend', sortOrder: 65, defaultRecurrence: 'recurring' },
  { id: 9, name: 'Student Loans', color: '#5d4037', type: 'spend', sortOrder: 67, defaultRecurrence: 'recurring' },
  { id: 10, name: 'Shopping', color: '#ec407a', type: 'spend', sortOrder: 70, defaultRecurrence: 'onetime' },
  { id: 11, name: 'Entertainment', color: '#ffa726', type: 'spend', sortOrder: 80, defaultRecurrence: 'onetime' },
  { id: 12, name: 'Health', color: '#42a5f5', type: 'spend', sortOrder: 90, defaultRecurrence: 'onetime' },
  { id: 13, name: 'Insurance', color: '#0288d1', type: 'spend', sortOrder: 95, defaultRecurrence: 'recurring' },
  { id: 14, name: 'Taxes', color: '#455a64', type: 'spend', sortOrder: 100, defaultRecurrence: 'onetime' },
  { id: 15, name: 'Travel', color: '#66bb6a', type: 'spend', sortOrder: 110, defaultRecurrence: 'onetime' },
  { id: 16, name: 'Personal Care', color: '#d4af37', type: 'spend', sortOrder: 120, defaultRecurrence: 'onetime' },
  { id: 17, name: 'Fees & Interest', color: '#bdbdbd', type: 'spend', sortOrder: 130, defaultRecurrence: 'onetime' },
  { id: 18, name: 'Income', color: '#2e7d32', type: 'income', sortOrder: 200, defaultRecurrence: 'recurring' },
  { id: 19, name: 'Transfers', color: '#90a4ae', type: 'transfer', sortOrder: 210, defaultRecurrence: 'onetime' },
  { id: 20, name: 'Uncategorized', color: '#9e9e9e', type: 'spend', sortOrder: 999, defaultRecurrence: 'onetime' },
];

const RECURRING_CATEGORIES = new Set([
  'Housing',
  'Mortgage',
  'Auto Loan',
  'Student Loans',
  'Insurance',
  'Utilities',
  'Subscriptions',
  'Income',
]);

interface BrowserDemoState {
  accounts: Account[];
  categories: Category[];
  rules: CategoryRule[];
  transactions: Transaction[];
  budgets: Budget[];
  loans: Loan[];
  scenarios: Scenario[];
  settings: Array<{ key: string; value: unknown }>;
  simplefinAccounts: SimpleFinAccountRecord[];
  merchantOverrides: MerchantOverride[];
  csvMappings: CsvMapping[];
  imports: ImportBatch[];
}

let state: BrowserDemoState | null = null;

function persistState(): void {
  if (!state || typeof window === 'undefined') return;
  try {
    localStorage.setItem(BROWSER_DB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function ensureInitialized(): BrowserDemoState {
  if (state) return state;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(BROWSER_DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
          state = {
            accounts: parsed.accounts,
            categories: Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : [...DEMO_CATEGORIES],
            rules: Array.isArray(parsed.rules) ? parsed.rules : [],
            transactions: parsed.transactions,
            budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
            loans: Array.isArray(parsed.loans) ? parsed.loans : [],
            scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
            settings: Array.isArray(parsed.settings) ? parsed.settings : [],
            simplefinAccounts: Array.isArray(parsed.simplefinAccounts) ? parsed.simplefinAccounts : [],
            merchantOverrides: Array.isArray(parsed.merchantOverrides) ? parsed.merchantOverrides : [],
            csvMappings: Array.isArray(parsed.csvMappings) ? parsed.csvMappings : [],
            imports: Array.isArray(parsed.imports) ? parsed.imports : [],
          };
          return state;
        }
      }
    } catch {
      // Fallback to default seed below
    }
  }

  const now = new Date();
  const year = now.getFullYear();
  const throughMonth = now.getMonth();

  const accounts: Account[] = [
    {
      id: 1,
      name: 'Demo: Checking',
      type: 'checking',
      institution: 'Demo Bank',
      last4: '4821',
      source: 'demo',
      enabled: true,
      currentBalance: 14250,
    },
    {
      id: 2,
      name: 'Demo: Credit Card',
      type: 'credit',
      institution: 'Demo Bank',
      last4: '9012',
      source: 'demo',
      enabled: true,
      currentBalance: -1540,
    },
    {
      id: 3,
      name: 'Demo: Joint Card',
      type: 'credit',
      institution: 'Demo Bank',
      last4: '3349',
      source: 'demo',
      enabled: true,
      currentBalance: -820,
    },
    {
      id: 4,
      name: 'Demo: High-Yield Savings',
      type: 'savings',
      institution: 'Ally Bank',
      last4: '7710',
      source: 'demo',
      enabled: true,
      currentBalance: 32500,
    },
    {
      id: 5,
      name: 'Demo: Vanguard Roth IRA',
      type: 'investment',
      institution: 'Vanguard',
      last4: '8804',
      source: 'demo',
      enabled: true,
      currentBalance: 68400,
    },
  ];

  const accountIdByKey = {
    checking: 1,
    credit: 2,
    joint: 3,
  } as const;

  const rawTxns = [
    ...buildDemoTransactions(year - 1, 11),
    ...buildDemoTransactions(year, throughMonth),
  ];

  let nextId = 1;
  const transactions: Transaction[] = rawTxns
    .map((d) => {
      const merchantKey = extractMerchantKey(d.description);
      const isRecurring =
        RECURRING_CATEGORIES.has(d.category) || /fitness|gym/i.test(d.description);
      return {
        id: nextId++,
        accountId: accountIdByKey[d.account],
        date: d.date,
        description: d.description,
        amount: d.amount,
        category: d.category,
        source: 'demo' as const,
        merchantKey,
        userOverridden: true,
        dedupKey: `demo-${nextId}`,
        recurrence: (isRecurring ? 'recurring' : 'onetime') as 'recurring' | 'onetime',
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id || 0) - (a.id || 0)));

  const budgets: Budget[] = [
    { category: 'Mortgage', monthlyAmount: 2150, userSet: true },
    { category: 'Housing', monthlyAmount: 1950, userSet: true },
    { category: 'Auto Loan', monthlyAmount: 389, userSet: true },
    { category: 'Student Loans', monthlyAmount: 450, userSet: true },
    { category: 'Insurance', monthlyAmount: 145, userSet: true },
    { category: 'Utilities', monthlyAmount: 225, userSet: true },
    { category: 'Subscriptions', monthlyAmount: 95, userSet: true },
    { category: 'Groceries', monthlyAmount: 550, userSet: true },
    { category: 'Restaurants & Coffee', monthlyAmount: 280, userSet: true },
    { category: 'Transportation', monthlyAmount: 160, userSet: true },
    { category: 'Shopping', monthlyAmount: 300, userSet: true },
    { category: 'Health', monthlyAmount: 100, userSet: true },
    { category: 'Entertainment', monthlyAmount: 80, userSet: true },
    { category: 'Personal Care', monthlyAmount: 75, userSet: true },
  ];

  const loans: Loan[] = [
    {
      id: 1,
      name: 'Primary Residence Mortgage',
      type: 'house',
      principal: 342000,
      downPayment: 85000,
      rate: 5.875,
      termYears: 30,
      startDate: `${year - 2}-06-01`,
      category: 'Mortgage',
      merchant: 'homemortgage',
      propertyValue: 465000,
      monthlyPayment: 2150,
      extraMonthlyPayment: 200,
      createdAt: now.toISOString(),
      enabled: true,
    },
    {
      id: 2,
      name: '2024 Crossover Auto Loan',
      type: 'car',
      principal: 18400,
      downPayment: 5000,
      rate: 4.9,
      termYears: 5,
      startDate: `${year - 1}-03-15`,
      category: 'Auto Loan',
      merchant: 'autofinance',
      propertyValue: 24500,
      monthlyPayment: 389,
      extraMonthlyPayment: 0,
      createdAt: now.toISOString(),
      enabled: true,
    },
    {
      id: 3,
      name: 'Federal Student Loan',
      type: 'student',
      principal: 24800,
      downPayment: 0,
      rate: 5.25,
      termYears: 10,
      startDate: `${year - 3}-09-01`,
      category: 'Student Loans',
      merchant: 'studentloan',
      monthlyPayment: 450,
      extraMonthlyPayment: 0,
      createdAt: now.toISOString(),
      enabled: true,
    },
  ];

  const rules: CategoryRule[] = [
    { id: 1, pattern: 'NETFLIX', category: 'Subscriptions', priority: 100, createdAt: now.toISOString() },
    { id: 2, pattern: 'SPOTIFY', category: 'Subscriptions', priority: 100, createdAt: now.toISOString() },
    { id: 3, pattern: 'CLAUDE.AI', category: 'Subscriptions', priority: 100, createdAt: now.toISOString() },
    { id: 4, pattern: 'PAYROLL', category: 'Income', priority: 100, createdAt: now.toISOString() },
    { id: 5, pattern: 'MORTGAGE', category: 'Mortgage', priority: 100, createdAt: now.toISOString() },
    { id: 6, pattern: 'GROCER', category: 'Groceries', priority: 90, createdAt: now.toISOString() },
  ];

  state = {
    accounts,
    categories: [...DEMO_CATEGORIES],
    rules,
    transactions,
    budgets,
    loans,
    scenarios: [],
    settings: [],
    simplefinAccounts: [],
    merchantOverrides: [],
    csvMappings: [],
    imports: [],
  };

  return state;
}

function parseSimpleFinUrl(rawUrl: string): { username: string; password: string; cleanUrl: string } {
  const trimmed = (rawUrl || '').trim();
  const schemeSplit = trimmed.split('://');
  if (schemeSplit.length !== 2) {
    throw new Error('Invalid SimpleFIN URL format: missing scheme');
  }
  const [scheme, rest] = schemeSplit;
  const atIdx = rest.indexOf('@');
  if (atIdx === -1) {
    throw new Error('Invalid SimpleFIN URL format: missing credentials before @');
  }
  const authPart = rest.slice(0, atIdx);
  const hostPart = rest.slice(atIdx + 1);
  const colonIdx = authPart.indexOf(':');
  if (colonIdx === -1) {
    throw new Error('Invalid SimpleFIN URL credentials: expected username:password');
  }
  const username = authPart.slice(0, colonIdx);
  const password = authPart.slice(colonIdx + 1);
  const cleanUrl = `${scheme}://${hostPart.replace(/\/+$/, '')}`;
  return { username, password, cleanUrl };
}

function resolveSimpleFinDate(posted?: number | null, transactedAt?: number | null): string {
  const epoch =
    typeof posted === 'number' && posted > 0
      ? posted
      : typeof transactedAt === 'number' && transactedAt > 0
      ? transactedAt
      : Math.floor(Date.now() / 1000);
  const dt = new Date(epoch * 1000);
  const iso = Number.isNaN(dt.getTime()) ? new Date().toISOString().slice(0, 10) : dt.toISOString().slice(0, 10);
  if (iso < '2000-01-01') {
    return new Date().toISOString().slice(0, 10);
  }
  return iso;
}

function inferStrictlyAccountDetails(orgName: string | null | undefined, accName: string): {
  type: Account['type'];
  institution: string;
  name: string;
  last4?: string;
} {
  const bankName = (orgName || 'Bank').trim();
  const lower = `${bankName} ${accName}`.toLowerCase();
  const isMortgage =
    lower.includes('mortgage') ||
    lower.includes('home loan') ||
    lower.includes('rocket') ||
    lower.includes('mr. cooper') ||
    lower.includes('pennymac') ||
    lower.includes('loancare');
  const isLoan =
    isMortgage ||
    lower.includes('loan') ||
    lower.includes('auto finance') ||
    lower.includes('santander') ||
    lower.includes('nelnet') ||
    lower.includes('aidvantage') ||
    lower.includes('mohela') ||
    lower.includes('navient') ||
    lower.includes('sallie mae');
  const isCredit =
    !isLoan &&
    (lower.includes('credit') ||
      lower.includes('card') ||
      lower.includes('sapphire') ||
      lower.includes('freedom') ||
      lower.includes('quicksilver') ||
      lower.includes('venture') ||
      lower.includes('savor') ||
      lower.includes('cash') ||
      lower.includes('platinum') ||
      lower.includes('bilt'));
  const isInvestment =
    !isLoan &&
    !isCredit &&
    (lower.includes('ira') ||
      lower.includes('roth') ||
      lower.includes('401k') ||
      lower.includes('401(k)') ||
      lower.includes('hsa') ||
      lower.includes('529') ||
      lower.includes('brokerage') ||
      lower.includes('investment') ||
      lower.includes('fidelity') ||
      lower.includes('vanguard') ||
      lower.includes('schwab') ||
      lower.includes('robinhood'));
  const isSavings =
    !isLoan &&
    !isCredit &&
    !isInvestment &&
    (lower.includes('saving') ||
      lower.includes('hysa') ||
      lower.includes('money market') ||
      lower.includes('mma') ||
      /\bsav\b/.test(lower));

  const type: Account['type'] = isMortgage
    ? 'mortgage'
    : isLoan
    ? 'loan'
    : isCredit
    ? 'credit'
    : isInvestment
    ? 'investment'
    : isSavings
    ? 'savings'
    : 'checking';

  const digitsMatch = accName.match(/(\d{4})\b/);
  const last4 = digitsMatch ? digitsMatch[1] : undefined;
  const cleanName = accName.trim() || `${bankName} Account`;

  return {
    type,
    institution: bankName,
    name: cleanName,
    last4,
  };
}

function getSavedSimpleFinConfig(s: BrowserDemoState): SimpleFinConfig {
  const saved = s.settings.find((x) => x.key === 'simplefin_config')?.value;
  if (saved && typeof saved === 'object' && 'access_url' in (saved as any)) {
    return saved as SimpleFinConfig;
  }
  return {
    access_url: '',
    claimed_at: null,
    last_synced_at: null,
  };
}

function saveSimpleFinConfigToState(s: BrowserDemoState, cfg: SimpleFinConfig): void {
  const existing = s.settings.find((x) => x.key === 'simplefin_config');
  if (existing) existing.value = cfg;
  else s.settings.push({ key: 'simplefin_config', value: cfg });
  persistState();
}

function filterTransactions(txns: Transaction[], filters: Record<string, any> = {}): Transaction[] {
  const s = ensureInitialized();
  const incomeCats = new Set(s.categories.filter((c) => c.type === 'income').map((c) => c.name));
  const transferCats = new Set(s.categories.filter((c) => c.type === 'transfer').map((c) => c.name));
  const disabledSet = new Set<string>(filters.disabledCategories || []);
  const enabledAccSet =
    Array.isArray(filters.enabledAccountIds) && filters.enabledAccountIds.length > 0
      ? new Set<number>(filters.enabledAccountIds)
      : null;

  const hasNonDemoTxns = s.transactions.some((t) => t.source !== 'demo');
  const explicitDemoMode = typeof filters.demoMode === 'boolean' ? filters.demoMode : undefined;

  return txns.filter((t) => {
    if (explicitDemoMode === true) {
      if (t.source !== 'demo') return false;
    } else if (explicitDemoMode === false && hasNonDemoTxns) {
      if (t.source === 'demo') return false;
    }

    if (filters.startDate && t.date < filters.startDate) return false;
    if (filters.endDate && t.date > filters.endDate) return false;
    if (enabledAccSet && !enabledAccSet.has(t.accountId)) return false;
    if (disabledSet.has(t.category)) return false;
    if (filters.category && t.category !== filters.category) return false;
    if (filters.merchantKey && t.merchantKey !== filters.merchantKey) return false;

    if (filters.transactionType === 'income') {
      if (!(incomeCats.has(t.category) || (t.amount > 0 && !transferCats.has(t.category)))) return false;
    } else if (filters.transactionType === 'spend') {
      if (!(t.amount < 0 && !incomeCats.has(t.category) && !transferCats.has(t.category))) return false;
    } else if (filters.transactionType === 'transfer') {
      if (!transferCats.has(t.category)) return false;
    } else if (filters.spendOnly) {
      if (!(t.amount < 0 && !incomeCats.has(t.category) && !transferCats.has(t.category))) return false;
    }

    if (filters.recurrenceFilter === 'recurring' && t.recurrence !== 'recurring') return false;
    if (filters.recurrenceFilter === 'onetime' && t.recurrence === 'recurring') return false;

    if (filters.searchQuery) {
      const q = String(filters.searchQuery).toLowerCase();
      if (
        !t.description.toLowerCase().includes(q) &&
        !(t.merchantKey || '').toLowerCase().includes(q) &&
        !t.category.toLowerCase().includes(q)
      ) {
        return false;
      }
    }

    if (typeof filters.minPrice === 'number' && Math.abs(t.amount) < filters.minPrice) return false;
    if (typeof filters.maxPrice === 'number' && Math.abs(t.amount) > filters.maxPrice) return false;
    return true;
  });
}

function computeDemoProjection(params: ProjectionParams): ProjectionPoint[] {
  const s = ensureInitialized();
  const months = Math.max(1, params.months || 24);
  const now = new Date();
  let cashBalance = params.starting_balance ?? 14250;
  let cumulativeRemainder = 0;

  const activeDests = (params.destinations || []).map((d) => ({
    name: d.name,
    balance: d.starting_balance || 0,
    monthlyAllocation: d.enabled === false ? 0 : d.monthly_allocation || 0,
    monthlyRate: (d.annual_growth_rate || 7) / 100 / 12,
  }));

  const activeLoans = s.loans
    .filter((l) => l.enabled !== false)
    .map((l) => ({
      id: l.id || 1,
      name: l.name,
      type: l.type,
      balance: l.principal,
      rate: (l.rate || 5) / 100 / 12,
      payment: (l.monthlyPayment || 500) + (l.extraMonthlyPayment || 0),
    }));

  let propVal = params.home_property_value ?? 465000;
  const propMonthlyRate = (params.home_appreciation_rate ?? 3.5) / 100 / 12;
  const gapSet = new Set(params.income_gaps || []);
  const windfallByMonth = new Map<number, number>();
  for (const w of params.windfalls || []) {
    windfallByMonth.set(w.month_index, (windfallByMonth.get(w.month_index) || 0) + w.amount);
  }

  const points: ProjectionPoint[] = [];

  for (let m = 1; m <= months; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const label = `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const startingBalance = Math.round(cashBalance);
    const windfall = windfallByMonth.get(m) || 0;
    const income = (gapSet.has(m) ? 0 : params.base_income || 0) + windfall;
    const recurringSpend = params.recurring_budget || 0;
    const variableSpend = params.variable_budget || 0;
    const savingsSpend = params.savings_budget || 0;
    const goalContrib = (params.goals || []).reduce((sum, g) => sum + (g.monthly_contribution || 0), 0);

    let loanPayments = params.global_extra_loan_payment || 0;
    for (const loan of activeLoans) {
      if (loan.balance <= 0) continue;
      const interest = loan.balance * loan.rate;
      const actualPay = Math.min(loan.balance + interest, loan.payment);
      loan.balance = Math.max(0, loan.balance + interest - actualPay);
      loanPayments += actualPay;
    }

    for (const dest of activeDests) {
      dest.balance = (dest.balance + dest.monthlyAllocation) * (1 + dest.monthlyRate);
    }

    const investBalance =
      activeDests.length > 0
        ? Math.round(activeDests.reduce((sum, dest) => sum + dest.balance, 0))
        : Math.round((params.starting_investment_balance || 0) * Math.pow(1 + (params.investment_growth_rate || 7) / 100 / 12, m));

    const remainder = Math.round(income - recurringSpend - variableSpend - savingsSpend - goalContrib - (params.global_extra_loan_payment || 0));
    cumulativeRemainder += remainder;
    cashBalance += remainder;

    propVal = propVal * (1 + propMonthlyRate);
    const mortgageDebt = Math.round(
      activeLoans.filter((l) => l.type === 'house').reduce((sum, l) => sum + l.balance, 0)
    );
    const totalDebt = Math.round(activeLoans.reduce((sum, l) => sum + l.balance, 0));
    const homeEquity = params.include_home_equity ? Math.max(0, Math.round(propVal - mortgageDebt)) : 0;
    const liquidNetWorth = Math.round(cashBalance + investBalance - (totalDebt - mortgageDebt));
    const netWorth = Math.round(cashBalance + investBalance + homeEquity - (params.include_home_equity ? totalDebt - mortgageDebt : totalDebt));

    points.push({
      month_index: m,
      month_label: label,
      starting_balance: startingBalance,
      income: Math.round(income),
      recurring_spend: Math.round(recurringSpend),
      variable_spend: Math.round(variableSpend),
      savings_spend: Math.round(savingsSpend),
      loan_payments: Math.round(loanPayments),
      total_debt: totalDebt,
      loans: activeLoans.map((l) => ({ id: l.id, name: l.name, balance: Math.round(l.balance) })),
      goal_contributions: Math.round(goalContrib),
      achieved_goals: [],
      remainder,
      cumulative_remainder: Math.round(cumulativeRemainder),
      ending_balance: Math.round(cashBalance),
      investment_balance: investBalance,
      destination_balances: activeDests.map((dest) => ({ name: dest.name, balance: Math.round(dest.balance) })),
      home_equity: homeEquity,
      property_value: Math.round(propVal),
      mortgage_debt: mortgageDebt,
      liquid_net_worth: liquidNetWorth,
      net_worth: netWorth,
    });
  }

  return points;
}

export async function handleBrowserDemoIpc(cmd: string, args: Record<string, any> = {}): Promise<any> {
  const s = ensureInitialized();

  switch (cmd) {
    case 'get_accounts':
      return s.accounts;
    case 'add_account': {
      const nextId = Math.max(0, ...s.accounts.map((a) => a.id || 0)) + 1;
      const item: Account = { ...args.item, id: nextId, source: args.item?.source || 'custom' };
      s.accounts = [...s.accounts, item];
      persistState();
      return nextId;
    }
    case 'update_account': {
      s.accounts = s.accounts.map((a) => (a.id === args.id ? { ...a, ...args.updates } : a));
      persistState();
      return null;
    }
    case 'delete_account': {
      s.accounts = s.accounts.filter((a) => a.id !== args.id);
      persistState();
      return null;
    }
    case 'get_categories':
      return s.categories;
    case 'add_category': {
      const nextId = Math.max(0, ...s.categories.map((c) => c.id || 0)) + 1;
      s.categories = [...s.categories, { ...args.item, id: nextId }];
      persistState();
      return nextId;
    }
    case 'update_category': {
      s.categories = s.categories.map((c) => (c.id === args.id ? { ...c, ...args.updates } : c));
      persistState();
      return null;
    }
    case 'delete_category': {
      s.categories = s.categories.filter((c) => c.id !== args.id);
      persistState();
      return null;
    }
    case 'get_rules':
      return s.rules;
    case 'add_rule': {
      const nextId = Math.max(0, ...s.rules.map((r) => r.id || 0)) + 1;
      s.rules = [...s.rules, { ...args.item, id: nextId }];
      persistState();
      return nextId;
    }
    case 'update_rule': {
      s.rules = s.rules.map((r) => (r.id === args.id ? { ...r, ...args.updates } : r));
      persistState();
      return null;
    }
    case 'delete_rule': {
      s.rules = s.rules.filter((r) => r.id !== args.id);
      persistState();
      return null;
    }
    case 'get_budgets':
      return s.budgets;
    case 'put_budget': {
      const item = args.item as Budget;
      const existing = s.budgets.find((b) => b.category === item.category);
      if (existing) {
        s.budgets = s.budgets.map((b) =>
          b.category === item.category ? { ...b, monthlyAmount: item.monthlyAmount, userSet: item.userSet ?? true } : b
        );
        persistState();
        return null;
      }
      s.budgets = [...s.budgets, { category: item.category, monthlyAmount: item.monthlyAmount, userSet: item.userSet ?? true }];
      persistState();
      return null;
    }
    case 'bulk_put_budgets': {
      for (const item of args.items || []) {
        await handleBrowserDemoIpc('put_budget', { item });
      }
      persistState();
      return null;
    }
    case 'get_loans':
      return s.loans;
    case 'add_loan':
    case 'put_loan': {
      const item = args.item as Loan;
      if (item.id) {
        s.loans = s.loans.map((l) => (l.id === item.id ? { ...l, ...item } : l));
        persistState();
        return item.id;
      }
      const nextId = Math.max(0, ...s.loans.map((l) => l.id || 0)) + 1;
      s.loans = [...s.loans, { ...item, id: nextId }];
      persistState();
      return nextId;
    }
    case 'update_loan': {
      s.loans = s.loans.map((l) => (l.id === args.id ? { ...l, ...args.updates } : l));
      persistState();
      return null;
    }
    case 'delete_loan': {
      s.loans = s.loans.filter((l) => l.id !== args.id);
      persistState();
      return null;
    }
    case 'get_scenarios':
      return s.scenarios;
    case 'create_scenario': {
      const nextId = Math.max(0, ...s.scenarios.map((sc) => sc.id || 0)) + 1;
      const created = { ...args.scenario, id: nextId };
      s.scenarios = [...s.scenarios, created];
      persistState();
      return created;
    }
    case 'update_scenario': {
      s.scenarios = s.scenarios.map((sc) => (sc.id === args.id ? { ...sc, ...args.scenario } : sc));
      persistState();
      return s.scenarios.find((sc) => sc.id === args.id) || null;
    }
    case 'delete_scenario': {
      s.scenarios = s.scenarios.filter((sc) => sc.id !== args.id);
      persistState();
      return null;
    }
    case 'get_transaction': {
      return s.transactions.find((t) => t.id === args.id) ?? null;
    }
    case 'get_transactions': {
      return filterTransactions(s.transactions, {
        startDate: args.startDate,
        endDate: args.endDate,
        category: args.category,
        merchantKey: args.merchantKey,
        ...(args.accountId ? { enabledAccountIds: [args.accountId] } : {}),
        ...(args.filters || {}),
      });
    }
    case 'get_transactions_paginated': {
      const filtered = filterTransactions(s.transactions, args.filters || {});
      const limit = args.limit || 50;
      const offset = args.offset || 0;
      return filtered.slice(offset, offset + limit);
    }
    case 'get_transaction_count': {
      return filterTransactions(s.transactions, args.filters || {}).length;
    }
    case 'add_transaction': {
      const nextId = Math.max(0, ...s.transactions.map((t) => t.id || 0)) + 1;
      const item: Transaction = {
        ...args.item,
        id: nextId,
        merchantKey: args.item?.merchantKey || extractMerchantKey(args.item?.description || ''),
        source: args.item?.source || 'custom',
        dedupKey: args.item?.dedupKey || `tx-${nextId}`,
        userOverridden: Boolean(args.item?.userOverridden),
      };
      s.transactions = [item, ...s.transactions].sort((a, b) => b.date.localeCompare(a.date));
      persistState();
      return nextId;
    }
    case 'bulk_add_transactions': {
      const items: Omit<Transaction, 'id'>[] = args.items || [];
      let nextId = Math.max(0, ...s.transactions.map((t) => t.id || 0)) + 1;
      const existingKeys = new Set(s.transactions.map((t) => t.dedupKey).filter(Boolean));
      const added: Transaction[] = [];
      for (const raw of items) {
        if (raw.dedupKey && existingKeys.has(raw.dedupKey)) continue;
        if (raw.dedupKey) existingKeys.add(raw.dedupKey);
        added.push({
          ...raw,
          id: nextId++,
          merchantKey: raw.merchantKey || extractMerchantKey(raw.description || ''),
          source: raw.source || 'custom',
          dedupKey: raw.dedupKey || `tx-${nextId}`,
          userOverridden: Boolean(raw.userOverridden),
        });
      }
      if (added.length > 0) {
        s.settings = s.settings.filter((x) => x.key !== 'demoMode');
        s.settings.push({ key: 'demoMode', value: false });
        s.accounts = s.accounts.filter((a) => a.source !== 'demo');
        s.transactions = [...added, ...s.transactions.filter((t) => t.source !== 'demo')].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
        persistState();
      }
      return null;
    }
    case 'update_transaction': {
      s.transactions = s.transactions.map((t) => (t.id === args.id ? { ...t, ...args.updates } : t));
      persistState();
      return null;
    }
    case 'bulk_update_transactions': {
      const updateMap = new Map<number, Partial<Transaction>>();
      for (const u of args.updates || []) {
        if (u && typeof u.id === 'number') {
          updateMap.set(u.id, u.updates || {});
        }
      }
      if (updateMap.size > 0) {
        s.transactions = s.transactions.map((t) => (t.id && updateMap.has(t.id) ? { ...t, ...updateMap.get(t.id)! } : t));
        persistState();
      }
      return null;
    }
    case 'delete_transaction': {
      s.transactions = s.transactions.filter((t) => t.id !== args.id);
      persistState();
      return null;
    }
    case 'clear_transactions': {
      if (args.accountId !== undefined && args.accountId !== null) {
        s.transactions = s.transactions.filter((t) => t.accountId !== args.accountId);
      } else {
        s.transactions = [];
      }
      persistState();
      return null;
    }
    case 'get_sort_queue': {
      const limit = args.limit || 50;
      return filterTransactions(s.transactions, {})
        .filter((t) => !t.userOverridden && t.category === 'Uncategorized')
        .slice(0, limit);
    }
    case 'get_dashboard_aggregates': {
      const filtered = filterTransactions(s.transactions, args.filters || {});
      const incomeCats = new Set(s.categories.filter((c) => c.type === 'income').map((c) => c.name));
      const transferCats = new Set(s.categories.filter((c) => c.type === 'transfer').map((c) => c.name));
      let totalSpend = 0;
      let totalIncome = 0;
      const accountTotals: Record<number, number> = {};
      for (const t of filtered) {
        accountTotals[t.accountId] = (accountTotals[t.accountId] || 0) + t.amount;
        if (transferCats.has(t.category)) continue;
        if (incomeCats.has(t.category) || t.amount > 0) {
          if (t.amount > 0) totalIncome += t.amount;
        } else if (t.amount < 0) {
          totalSpend += Math.abs(t.amount);
        }
      }
      return {
        totalSpend: Math.round(totalSpend * 100) / 100,
        totalIncome: Math.round(totalIncome * 100) / 100,
        accountTotals,
      };
    }
    case 'get_spend_chart_data': {
      const filtered = filterTransactions(s.transactions, { ...(args.filters || {}), spendOnly: true });
      const groupBy = args.groupBy || 'category';
      const byMonthKey = new Map<string, number>();
      for (const t of filtered) {
        if (t.amount >= 0) continue;
        const month = t.date.slice(0, 7);
        const key =
          groupBy === 'account'
            ? String(t.accountId)
            : groupBy === 'merchant'
            ? t.merchantKey || t.description
            : groupBy === 'recurrence'
            ? t.recurrence || 'onetime'
            : groupBy === 'all'
            ? 'all'
            : t.category;
        const composite = `${month}:::${key}`;
        byMonthKey.set(composite, Math.round(((byMonthKey.get(composite) || 0) + t.amount) * 100) / 100);
      }
      return Array.from(byMonthKey.entries())
        .map(([composite, total]) => {
          const [month, key] = composite.split(':::');
          return { month, key, total };
        })
        .sort((a, b) => a.month.localeCompare(b.month));
    }
    case 'get_income_chart_data': {
      const filtered = filterTransactions(s.transactions, { ...(args.filters || {}), transactionType: 'income' });
      const byMonth = new Map<string, number>();
      for (const t of filtered) {
        if (t.amount <= 0) continue;
        const month = t.date.slice(0, 7);
        byMonth.set(month, Math.round(((byMonth.get(month) || 0) + t.amount) * 100) / 100);
      }
      return Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, key: 'income', total }));
    }
    case 'get_top_merchants': {
      const filtered = filterTransactions(s.transactions, { ...(args.filters || {}), spendOnly: true });
      const limit = args.limit || 8;
      const map = new Map<string, { merchantKey: string; displayName: string; total: number; count: number; category: string }>();
      for (const t of filtered) {
        if (t.amount >= 0) continue;
        const key = t.merchantKey || t.description;
        const cur = map.get(key) || {
          merchantKey: key,
          displayName: t.description,
          total: 0,
          count: 0,
          category: t.category,
        };
        cur.total = Math.round((cur.total + Math.abs(t.amount)) * 100) / 100;
        cur.count += 1;
        map.set(key, cur);
      }
      return Array.from(map.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);
    }
    case 'get_consolidated_recurring_merchants': {
      const accountFilter = args.accountId ? { enabledAccountIds: [args.accountId] } : {};
      const filtered = filterTransactions(s.transactions, { ...(args.filters || {}), ...accountFilter, spendOnly: true });
      const recurring = filtered.filter((t) => t.recurrence === 'recurring' && t.amount < 0);
      const byMerchant = new Map<string, { category: string; amounts: number[]; dates: string[] }>();
      for (const t of recurring) {
        const key = t.merchantKey || t.description;
        const cur = byMerchant.get(key) || { category: t.category, amounts: [], dates: [] };
        cur.amounts.push(Math.abs(t.amount));
        cur.dates.push(t.date);
        byMerchant.set(key, cur);
      }
      return Array.from(byMerchant.entries()).map(([merchantKey, info]) => ({
        merchantKey,
        category: info.category,
        monthlyAverage: Math.round(info.amounts.reduce((a, b) => a + b, 0) / Math.max(1, info.amounts.length)),
        occurrences: info.amounts.length,
        lastDate: info.dates.sort().reverse()[0] || null,
      }));
    }
    case 'get_category_trailing_averages': {
      const months = Math.max(1, args.months || 3);
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1).toISOString().slice(0, 10);
      const accountFilter = args.accountId ? { enabledAccountIds: [args.accountId] } : {};
      const recent = filterTransactions(s.transactions, {
        ...(args.filters || {}),
        ...accountFilter,
        startDate: cutoff,
        spendOnly: true,
      });
      const byCat = new Map<string, { total: number; recurring: number; variable: number }>();
      for (const t of recent) {
        if (t.amount >= 0) continue;
        const abs = Math.abs(t.amount);
        const cur = byCat.get(t.category) || { total: 0, recurring: 0, variable: 0 };
        cur.total += abs;
        if (t.recurrence === 'recurring') cur.recurring += abs;
        else cur.variable += abs;
        byCat.set(t.category, cur);
      }
      return Array.from(byCat.entries()).map(([category, v]) => ({
        category,
        average: Math.round((v.total / months) * 100) / 100,
        trailingMonthlyAvg: Math.round(v.total / months),
        recurringMonthlyAvg: Math.round(v.recurring / months),
        variableMonthlyAvg: Math.round(v.variable / months),
      }));
    }
    case 'build_recurrence_map': {
      const map: Record<string, RecurrenceInfo> = {};
      const byKey = new Map<string, Transaction[]>();
      for (const t of filterTransactions(s.transactions, {})) {
        if (args.accountId && t.accountId !== args.accountId) continue;
        const k = t.merchantKey || extractMerchantKey(t.description);
        const arr = byKey.get(k) || [];
        arr.push(t);
        byKey.set(k, arr);
      }
      for (const [k, txns] of byKey.entries()) {
        const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
        const latest = sorted[0];
        const isRec = sorted.some((t) => t.recurrence === 'recurring');
        if (isRec && latest) {
          const avg = Math.round(sorted.reduce((sum, x) => sum + Math.abs(x.amount), 0) / sorted.length);
          map[k] = {
            kind: 'monthly',
            count: sorted.length,
            meanIntervalDays: 30,
            meanAmount: avg,
            estMonthlyCost: avg,
            lastDate: latest.date,
            source: 'auto',
            lastAmount: Math.abs(latest.amount),
          };
        }
      }
      return map;
    }
    case 'get_transaction_bounds': {
      const visible = filterTransactions(s.transactions, {});
      if (visible.length === 0) return [null, null];
      const dates = visible.map((t) => t.date).sort();
      return [dates[0], dates[dates.length - 1]];
    }
    case 'get_uncategorized_count':
      return filterTransactions(s.transactions, {}).filter((t) => t.category === 'Uncategorized').length;
    case 'get_category_transaction_counts': {
      const counts: Record<string, number> = {};
      for (const t of filterTransactions(s.transactions, {})) {
        counts[t.category] = (counts[t.category] || 0) + 1;
      }
      return counts;
    }
    case 'get_rule_match_counts': {
      const counts: Record<number, number> = {};
      const visible = filterTransactions(s.transactions, {});
      for (const r of s.rules) {
        if (!r.id) continue;
        const pat = r.pattern.toLowerCase();
        counts[r.id] = visible.filter((t) => t.description.toLowerCase().includes(pat)).length;
      }
      return counts;
    }
    case 'get_merchant_groups': {
      const groups = new Map<string, {
        merchantKey: string;
        displayName: string;
        category: string;
        count: number;
        totalSpend: number;
        avgSpend: number;
        lastDate: string;
        recurrence: string;
        amounts: number[];
      }>();
      for (const t of filterTransactions(s.transactions, {})) {
        const key = t.merchantKey || extractMerchantKey(t.description);
        const g = groups.get(key) || {
          merchantKey: key,
          displayName: t.description,
          category: t.category,
          count: 0,
          totalSpend: 0,
          avgSpend: 0,
          lastDate: t.date,
          recurrence: t.recurrence || 'onetime',
          amounts: [],
        };
        g.count += 1;
        g.totalSpend = Math.round((g.totalSpend + t.amount) * 100) / 100;
        if (t.date > g.lastDate) g.lastDate = t.date;
        if (t.recurrence === 'recurring') g.recurrence = 'recurring';
        g.amounts.push(Math.abs(t.amount));
        groups.set(key, g);
      }
      return Array.from(groups.values()).map((g) => ({
        ...g,
        avgSpend: Math.round((g.totalSpend / Math.max(1, g.count)) * 100) / 100,
        latestAmount: g.amounts[0] || 0,
        previousAvgAmount:
          g.amounts.length > 1
            ? Math.round((g.amounts.slice(1).reduce((a, b) => a + b, 0) / (g.amounts.length - 1)) * 100) / 100
            : g.amounts[0] || 0,
      }));
    }
    case 'calculate_projection':
      return computeDemoProjection(args.params || {});
    case 'last_month_actual_spend': {
      const now = new Date();
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const ym = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
      const accountFilter = args.accountId ? { enabledAccountIds: [args.accountId] } : {};
      const txns = filterTransactions(s.transactions, { ...accountFilter, spendOnly: true });
      const total = txns
        .filter((t) => t.date.startsWith(ym) && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      return Math.round(total * 100) / 100;
    }
    case 'get_unique_merchants': {
      const set = new Set<string>();
      for (const t of filterTransactions(s.transactions, {})) {
        set.add(t.merchantKey || extractMerchantKey(t.description));
      }
      return Array.from(set).sort();
    }
    case 'preview_rule_matches': {
      const pat = String(args.pattern || '').toLowerCase();
      if (!pat) return { matchCount: 0, samples: [] };
      const matches = filterTransactions(s.transactions, {}).filter((t) => t.description.toLowerCase().includes(pat));
      return { matchCount: matches.length, samples: matches.slice(0, 10) };
    }
    case 'recategorize_all': {
      let updatedCount = 0;
      const ctx = { rules: s.rules };
      s.transactions = s.transactions.map((t) => {
        if (t.userOverridden && !args.forceUserRules) return t;
        let nextCat = categorize(t.description, t.merchantKey, t.rawCategory, ctx);
        if (nextCat === 'Uncategorized') {
          const inferred = inferTypeCategory(t.amount, t.source, t.rawCategory, undefined, t.description);
          if (inferred) nextCat = inferred;
        }
        if (nextCat !== t.category) {
          updatedCount += 1;
          return { ...t, category: nextCat };
        }
        return t;
      });
      if (updatedCount > 0) persistState();
      return updatedCount;
    }
    case 'get_merchant_overrides':
      return s.merchantOverrides;
    case 'put_merchant_override': {
      const item = args.item as MerchantOverride | undefined;
      if (item?.merchantKey) {
        s.merchantOverrides = [
          ...s.merchantOverrides.filter((x) => x.merchantKey !== item.merchantKey),
          item,
        ];
        persistState();
      }
      return null;
    }
    case 'get_csv_mappings':
      return s.csvMappings;
    case 'put_csv_mapping': {
      const item = args.item as CsvMapping | undefined;
      if (item) {
        const nextId = Math.max(0, ...s.csvMappings.map((x) => x.id || 0)) + 1;
        const saved = { ...item, id: item.id || nextId };
        s.csvMappings = [...s.csvMappings.filter((x) => x.id !== saved.id), saved];
        persistState();
        return saved.id;
      }
      return 1;
    }
    case 'get_imports':
      return s.imports;
    case 'add_import': {
      const nextId = Math.max(0, ...s.imports.map((x) => x.id || 0)) + 1;
      s.imports = [{ ...(args.item || {}), id: nextId }, ...s.imports];
      persistState();
      return nextId;
    }
    case 'get_settings':
      return s.settings;
    case 'get_setting':
      return s.settings.find((x) => x.key === args.key)?.value ?? null;
    case 'put_setting': {
      const key = args.item?.key ?? args.key;
      const val = args.item?.value ?? args.value;
      if (key) {
        const existing = s.settings.find((x) => x.key === key);
        if (existing) existing.value = val;
        else s.settings.push({ key, value: val });
        persistState();
      }
      return null;
    }
    case 'delete_setting': {
      s.settings = s.settings.filter((x) => x.key !== args.key);
      persistState();
      return null;
    }
    case 'is_safe_mode':
      return false;
    case 'get_mcp_server_info':
      return {
        executablePath: '',
        dbPath: 'Browser Local Storage',
        configJson: '{}',
        localUrls: [],
      };
    case 'simplefin_get_config': {
      return getSavedSimpleFinConfig(s);
    }
    case 'simplefin_save_config': {
      const cfg = args.config || { access_url: '', claimed_at: null, last_synced_at: null };
      saveSimpleFinConfigToState(s, cfg);
      return null;
    }
    case 'simplefin_remove_connection': {
      s.settings = s.settings.filter((x) => x.key !== 'simplefin_config');
      s.simplefinAccounts = [];
      persistState();
      return null;
    }
    case 'simplefin_claim_setup_token': {
      const trimmed = String(args.tokenInput || args.setupToken || '').trim();
      if (!trimmed) {
        throw new Error('Setup token cannot be empty.');
      }

      // Allow pasting an already-claimed SimpleFIN Access URL directly (https://user:pass@beta-bridge.simplefin.org/simplefin)
      if ((trimmed.startsWith('https://') || trimmed.startsWith('http://')) && trimmed.includes('@')) {
        const cfg: SimpleFinConfig = {
          access_url: trimmed.replace(/\/+$/, ''),
          claimed_at: new Date().toISOString(),
          last_synced_at: null,
        };
        saveSimpleFinConfigToState(s, cfg);
        return cfg;
      }

      let claimUrl = '';
      try {
        claimUrl = atob(trimmed).trim();
      } catch {
        throw new Error('Invalid SimpleFIN Setup Token (not valid Base64).');
      }

      if (!claimUrl.startsWith('https://') && !claimUrl.startsWith('http://')) {
        throw new Error('Decoded SimpleFIN Setup Token is not a valid URL.');
      }

      // Simple POST with no custom headers avoids CORS preflight and works directly with beta-bridge.simplefin.org
      const resp = await fetch(claimUrl, { method: 'POST' });
      if (!resp.ok) {
        throw new Error(
          `SimpleFIN token claim failed (HTTP ${resp.status}). Note: Setup tokens are single-use and expire quickly.`
        );
      }
      const accessUrl = (await resp.text()).trim();
      if (!accessUrl.startsWith('https://') && !accessUrl.startsWith('http://')) {
        throw new Error('SimpleFIN Bridge returned an invalid access URL.');
      }

      const cfg: SimpleFinConfig = {
        access_url: accessUrl.replace(/\/+$/, ''),
        claimed_at: new Date().toISOString(),
        last_synced_at: null,
      };
      saveSimpleFinConfigToState(s, cfg);
      return cfg;
    }
    case 'simplefin_get_accounts': {
      const cfg = getSavedSimpleFinConfig(s);
      if (!cfg.access_url) {
        return s.simplefinAccounts;
      }

      const parsed = parseSimpleFinUrl(cfg.access_url);
      const endpoint = `${parsed.cleanUrl}/accounts?version=2&balances-only=1`;
      const headers: Record<string, string> = {
        Authorization: 'Basic ' + btoa(`${parsed.username}:${parsed.password}`),
      };

      const resp = await fetch(endpoint, { method: 'GET', headers });
      if (!resp.ok) {
        throw new Error(`SimpleFIN accounts request failed (HTTP ${resp.status})`);
      }

      const accountSet = await resp.json();
      const rawAccounts: any[] = Array.isArray(accountSet?.accounts) ? accountSet.accounts : [];
      const existingById = new Map(s.simplefinAccounts.map((a) => [a.account_id, a]));
      const results: SimpleFinAccountRecord[] = [];
      let nextSfRowId = Math.max(0, ...s.simplefinAccounts.map((a) => a.id || 0)) + 1;

      for (const acc of rawAccounts) {
        const sfAccId = String(acc.id);
        const orgName =
          acc?.org?.name ||
          acc?.org?.['sfin-url'] ||
          acc?.org?.domain ||
          'Financial Institution';
        const balanceVal =
          typeof acc?.balance === 'string' || typeof acc?.balance === 'number'
            ? parseFloat(String(acc.balance))
            : NaN;
        const balance = Number.isFinite(balanceVal) ? balanceVal : null;
        const availVal =
          typeof acc?.['available-balance'] === 'string' || typeof acc?.['available-balance'] === 'number'
            ? parseFloat(String(acc['available-balance']))
            : NaN;
        const availableBalance = Number.isFinite(availVal) ? availVal : null;
        const balanceDateEpoch = typeof acc?.['balance-date'] === 'number' ? acc['balance-date'] : null;

        const prev = existingById.get(sfAccId);
        let mappedAccountId: number | null = prev?.strictly_account_id ?? null;

        if (mappedAccountId !== null && !s.accounts.some((a) => a.id === mappedAccountId)) {
          mappedAccountId = null;
        }

        if (mappedAccountId === null) {
          const { name: accountName, type: accountType, institution, last4 } = inferStrictlyAccountDetails(
            orgName,
            String(acc.name || 'Account')
          );
          const match = s.accounts.find(
            (a) => a.name.toLowerCase() === accountName.toLowerCase() && a.source !== 'demo'
          );
          if (match?.id) {
            mappedAccountId = match.id;
          } else {
            const nextId = Math.max(0, ...s.accounts.map((a) => a.id || 0)) + 1;
            const newAcc: Account = {
              id: nextId,
              name: accountName,
              type: accountType,
              institution,
              last4,
              currentBalance: balance ?? undefined,
              enabled: true,
              source: 'simplefin',
            };
            s.accounts = [...s.accounts, newAcc];
            mappedAccountId = nextId;
          }
        } else if (balance !== null) {
          s.accounts = s.accounts.map((a) =>
            a.id === mappedAccountId ? { ...a, currentBalance: balance } : a
          );
        }

        results.push({
          id: prev?.id || nextSfRowId++,
          account_id: sfAccId,
          org_name: String(orgName),
          name: String(acc.name || 'Account'),
          currency: String(acc.currency || 'USD'),
          balance,
          available_balance: availableBalance,
          balance_date: balanceDateEpoch,
          strictly_account_id: mappedAccountId,
          latest_transaction_date: prev?.latest_transaction_date ?? null,
        });
      }

      s.simplefinAccounts = results;
      persistState();
      return results;
    }
    case 'simplefin_map_account': {
      const sfId = String(args.accountId || args.simplefinAccountId || '');
      const strictlyAccountId = args.strictlyAccountId ?? null;
      s.simplefinAccounts = s.simplefinAccounts.map((a) =>
        a.account_id === sfId ? { ...a, strictly_account_id: strictlyAccountId } : a
      );
      persistState();
      return null;
    }
    case 'simplefin_sync_transactions': {
      const cfg = getSavedSimpleFinConfig(s);
      if (!cfg.access_url) {
        throw new Error('SimpleFIN is not configured. Claim a setup token first.');
      }

      const parsed = parseSimpleFinUrl(cfg.access_url);
      let startEpoch = Math.floor(Date.now() / 1000) - 60 * 86400;
      if (args.startDate) {
        const parsedMs = new Date(String(args.startDate)).getTime();
        if (!Number.isNaN(parsedMs) && parsedMs > 0) {
          startEpoch = Math.floor(parsedMs / 1000);
        }
      }
      const syncStartDateStr = new Date(startEpoch * 1000).toISOString().slice(0, 10);
      const endpoint = `${parsed.cleanUrl}/accounts?version=2&pending=1&start-date=${startEpoch}`;
      const headers: Record<string, string> = {
        Authorization: 'Basic ' + btoa(`${parsed.username}:${parsed.password}`),
      };

      const resp = await fetch(endpoint, { method: 'GET', headers });
      if (!resp.ok) {
        throw new Error(`SimpleFIN sync failed (HTTP ${resp.status})`);
      }

      const accountSet = await resp.json();
      const rawAccounts: any[] = Array.isArray(accountSet?.accounts) ? accountSet.accounts : [];
      const warnings: string[] = Array.isArray(accountSet?.errors) ? [...accountSet.errors] : [];

      const existingKeys = new Set(s.transactions.map((t) => t.dedupKey).filter(Boolean));
      const existingById = new Map(s.simplefinAccounts.map((a) => [a.account_id, a]));
      const updatedSfAccounts: SimpleFinAccountRecord[] = [];
      let nextSfRowId = Math.max(0, ...s.simplefinAccounts.map((a) => a.id || 0)) + 1;

      let accountsSynced = 0;
      let transactionsInserted = 0;
      let nextTxId = Math.max(0, ...s.transactions.map((t) => t.id || 0)) + 1;
      const newTransactions: Transaction[] = [];
      const ctx = { rules: s.rules };

      for (const acc of rawAccounts) {
        const sfAccId = String(acc.id);
        const orgName =
          acc?.org?.name ||
          acc?.org?.['sfin-url'] ||
          acc?.org?.domain ||
          'Financial Institution';
        const balanceVal =
          typeof acc?.balance === 'string' || typeof acc?.balance === 'number'
            ? parseFloat(String(acc.balance))
            : NaN;
        const balance = Number.isFinite(balanceVal) ? balanceVal : null;
        const availVal =
          typeof acc?.['available-balance'] === 'string' || typeof acc?.['available-balance'] === 'number'
            ? parseFloat(String(acc['available-balance']))
            : NaN;
        const availableBalance = Number.isFinite(availVal) ? availVal : null;
        const balanceDateEpoch = typeof acc?.['balance-date'] === 'number' ? acc['balance-date'] : null;

        const prev = existingById.get(sfAccId);
        let mappedAccountId: number | null = prev?.strictly_account_id ?? null;

        if (mappedAccountId !== null && !s.accounts.some((a) => a.id === mappedAccountId)) {
          mappedAccountId = null;
        }

        if (mappedAccountId === null) {
          const { name: accountName, type: accountType, institution, last4 } = inferStrictlyAccountDetails(
            orgName,
            String(acc.name || 'Account')
          );
          const match = s.accounts.find(
            (a) => a.name.toLowerCase() === accountName.toLowerCase() && a.source !== 'demo'
          );
          if (match?.id) {
            mappedAccountId = match.id;
          } else {
            const nextAccId = Math.max(0, ...s.accounts.map((a) => a.id || 0)) + 1;
            s.accounts = [
              ...s.accounts,
              {
                id: nextAccId,
                name: accountName,
                type: accountType,
                institution,
                last4,
                currentBalance: balance ?? undefined,
                enabled: true,
                source: 'simplefin',
              },
            ];
            mappedAccountId = nextAccId;
          }
        } else if (balance !== null) {
          s.accounts = s.accounts.map((a) =>
            a.id === mappedAccountId ? { ...a, currentBalance: balance } : a
          );
        }

        let latestTxDate: string | null = prev?.latest_transaction_date ?? null;

        if (mappedAccountId !== null) {
          accountsSynced += 1;
          const strictAcc = s.accounts.find((a) => a.id === mappedAccountId);
          const accountType = strictAcc?.type;
          const txList: any[] = Array.isArray(acc?.transactions) ? acc.transactions : [];

          for (const tx of txList) {
            const amountNum = parseFloat(String(tx?.amount ?? '0'));
            if (!Number.isFinite(amountNum)) continue;

            const dateStr = resolveSimpleFinDate(tx?.posted, tx?.transacted_at);
            if (!latestTxDate || dateStr > latestTxDate) {
              latestTxDate = dateStr;
            }

            const rawDesc = String(tx?.description || tx?.payee || '').trim();
            const rawMemo = String(tx?.memo || '').trim();
            const description =
              rawMemo && !rawDesc.toLowerCase().includes(rawMemo.toLowerCase())
                ? `${rawDesc} ${rawMemo}`.trim()
                : rawDesc || 'SimpleFIN Transaction';

            const dedupKey = `simplefin_${sfAccId}_${tx.id}`;
            if (existingKeys.has(dedupKey)) {
              continue;
            }
            existingKeys.add(dedupKey);

            const merchantKey = extractMerchantKey(description);
            let category = categorize(description, merchantKey, undefined, ctx);
            if (category === 'Uncategorized') {
              const inferred = inferTypeCategory(amountNum, 'simplefin', undefined, accountType, description);
              if (inferred) category = inferred;
            }
            const isRecurring = RECURRING_CATEGORIES.has(category);

            newTransactions.push({
              id: nextTxId++,
              accountId: mappedAccountId,
              date: dateStr,
              description,
              amount: Math.round(amountNum * 100) / 100,
              category,
              source: 'simplefin',
              merchantKey,
              userOverridden: false,
              dedupKey,
              recurrence: isRecurring ? 'recurring' : 'onetime',
              isPending: Boolean(tx?.pending || !tx?.posted || tx?.posted === 0),
            });
            transactionsInserted += 1;
          }
        }

        updatedSfAccounts.push({
          id: prev?.id || nextSfRowId++,
          account_id: sfAccId,
          org_name: String(orgName),
          name: String(acc.name || 'Account'),
          currency: String(acc.currency || 'USD'),
          balance,
          available_balance: availableBalance,
          balance_date: balanceDateEpoch,
          strictly_account_id: mappedAccountId,
          latest_transaction_date: latestTxDate,
        });
      }

      if (newTransactions.length > 0 || updatedSfAccounts.length > 0) {
        // Automatically disable demo mode once real SimpleFIN accounts/transactions are synced
        s.settings = s.settings.filter((x) => x.key !== 'demoMode');
        s.settings.push({ key: 'demoMode', value: false });
        s.accounts = s.accounts.filter((a) => a.source !== 'demo');
        s.transactions = [...newTransactions, ...s.transactions.filter((t) => t.source !== 'demo')].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      }

      s.simplefinAccounts = updatedSfAccounts;
      const syncedAt = new Date().toISOString();
      saveSimpleFinConfigToState(s, {
        ...cfg,
        last_synced_at: syncedAt,
      });

      const response: SimpleFinSyncResponse = {
        added: transactionsInserted,
        accounts_synced: accountsSynced,
        last_synced_at: syncedAt,
        sync_start_date: syncStartDateStr,
        warnings,
        accounts: updatedSfAccounts,
      };
      return response;
    }
    case 'plugin:event|listen':
      return 1;
    case 'plugin:event|unlisten':
      return null;
    default:
      return [];
  }
}
