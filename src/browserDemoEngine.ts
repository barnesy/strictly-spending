import type { Account, Budget, Category, CategoryRule, CsvMapping, ImportBatch, Loan, MerchantOverride, RecurrenceInfo, SortCard, Transaction } from './types';
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

const DEMO_SEED_BUDGET_AMOUNTS: Record<string, number> = {
  Mortgage: 2150,
  Housing: 1950,
  'Auto Loan': 389,
  'Student Loans': 450,
  Insurance: 145,
  Utilities: 225,
  Subscriptions: 95,
  Groceries: 550,
  'Restaurants & Coffee': 280,
  Transportation: 160,
  Shopping: 300,
  Health: 100,
  Entertainment: 80,
  'Personal Care': 75,
};

const DEMO_SEED_LOAN_MERCHANTS = new Set(['homemortgage', 'autofinance', 'studentloan']);

function hasConnectedRealSources(s: BrowserDemoState): boolean {
  const savedSf = s.settings.find((x) => x.key === 'simplefin_config')?.value as SimpleFinConfig | undefined;
  if (savedSf && typeof savedSf.access_url === 'string' && savedSf.access_url.trim().length > 0) return true;
  if (s.simplefinAccounts.length > 0) return true;
  if (s.accounts.some((a) => a.source !== 'demo')) return true;
  if (s.transactions.some((t) => t.source !== 'demo')) return true;
  if (s.imports.length > 0) return true;
  return false;
}

function inferOrgNameFromAccount(
  _sfAccountId?: string | null,
  rawName?: string | null,
  rawOrg?: string | null
): string {
  const trimmedOrg = (rawOrg || '').trim();
  if (trimmedOrg && trimmedOrg !== 'Bank' && trimmedOrg !== 'Financial Institution') {
    return trimmedOrg;
  }

  const n = (rawName || '').trim();
  if (/rocket\s*mortgage/i.test(n)) return 'Rocket Mortgage';
  if (/\b(19|20)\d{2}\s+tesla|model\s*[3ysx]|santander/i.test(n)) return 'Santander Consumer';
  if (/adv\s*plus\s*banking|customized\s*cash\s*rewards|bank\s*of\s*america/i.test(n)) return 'Bank of America';
  if (/truist/i.test(n)) return 'Truist';
  if (
    /401\(k\)|roth\s*ira|traditional\s*ira|restricted\s*stock\s*units|employee\s*stock\s*purchase|individual\s*-\s*tod|health\s*savings\s*account|cash\s*management|fidelity/i.test(
      n
    )
  ) {
    return 'Fidelity Investments';
  }
  if (/robinhood/i.test(n)) return 'Robinhood';
  return trimmedOrg || 'Bank';
}

function stripGenericInstitutionPrefix(name: string): string {
  return name.replace(/^(financial\s+institution|bank)\s+/i, '').trim();
}

function syncConnectedAccountsAndLoans(s: BrowserDemoState): boolean {
  let changed = false;

  // 1a. Repair SimpleFIN account records and ensure each has a mapped Strictly account
  if (s.simplefinAccounts.length > 0) {
    s.simplefinAccounts = s.simplefinAccounts.map((sfAcc) => {
      const cleanRawName = stripGenericInstitutionPrefix(sfAcc.name || 'Account');
      const resolvedOrg = inferOrgNameFromAccount(sfAcc.account_id, cleanRawName, sfAcc.org_name);
      let mappedId = sfAcc.strictly_account_id;
      if (mappedId !== null && !s.accounts.some((a) => a.id === mappedId)) {
        mappedId = null;
      }
      if (mappedId === null) {
        const inferred = inferStrictlyAccountDetails(resolvedOrg, cleanRawName, sfAcc.account_id);
        const existingMatch = s.accounts.find(
          (a) =>
            a.source !== 'demo' &&
            (a.name.toLowerCase() === inferred.name.toLowerCase() ||
              stripGenericInstitutionPrefix(a.name).toLowerCase() === cleanRawName.toLowerCase())
        );
        if (existingMatch?.id) {
          mappedId = existingMatch.id;
        } else {
          const nextId = Math.max(0, ...s.accounts.map((a) => a.id || 0)) + 1;
          s.accounts = [
            ...s.accounts,
            {
              id: nextId,
              name: inferred.name,
              type: inferred.type,
              institution: inferred.institution,
              last4: inferred.last4,
              currentBalance: sfAcc.balance ?? undefined,
              enabled: true,
              source: 'simplefin',
            },
          ];
          mappedId = nextId;
          changed = true;
        }
      }
      if (resolvedOrg !== sfAcc.org_name || cleanRawName !== sfAcc.name || mappedId !== sfAcc.strictly_account_id) {
        changed = true;
        return {
          ...sfAcc,
          org_name: resolvedOrg,
          name: cleanRawName,
          strictly_account_id: mappedId,
        };
      }
      return sfAcc;
    });
  }

  // 1b. Normalize account names, institutions, balances & types for connected non-demo accounts
  const sfByStrictlyId = new Map<number, SimpleFinAccountRecord>();
  for (const sfAcc of s.simplefinAccounts) {
    if (sfAcc.strictly_account_id !== null) {
      sfByStrictlyId.set(sfAcc.strictly_account_id, sfAcc);
    }
  }

  s.accounts = s.accounts.map((acc) => {
    if (acc.source === 'demo') return acc;
    const linkedSf = acc.id !== undefined ? sfByStrictlyId.get(acc.id) : undefined;
    const rawName = stripGenericInstitutionPrefix(linkedSf?.name || acc.name || 'Account');
    const resolvedOrg = inferOrgNameFromAccount(
      linkedSf?.account_id,
      rawName,
      linkedSf?.org_name && linkedSf.org_name !== 'Financial Institution' ? linkedSf.org_name : acc.institution
    );
    const inferred = inferStrictlyAccountDetails(resolvedOrg, rawName, linkedSf?.account_id);
    const nextType =
      acc.type === 'checking' && inferred.type !== 'checking' ? inferred.type : acc.type;
    const nextInstitution =
      !acc.institution || acc.institution === 'Financial Institution' || acc.institution === 'Bank'
        ? inferred.institution
        : acc.institution;
    const nextName = inferred.name;
    const nextLast4 = acc.last4 || inferred.last4;
    const nextBalance =
      acc.currentBalance !== undefined && acc.currentBalance !== null
        ? acc.currentBalance
        : linkedSf?.balance ?? undefined;

    if (
      nextName !== acc.name ||
      nextType !== acc.type ||
      nextInstitution !== acc.institution ||
      nextLast4 !== acc.last4 ||
      nextBalance !== acc.currentBalance
    ) {
      changed = true;
      return {
        ...acc,
        name: nextName,
        type: nextType,
        institution: nextInstitution,
        last4: nextLast4,
        currentBalance: nextBalance,
      };
    }
    return acc;
  });

  // 2. Remove overly broad WITHDRWL/DEPOSIT transfer rules and ensure transactions are properly categorized & have accurate recurrence
  const prevRuleLen = s.rules.length;
  s.rules = s.rules.filter(
    (r) => !(r.category === 'Transfers' && (r.pattern === 'WITHDRWL' || r.pattern === 'DEPOSIT'))
  );
  if (s.rules.length !== prevRuleLen) changed = true;

  const validCats = new Set(s.categories.map((c) => c.name));
  const overrideMap = new Map(s.merchantOverrides.map((o) => [o.merchantKey, o.recurrence]));
  const ctx = { rules: s.rules };
  s.transactions = s.transactions.map((t) => {
    if (t.source === 'demo') return t;
    const lowerDesc = `${t.merchantKey || ''} ${t.description || ''}`.toLowerCase();
    const normLoanMerchant =
      lowerDesc.includes('rocket mortgage') || lowerDesc.includes('rocket mor')
        ? 'rocket mortgage'
        : lowerDesc.includes('santander')
        ? 'santander'
        : null;
    const isMisbucketedLoan =
      !t.userOverridden &&
      (t.category === 'Uncategorized' ||
        t.category === 'Housing' ||
        t.category === 'Transfers') &&
      /rocket\s*mortgage|rocket\s*mor|mortgage|santander|dept\s*of\s*ed|department\s*of\s*education|nelnet|aidvantage|mohela|navient/i.test(
        lowerDesc
      );
    const isFalseWithdrwlTransfer =
      !t.userOverridden &&
      t.category === 'Transfers' &&
      /\b(withdrwl|deposit)\b/i.test(lowerDesc) &&
      !/\b(atm\s+cash\s+withdrawal|atm\s+withdrawal|online\s+transfer|transfer|xfer|wire|zelle|venmo|cash\s+app|autopay|payment\s+thank\s+you|crcardpmt|credit\s+card|mobile\s+pymt|online\s+pmt|bill\s+pay|fidelity|vanguard|schwab|robinhood|coinbase)\b/i.test(
        lowerDesc
      );
    let nextTx = t;
    if (normLoanMerchant && t.merchantKey !== normLoanMerchant) {
      nextTx = { ...nextTx, merchantKey: normLoanMerchant };
      changed = true;
    }
    if (
      (nextTx.category === 'Uncategorized' && !nextTx.userOverridden) ||
      isMisbucketedLoan ||
      isFalseWithdrwlTransfer
    ) {
      const ruleCat = categorize(nextTx.description, nextTx.merchantKey, nextTx.rawCategory, ctx);
      const heurCat = heuristicCategory(lowerDesc, nextTx.amount, validCats);
      const nextCat =
        isMisbucketedLoan && heurCat
          ? heurCat
          : ruleCat !== 'Uncategorized'
          ? ruleCat
          : inferTypeCategory(nextTx.amount, nextTx.source, nextTx.rawCategory, undefined, nextTx.description) ||
            heurCat ||
            (isFalseWithdrwlTransfer ? 'Uncategorized' : nextTx.category);
      if (nextCat && nextCat !== nextTx.category) {
        changed = true;
        nextTx = {
          ...nextTx,
          category: nextCat,
        };
      }
    }
    const mKey = nextTx.merchantKey || extractMerchantKey(nextTx.description);
    const override = overrideMap.get(mKey);
    const hasRecurringOverride =
      override !== undefined &&
      String(override) !== 'none' &&
      String(override) !== 'onetime' &&
      String(override) !== 'irregular';
    const expectedRecurrence: 'recurring' | 'onetime' =
      RECURRING_CATEGORIES.has(nextTx.category) || hasRecurringOverride ? 'recurring' : 'onetime';
    if (nextTx.recurrence !== expectedRecurrence) {
      nextTx = { ...nextTx, recurrence: expectedRecurrence };
      changed = true;
    }
    return nextTx;
  });

  // 3. Auto-create Loan records in s.loans for any connected mortgage or loan account
  const loanAccounts = s.accounts.filter(
    (a) => a.source !== 'demo' && (a.type === 'mortgage' || a.type === 'loan')
  );
  let nextLoanId = Math.max(0, ...s.loans.map((l) => l.id || 0)) + 1;

  for (const acc of loanAccounts) {
    const combined = `${acc.institution || ''} ${acc.name || ''}`.toLowerCase();
    const isMortgage =
      acc.type === 'mortgage' ||
      /mortgage|home\s*loan|rocket|cooper|pennymac|loancare/i.test(combined);
    const isStudent =
      /student|nelnet|aidvantage|mohela|navient|sallie\s*mae|edfinancial|pheaa|fedloan|dept\s*of\s*ed|education/i.test(
        combined
      );
    const loanType: 'house' | 'car' | 'student' = isMortgage
      ? 'house'
      : isStudent
      ? 'student'
      : 'car';
    const category =
      loanType === 'house'
        ? 'Mortgage'
        : loanType === 'student'
        ? 'Student Loans'
        : 'Auto Loan';
    const merchant = combined.includes('rocket')
      ? 'rocket mortgage'
      : combined.includes('santander')
      ? 'santander'
      : (acc.institution || acc.name || '').toLowerCase().trim();

    // Detect typical monthly payment from matching transactions
    const matchingTxns = s.transactions.filter((t) => {
      if (t.source === 'demo' || t.amount >= 0) return false;
      const td = `${t.description} ${t.merchantKey || ''}`.toLowerCase();
      return (
        (merchant && td.includes(merchant)) ||
        t.category === category
      );
    });
    let detectedPayment: number | undefined;
    if (matchingTxns.length > 0) {
      const counts = new Map<number, number>();
      let bestAmt = 0;
      let maxCnt = 0;
      for (const t of matchingTxns) {
        const amt = Math.round(Math.abs(t.amount) * 100) / 100;
        const c = (counts.get(amt) || 0) + 1;
        counts.set(amt, c);
        if (c > maxCnt) {
          maxCnt = c;
          bestAmt = amt;
        }
      }
      if (bestAmt > 0) detectedPayment = bestAmt;
    }

    const rawBalance = Math.abs(acc.currentBalance || 0);
    const existing = s.loans.find((l) => {
      const ln = (l.name || '').toLowerCase();
      const lm = (l.merchant || '').toLowerCase();
      if (ln === acc.name.toLowerCase() || acc.name.toLowerCase().includes(ln) || ln.includes(acc.name.toLowerCase())) {
        return true;
      }
      if (merchant && lm && (lm.includes(merchant) || merchant.includes(lm))) {
        return true;
      }
      if (acc.last4 && ln.includes(acc.last4)) {
        return true;
      }
      return false;
    });

    if (!existing) {
      const newLoan: Loan = {
        id: nextLoanId++,
        name: acc.name,
        type: loanType,
        principal: rawBalance > 0 ? rawBalance : loanType === 'house' ? 300000 : 20000,
        rate: loanType === 'house' ? 6.5 : 5.5,
        termYears: loanType === 'house' ? 30 : loanType === 'student' ? 10 : 5,
        startDate: '2024-01-01',
        category,
        merchant: merchant || undefined,
        monthlyPayment: detectedPayment,
        propertyValue:
          loanType === 'house'
            ? 450000
            : loanType === 'car'
            ? 30000
            : undefined,
        createdAt: new Date().toISOString(),
        enabled: true,
      };
      s.loans = [...s.loans, newLoan];
      changed = true;
    } else {
      let updatedLoan = existing;
      if (existing.name !== acc.name && (existing.name.startsWith('*') || existing.name.startsWith('Financial Institution') || !existing.name.toLowerCase().startsWith((acc.institution || '').toLowerCase()))) {
        updatedLoan = { ...updatedLoan, name: acc.name };
      }
      if (detectedPayment && !existing.monthlyPayment) {
        updatedLoan = { ...updatedLoan, monthlyPayment: detectedPayment };
      }
      if (rawBalance > 0 && (!existing.principal || existing.principal <= 0)) {
        updatedLoan = { ...updatedLoan, principal: rawBalance };
      }
      if (updatedLoan !== existing) {
        s.loans = s.loans.map((l) => (l.id === existing.id ? updatedLoan : l));
        changed = true;
      }
    }
  }

  // 4. Upgrade any non-userOverridden Uncategorized or false-Transfers transactions that match real spend rules/heuristics
  const validCatSet = new Set(s.categories.map((c) => c.name));
  const recurringCatSet = new Set(
    s.categories.filter((c) => c.defaultRecurrence === 'recurring').map((c) => c.name)
  );
  for (let i = 0; i < s.transactions.length; i++) {
    const t = s.transactions[i];
    if (t.source === 'demo' || t.userOverridden) continue;
    if (!t.category || t.category === 'Uncategorized' || (t.category === 'Transfers' && t.amount < 0)) {
      let nextCat = categorize(t.description, t.merchantKey, t.rawCategory, ctx);
      if (nextCat === 'Uncategorized') {
        const inferred =
          inferTypeCategory(t.amount, t.source, t.rawCategory, undefined, t.description) ||
          heuristicCategory(`${t.merchantKey || ''} ${t.description}`, t.amount, validCatSet);
        if (inferred) nextCat = inferred;
      }
      if (nextCat && nextCat !== 'Uncategorized' && nextCat !== t.category) {
        s.transactions[i] = {
          ...t,
          category: nextCat,
          recurrence: t.recurrenceOverride
            ? t.recurrence
            : recurringCatSet.has(nextCat)
            ? 'recurring'
            : 'onetime',
        };
        changed = true;
      }
    }
  }

  // 5. Ensure s.budgets has entries for all spend categories, syncing non-userSet rows from trailing actuals
  const nonDemoSpendTxns = s.transactions.filter((t) => t.source !== 'demo' && t.amount < 0);
  let anchorDate = new Date();
  if (nonDemoSpendTxns.length > 0) {
    let maxDateStr = '';
    for (const t of nonDemoSpendTxns) {
      if (t.date > maxDateStr) maxDateStr = t.date;
    }
    const parsed = new Date(`${maxDateStr}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) anchorDate = parsed;
  }
  const cutoff = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 3, 1).toISOString().slice(0, 10);
  const recentTxns = nonDemoSpendTxns.filter((t) => t.date >= cutoff);
  const activeTxns = recentTxns.length > 0 ? recentTxns : nonDemoSpendTxns;
  const distinctMonths = new Set(activeTxns.map((t) => t.date.slice(0, 7)));
  const divisorMonths = Math.max(1, Math.min(3, distinctMonths.size || 3));
  const spendTotalsByCat = new Map<string, number>();
  for (const t of activeTxns) {
    spendTotalsByCat.set(t.category, (spendTotalsByCat.get(t.category) || 0) + Math.abs(t.amount));
  }
  const existingBudgetsByCat = new Map(s.budgets.map((b) => [b.category, b]));
  for (const cat of s.categories) {
    if (cat.type !== 'spend') continue;
    const avg = Math.round(((spendTotalsByCat.get(cat.name) || 0) / divisorMonths) * 100) / 100;
    const prev = existingBudgetsByCat.get(cat.name);
    if (!prev) {
      s.budgets.push({
        category: cat.name,
        monthlyAmount: avg,
        userSet: false,
      });
      changed = true;
    } else if (!prev.userSet && Math.abs((prev.monthlyAmount || 0) - avg) > 0.01) {
      prev.monthlyAmount = avg;
      changed = true;
    }
  }

  return changed;
}

function purgeDemoDataIfRealSourcesConnected(s: BrowserDemoState): boolean {
  if (!hasConnectedRealSources(s)) return false;

  let changed = false;

  const prevAccLen = s.accounts.length;
  s.accounts = s.accounts.filter((a) => a.source !== 'demo');
  if (s.accounts.length !== prevAccLen) changed = true;

  const prevTxLen = s.transactions.length;
  s.transactions = s.transactions.filter((t) => t.source !== 'demo');
  if (s.transactions.length !== prevTxLen) changed = true;

  const prevLoanLen = s.loans.length;
  s.loans = s.loans.filter((l) => !DEMO_SEED_LOAN_MERCHANTS.has(l.merchant || ''));
  if (s.loans.length !== prevLoanLen) changed = true;

  const prevOverrideLen = s.merchantOverrides.length;
  s.merchantOverrides = s.merchantOverrides.filter((o) => !DEMO_SEED_LOAN_MERCHANTS.has(o.merchantKey));
  if (s.merchantOverrides.length !== prevOverrideLen) changed = true;

  const alreadyPurgedBudgets = s.settings.some((x) => x.key === 'demoPurged' && x.value === true);
  if (!alreadyPurgedBudgets) {
    const prevBudgetLen = s.budgets.length;
    s.budgets = s.budgets.filter((b) => DEMO_SEED_BUDGET_AMOUNTS[b.category] !== b.monthlyAmount);
    if (s.budgets.length !== prevBudgetLen) changed = true;
    s.settings = [...s.settings.filter((x) => x.key !== 'demoPurged'), { key: 'demoPurged', value: true }];
    changed = true;
  }

  const demoSetting = s.settings.find((x) => x.key === 'demoMode');
  if (!demoSetting || demoSetting.value !== false) {
    s.settings = [...s.settings.filter((x) => x.key !== 'demoMode'), { key: 'demoMode', value: false }];
    changed = true;
  }

  if (syncConnectedAccountsAndLoans(s)) {
    changed = true;
  }

  return changed;
}

function ensureInitialized(): BrowserDemoState {
  if (state) return state;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(BROWSER_DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
          const loadedCategories: Category[] =
            Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : [...DEMO_CATEGORIES];
          const loadedRules: CategoryRule[] = Array.isArray(parsed.rules) ? parsed.rules : [];
          const validCats = new Set(loadedCategories.map((c) => c.name));
          const ctx = { rules: loadedRules };
          let upgraded = false;
          const upgradedTxns: Transaction[] = (parsed.transactions as Transaction[]).map((t) => {
            if (t.category === 'Uncategorized' && !t.userOverridden) {
              const nextCat =
                categorize(t.description, t.merchantKey, t.rawCategory, ctx) !== 'Uncategorized'
                  ? categorize(t.description, t.merchantKey, t.rawCategory, ctx)
                  : inferTypeCategory(t.amount, t.source, t.rawCategory, undefined, t.description) ||
                    heuristicCategory(`${t.merchantKey || ''} ${t.description}`, t.amount, validCats);
              if (nextCat && nextCat !== 'Uncategorized') {
                upgraded = true;
                return {
                  ...t,
                  category: nextCat,
                  recurrence: RECURRING_CATEGORIES.has(nextCat) ? 'recurring' : t.recurrence || 'onetime',
                };
              }
            }
            return t;
          });
          state = {
            accounts: parsed.accounts,
            categories: loadedCategories,
            rules: loadedRules,
            transactions: upgradedTxns,
            budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
            loans: Array.isArray(parsed.loans) ? parsed.loans : [],
            scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
            settings: Array.isArray(parsed.settings) ? parsed.settings : [],
            simplefinAccounts: Array.isArray(parsed.simplefinAccounts) ? parsed.simplefinAccounts : [],
            merchantOverrides: Array.isArray(parsed.merchantOverrides) ? parsed.merchantOverrides : [],
            csvMappings: Array.isArray(parsed.csvMappings) ? parsed.csvMappings : [],
            imports: Array.isArray(parsed.imports) ? parsed.imports : [],
          };
          const purged = purgeDemoDataIfRealSourcesConnected(state);
          if (upgraded || purged) persistState();
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

function isAllowedSimpleFinHost(hostAndPath: string): boolean {
  const hostPort = (hostAndPath.split('/')[0] || '').trim();
  const host = (hostPort.split(':')[0] || '').toLowerCase();
  return host === 'simplefin.org' || host.endsWith('.simplefin.org');
}

function redactSimpleFinConfigForUi(cfg: SimpleFinConfig): SimpleFinConfig {
  return {
    ...cfg,
    access_url: cfg.access_url && cfg.access_url.trim().length > 0 ? '[REDACTED]' : '',
  };
}

function parseSimpleFinUrl(rawUrl: string): { username: string; password: string; cleanUrl: string } {
  const trimmed = (rawUrl || '').trim();
  const schemeSplit = trimmed.split('://');
  if (schemeSplit.length !== 2) {
    throw new Error('Invalid SimpleFIN URL format: missing scheme');
  }
  const [scheme, rest] = schemeSplit;
  if (scheme.toLowerCase() !== 'https') {
    throw new Error('Invalid SimpleFIN URL: only https:// is permitted');
  }
  const atIdx = rest.indexOf('@');
  if (atIdx === -1) {
    throw new Error('Invalid SimpleFIN URL format: missing credentials before @');
  }
  const authPart = rest.slice(0, atIdx);
  const hostPart = rest.slice(atIdx + 1);
  if (!isAllowedSimpleFinHost(hostPart)) {
    throw new Error('Invalid SimpleFIN URL host: must be an official simplefin.org domain');
  }
  const colonIdx = authPart.indexOf(':');
  if (colonIdx === -1) {
    throw new Error('Invalid SimpleFIN URL credentials: expected username:password');
  }
  const username = authPart.slice(0, colonIdx);
  const password = authPart.slice(colonIdx + 1);
  const cleanUrl = `https://${hostPart.replace(/\/+$/, '')}`;
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

function inferStrictlyAccountDetails(
  orgName: string | null | undefined,
  accName: string,
  sfAccountId?: string | null
): {
  type: Account['type'];
  institution: string;
  name: string;
  last4?: string;
} {
  const cleanRawName = stripGenericInstitutionPrefix(accName || 'Account');
  const bankName = inferOrgNameFromAccount(sfAccountId, cleanRawName, orgName);
  const lower = `${bankName} ${cleanRawName}`.toLowerCase();
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
    lower.includes('sallie mae') ||
    /\b(19|20)\d{2}\s+(tesla|ford|toyota|honda|chevy|chevrolet|bmw|audi|mercedes|lexus|subaru|hyundai|kia|nissan|jeep|ram|gmc|mazda|volkswagen|vw|volvo|porsche|rivian|lucid)\b/i.test(
      lower
    );
  const isInvestment =
    !isLoan &&
    (lower.includes('ira') ||
      lower.includes('roth') ||
      lower.includes('401k') ||
      lower.includes('401(k)') ||
      lower.includes('hsa') ||
      lower.includes('health savings') ||
      lower.includes('529') ||
      lower.includes('brokerage') ||
      lower.includes('investment') ||
      lower.includes('restricted stock') ||
      lower.includes('stock purchase') ||
      lower.includes('individual - tod') ||
      lower.includes('crypto') ||
      lower.includes('fidelity') ||
      lower.includes('vanguard') ||
      lower.includes('schwab') ||
      lower.includes('robinhood'));
  const isCredit =
    !isLoan &&
    !isInvestment &&
    (lower.includes('credit') ||
      lower.includes('card') ||
      lower.includes('visa') ||
      lower.includes('mastercard') ||
      lower.includes('sapphire') ||
      lower.includes('freedom') ||
      lower.includes('quicksilver') ||
      lower.includes('venture') ||
      lower.includes('savor') ||
      lower.includes('cash rewards') ||
      lower.includes('cash back') ||
      lower.includes('custom cash') ||
      lower.includes('platinum') ||
      lower.includes('bilt'));
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

  const digitsMatch = cleanRawName.match(/(\d{4})\b/);
  const last4 = digitsMatch ? digitsMatch[1] : undefined;
  const rawTrimmed = cleanRawName.trim();
  const hasRealBank = bankName && bankName !== 'Bank' && bankName !== 'Financial Institution';
  const cleanName = !rawTrimmed
    ? `${hasRealBank ? bankName : 'Bank'} Account`
    : hasRealBank && !rawTrimmed.toLowerCase().startsWith(bankName.toLowerCase())
    ? `${bankName} ${rawTrimmed}`
    : rawTrimmed;

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
  const existingCfg = getSavedSimpleFinConfig(s);
  const resolvedCfg: SimpleFinConfig = {
    ...cfg,
    access_url: cfg.access_url === '[REDACTED]' ? existingCfg.access_url : cfg.access_url,
  };
  const existing = s.settings.find((x) => x.key === 'simplefin_config');
  if (existing) existing.value = resolvedCfg;
  else s.settings.push({ key: 'simplefin_config', value: resolvedCfg });
  purgeDemoDataIfRealSourcesConnected(s);
  persistState();
}

const KNOWN_BRANDS = [
  'rocket mortgage', 'santander', 'department of education', 'dept of ed',
  'the home depot', 'home depot', 'the ups store', 'ups store',
  'racetrac', 'chevron', 'quiktrip', 'circle k', 'citgo', 'shell',
  'dunkin', 'xero', 'amc', 'starbucks', 'walmart', 'target',
  'publix', 'kroger', 'trader joe', 'whole foods', 'mcdonald',
  'chick fil a', 'waffle house', 'marathon', 'valero', 'exxon',
  'speedway', 'costco', 'sams club', 'apple', 'google', 'amazon',
  'netflix', 'spotify', 'hulu', 'disney', 'uber', 'lyft',
  'cvs', 'walgreens', 'zelle', 'venmo', 'paypal', 'robinhood',
  'coinbase', 'fidelity', 'vanguard', 'schwab', 'wealthfront', 'betterment',
  'ally', 'sofi', 'marcus', 'truist', 'chase', 'amex', 'citi', 'discover',
  'capital one', 'wells fargo', 'gusto', 'adp', 'workday', 'paychex', 'rippling',
];

const NOISE_WORDS = new Set([
  'trn', 'id', 'des', 'indn', 'co', 'ref', 'conf', 'confirmation',
  'date', 'time', 'et', 'est', 'edt', 'pmt', 'ach', 'pos', 'ppd',
  'web', 'tel', 'seq', 'orig', 'bnf', 'srf', 'mobile', 'purchase',
  'debit', 'card', 'withdrwl', 'withdrawal', 'recurring', 'online',
  'banking', 'from', 'to', 'chk', 'sav', 'acct', 'account', 'type',
  'al', 'ak', 'az', 'ar', 'ca', 'ct', 'de', 'fl', 'ga', 'hi', 'il',
  'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms',
  'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh',
  'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va',
  'wa', 'wv', 'wi', 'wy',
]);

function normalizeSortMerchantKey(rawKey: string, description: string): string {
  const source = rawKey.trim() || description;
  const cleaned = source.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const padded = ` ${cleaned} `;
  for (const brand of KNOWN_BRANDS) {
    if (padded.includes(` ${brand} `)) {
      return brand;
    }
  }
  const words = cleaned
    .split(/\s+/)
    .filter((w) => {
      if (w.length < 2) return false;
      if (/^x+$/.test(w) || w.startsWith('xx')) return false;
      if (/\d/.test(w)) return false;
      return !NOISE_WORDS.has(w);
    });
  if (words.length > 0) {
    return words.slice(0, 3).join(' ');
  }
  return rawKey.replace(/_/g, ' ').trim().toLowerCase() || description.trim().toLowerCase();
}

function heuristicCategory(text: string, netSum: number, validCategories: Set<string>): string | null {
  const normalized = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const rawLower = text.toLowerCase();
  const hasAny = (keywords: string[]) =>
    keywords.some((kw) => {
      const cleanKw = kw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!cleanKw) return false;
      if (cleanKw.length <= 4 && !cleanKw.includes(' ')) {
        return normalized.includes(` ${cleanKw} `);
      }
      return normalized.includes(` ${cleanKw} `) || rawLower.includes(kw.toLowerCase());
    });

  const loanRules: Array<[string, string[]]> = [
    ['Mortgage', ['rocket mortgage', 'mortgage', 'mr cooper', 'pennymac', 'loancare', 'freedom mortgage', 'shellpoint', 'flagstar', 'caliber home', 'guild mortgage', 'united wholesale', 'uwm', 'loan depot', 'loandepot', 'cenlar', 'dovenmuehle', 'phh mortgage', 'carrington', 'newrez']],
    ['Auto Loan', ['santander', 'ally auto', 'toyota financial', 'honda financial', 'ford motor credit', 'gm financial', 'hyundai motor', 'nissan motor', 'kia finance', 'vw credit', 'bmw financial', 'mercedes benz financial', 'subaru motors', 'mazda financial', 'carmax auto', 'capital one auto', 'bridgecrest', 'westlake financial', 'auto finance', 'auto loan']],
    ['Student Loans', ['department of education', 'dept of ed', 'nelnet', 'aidvantage', 'mohela', 'navient', 'sallie mae', 'edfinancial', 'fedloan', 'great lakes', 'earnest', 'pheaa', 'student loan', 'studntloan']],
  ];
  for (const [cat, keywords] of loanRules) {
    if (validCategories.has(cat) && hasAny(keywords)) {
      return cat;
    }
  }

  if (
    netSum > 0 &&
    validCategories.has('Income') &&
    hasAny([
      'payroll', 'direct dep', 'salary', 'dividend', 'interest', 'tax refund',
      'irs treas', 'paycheck', 'deposit', 'gusto', 'adp', 'workday', 'paychex',
      'rippling', 'paylocity', 'justworks',
    ])
  ) {
    return 'Income';
  }

  const rules: Array<[string, string[]]> = [
    ['Groceries', ['publix', 'kroger', 'whole foods', 'trader joe', 'aldi', 'costco', 'sams club', 'safeway', 'wegmans', 'sprouts', 'instacart', 'food lion', 'piggly wiggly', 'supermarket', 'grocery', 'kelly s market', 'atlanta american food', 'market']],
    ['Restaurants & Coffee', ['starbucks', 'dunkin', 'dutch bros', 'mcdonald', 'chick fil a', 'chipotle', 'panera', 'wendys', 'taco bell', 'burger king', 'subway', 'dominos', 'pizza', 'antico', 'bellwood coffee', 'dancing goats', 'chai pani', 'desi tadka', 'thinkingmantavern', 'the earl', 'firehouse subs', 'raising cane', 'jenchan', 'estoria', 'flat shoals', 'twain', 'cafe', 'coffee', 'bakery', 'grill', 'kitchen', 'bistro', 'tavern', 'restaurant', 'doordash', 'ubereats', 'grubhub', 'waffle house', 'sweetgreen', 'cava', 'shake shack', 'popeyes', 'zaxby', 'bojangles']],
    ['Transportation', ['chevron', 'shell', 'exxon', 'mobil', 'racetrac', 'quiktrip', 'wawa', 'sheetz', 'speedway', 'marathon', 'valero', 'citgo', 'circle k', 'sunoco', 'am pm convenience', 'six star service', 'supercharger', 'tesla supercharger', 'uber', 'lyft', 'laz parking', 'peakparking', 'parking', 'parkmobile', 'peach pass', 'sunpass', 'ezpass', 'toll', 'marta', 'delta', 'united', 'southwest', 'autozone', 'jiffy lube', 'discount tire']],
    ['Utilities', ['georgia power', 'duke energy', 'fpl', 'comcast', 'xfinity', 'att', 'verizon', 't mobile', 'tmobile', 'google fi', 'spectrum', 'cox', 'google fiber', 'electric', 'gas south', 'scana', 'dekalb county', 'sanitation', 'utility', 'water']],
    ['Subscriptions', ['netflix', 'spotify', 'hulu', 'disney', 'icloud', 'youtube', 'openai', 'chatgpt', 'claude', 'anthropic', 'github', 'cursor', 'adobe', 'microsoft', 'dropbox', 'nytimes', 'patreon', 'substack', 'xero', 'quickbooks', 'audible', 'kindle', 'godaddy']],
    ['Shopping', ['amazon', 'amzn', 'target', 'walmart', 'home depot', 'lowes', 'ikea', 'best buy', 'etsy', 'ebay', 'wayfair', 'homegoods', 'tj maxx', 'marshalls', 'ross', 'nordstrom', 'macys', 'kohls', 'old navy', 'dick s sporting', 'depop', 'fleet feet', 'scented cottage', 'nike', 'lululemon', 'chewy', 'petco', 'petsmart', 'ups store', 'fedex', 'usps']],
    ['Health', ['cvs', 'walgreens', 'rite aid', 'pharmacy', 'medical', 'dental', 'dentist', 'doctor', 'clinic', 'hospital', 'urgent care', 'quest diag', 'labcorp', 'optometry', 'vision', 'therapy', 'planet fitness', 'la fitness', 'health unlimit', 'fitness', 'peloton', 'ymca']],
    ['Entertainment', ['amc', 'regal', 'cinemark', 'cinema', 'movie', 'ticketmaster', 'stubhub', 'seatgeek', 'steam', 'playstation', 'xbox', 'nintendo', 'golf', 'bowling', 'museum', 'zoo', 'aquarium']],
    ['Insurance', ['geico', 'state farm', 'progressive', 'allstate', 'usaa', 'liberty mutual', 'farmers', 'homesite', 'insurance']],
    ['Housing', ['rent', 'hoa', 'property mgmt', 'apartments']],
    ['Taxes', ['internal revenue', 'dept of rev', 'property tax', 'county tax']],
    ['Fees & Interest', ['overdraft', 'late charge', 'interest charge', 'service charge', 'wire fee', 'atm fee', 'annual fee', 'maintenance fee']],
  ];

  for (const [cat, keywords] of rules) {
    if (validCategories.has(cat) && hasAny(keywords)) {
      return cat;
    }
  }

  if (
    validCategories.has('Transfers') &&
    hasAny([
      'wire', 'xfer', 'transfer', 'zelle', 'venmo', 'cash app', 'robinhood',
      'coinbase', 'fidelity', 'vanguard', 'schwab', 'wealthfront', 'betterment',
      'credit card pmt', 'crcardpmt', 'epayment', 'mobile pymt',
      'payment thank you', 'online transfer',
    ])
  ) {
    return 'Transfers';
  }

  return null;
}

function filterTransactions(txns: Transaction[], filters: Record<string, any> = {}): Transaction[] {
  const s = ensureInitialized();
  const incomeCats = new Set(s.categories.filter((c) => c.type === 'income').map((c) => c.name));
  const transferCats = new Set(s.categories.filter((c) => c.type === 'transfer').map((c) => c.name));
  const disabledSet = new Set<string>(filters.disabledCategories || []);
  const validAccountIds = new Set(
    s.accounts.map((a) => a.id).filter((id): id is number => id !== undefined)
  );
  const validEnabledIds = Array.isArray(filters.enabledAccountIds)
    ? filters.enabledAccountIds.filter((id: number) => validAccountIds.has(id))
    : [];
  const enabledAccSet = validEnabledIds.length > 0 ? new Set<number>(validEnabledIds) : null;

  const realConnected = hasConnectedRealSources(s);
  const hasNonDemoTxns = s.transactions.some((t) => t.source !== 'demo');
  const explicitDemoMode = typeof filters.demoMode === 'boolean' ? filters.demoMode : undefined;

  return txns.filter((t) => {
    if (realConnected) {
      if (t.source === 'demo') return false;
    } else if (explicitDemoMode === true) {
      if (t.source !== 'demo') return false;
    } else if (explicitDemoMode === false && hasNonDemoTxns) {
      if (t.source === 'demo') return false;
    }

    if (filters.startDate && t.date < filters.startDate) return false;
    if (filters.endDate && t.date > filters.endDate) return false;
    if (enabledAccSet && !enabledAccSet.has(t.accountId)) return false;
    if (disabledSet.has(t.category)) return false;
    if (filters.category && t.category !== filters.category) return false;
    if (filters.merchantKey) {
      const target = String(filters.merchantKey).toLowerCase().trim();
      const mk = (t.merchantKey || '').toLowerCase().trim();
      const normMk = normalizeSortMerchantKey(mk, t.description);
      const descLower = t.description.toLowerCase();
      if (mk !== target && normMk !== target && !mk.includes(target) && !descLower.includes(target)) {
        return false;
      }
    }

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
    case 'get_accounts': {
      if (hasConnectedRealSources(s) && syncConnectedAccountsAndLoans(s)) {
        persistState();
      }
      return s.accounts;
    }
    case 'add_account': {
      const nextId = Math.max(0, ...s.accounts.map((a) => a.id || 0)) + 1;
      const item: Account = { ...args.item, id: nextId, source: args.item?.source || 'custom' };
      s.accounts = [...s.accounts, item];
      if (item.source !== 'demo') {
        purgeDemoDataIfRealSourcesConnected(s);
      }
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
      if (hasConnectedRealSources(s) && syncConnectedAccountsAndLoans(s)) {
        persistState();
      }
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
      for (const item of args.budgets || args.items || []) {
        await handleBrowserDemoIpc('put_budget', { item });
      }
      persistState();
      return null;
    }
    case 'clear_budgets': {
      s.budgets = [];
      persistState();
      return null;
    }
    case 'get_loans': {
      if (hasConnectedRealSources(s) && syncConnectedAccountsAndLoans(s)) {
        persistState();
      }
      return s.loans;
    }
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
      if (item.source !== 'demo') {
        purgeDemoDataIfRealSourcesConnected(s);
      }
      persistState();
      return nextId;
    }
    case 'bulk_add_transactions': {
      const items: Omit<Transaction, 'id'>[] = args.transactions || args.items || [];
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
        s.transactions = [...added, ...s.transactions].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
        if (added.some((t) => t.source !== 'demo')) {
          purgeDemoDataIfRealSourcesConnected(s);
        }
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
      if (Array.isArray(args.transactions)) {
        for (const tx of args.transactions) {
          if (tx && typeof tx.id === 'number') {
            updateMap.set(tx.id, tx);
          }
        }
      }
      if (Array.isArray(args.updates)) {
        for (const u of args.updates) {
          if (u && typeof u.id === 'number') {
            updateMap.set(u.id, u.updates || u);
          }
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
      const validCats = new Set(s.categories.map((c) => c.name));
      const visible = filterTransactions(s.transactions, { demoMode: args.demoMode });
      const uncategorized = visible.filter((t) => t.category === 'Uncategorized');

      const historicalCategories = new Map<string, string>();
      for (const t of visible) {
        if (t.category && t.category !== 'Uncategorized') {
          if (t.merchantKey && !historicalCategories.has(t.merchantKey)) {
            historicalCategories.set(t.merchantKey, t.category);
          }
          const stem = normalizeSortMerchantKey(t.merchantKey || '', t.description);
          if (stem && !historicalCategories.has(stem)) {
            historicalCategories.set(stem, t.category);
          }
        }
      }

      const byKey = new Map<string, Transaction[]>();
      for (const t of uncategorized) {
        const k = normalizeSortMerchantKey(t.merchantKey || '', t.description);
        const arr = byKey.get(k) || [];
        arr.push(t);
        byKey.set(k, arr);
      }

      const ctx = { rules: s.rules };
      const cards: SortCard[] = [];

      for (const [merchantKey, txns] of byKey.entries()) {
        if (txns.length === 0) continue;
        const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
        const sampleTxns = sorted.slice(0, 10);
        const totalAbs = Math.round(sorted.reduce((sum, t) => sum + Math.abs(t.amount), 0) * 100) / 100;
        const netSum = sorted.reduce((sum, t) => sum + t.amount, 0);
        const amountSign: 'spend' | 'income' = netSum >= 0 ? 'income' : 'spend';

        const first = sorted[0];
        let suggestedCategory: string | null = null;
        const ruleCat = categorize(first.description, first.merchantKey, first.rawCategory, ctx);
        if (ruleCat && ruleCat !== 'Uncategorized' && validCats.has(ruleCat)) {
          suggestedCategory = ruleCat;
        }
        if (!suggestedCategory) {
          const inferred = inferTypeCategory(first.amount, first.source, first.rawCategory, undefined, first.description);
          if (inferred && validCats.has(inferred)) {
            suggestedCategory = inferred;
          }
        }
        if (!suggestedCategory) {
          suggestedCategory =
            historicalCategories.get(merchantKey) ||
            sorted.map((t) => historicalCategories.get(t.merchantKey)).find(Boolean) ||
            heuristicCategory(`${merchantKey} ${first.description}`, netSum, validCats);
        }

        cards.push({
          merchantKey,
          txns: sorted,
          totalAbs,
          sampleTxns,
          suggestedCategory: suggestedCategory ?? null,
          amountSign,
        });
      }

      return cards.sort((a, b) => b.totalAbs - a.totalAbs);
    }
    case 'mine_rule_suggestions': {
      const visible = filterTransactions(s.transactions, { demoMode: args.demoMode });
      const counts = new Map<string, { pattern: string; category: string; count: number; sampleDescription: string }>();
      for (const t of visible) {
        if (!t.userOverridden || !t.merchantKey || t.category === 'Uncategorized') continue;
        const key = `${t.merchantKey}:::${t.category}`;
        const cur = counts.get(key) || {
          pattern: t.merchantKey,
          category: t.category,
          count: 0,
          sampleDescription: t.description,
        };
        cur.count += 1;
        counts.set(key, cur);
      }
      const existingPatterns = new Set(s.rules.map((r) => r.pattern.toLowerCase()));
      return Array.from(counts.values())
        .filter((c) => c.count >= 2 && !existingPatterns.has(c.pattern.toLowerCase()))
        .sort((a, b) => b.count - a.count)
        .map((c) => ({
          pattern: c.pattern,
          category: c.category,
          overridesCount: c.count,
          sampleDescription: c.sampleDescription,
        }));
    }
    case 'refresh_recurrence_all': {
      const overrideMap = new Map(s.merchantOverrides.map((o) => [o.merchantKey, o.recurrence]));
      const recurringMerchants = new Set<string>();
      for (const [k, override] of overrideMap.entries()) {
        if (override && String(override) !== 'none' && String(override) !== 'onetime' && String(override) !== 'irregular') {
          recurringMerchants.add(k);
        }
      }
      let updated = 0;
      s.transactions = s.transactions.map((t) => {
        const k = t.merchantKey || extractMerchantKey(t.description);
        const isRecCat = RECURRING_CATEGORIES.has(t.category);
        const nextRec: 'recurring' | 'onetime' =
          isRecCat || recurringMerchants.has(k) || (!hasConnectedRealSources(s) && /fitness|gym/i.test(t.description))
            ? 'recurring'
            : 'onetime';
        if (t.recurrence !== nextRec) {
          updated += 1;
          return { ...t, recurrence: nextRec };
        }
        return t;
      });
      if (updated > 0) persistState();
      return { updated };
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
      const recurring = filtered.filter(
        (t) =>
          t.recurrence === 'recurring' &&
          t.amount < 0 &&
          RECURRING_CATEGORIES.has(t.category)
      );
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
      const accountFilter = args.accountId ? { enabledAccountIds: [args.accountId] } : {};
      const allSpend = filterTransactions(s.transactions, {
        ...(args.filters || {}),
        ...accountFilter,
        spendOnly: true,
      }).filter((t) => t.amount < 0);
      let anchorDate = new Date();
      if (allSpend.length > 0) {
        let maxDateStr = '';
        for (const t of allSpend) {
          if (t.date > maxDateStr) maxDateStr = t.date;
        }
        const parsed = new Date(`${maxDateStr}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) anchorDate = parsed;
      }
      const cutoff = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - months, 1).toISOString().slice(0, 10);
      const recentFiltered = allSpend.filter((t) => t.date >= cutoff);
      const recent = recentFiltered.length > 0 ? recentFiltered : allSpend;
      const distinctMonths = new Set(recent.map((t) => t.date.slice(0, 7)));
      const divisor = Math.max(1, Math.min(months, distinctMonths.size || months));
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
        average: Math.round((v.total / divisor) * 100) / 100,
        trailingMonthlyAvg: Math.round(v.total / divisor),
        recurringMonthlyAvg: Math.round(v.recurring / divisor),
        variableMonthlyAvg: Math.round(v.variable / divisor),
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
        counts[r.id] = visible.filter((t) => t.description.toLowerCase().includes(pat) || (t.merchantKey || '').toLowerCase().includes(pat)).length;
      }
      return counts;
    }
    case 'get_merchant_groups': {
      const groups = new Map<string, {
        merchantKey: string;
        totalSpend: number;
        totalTransactions: number;
        categories: Record<string, number>;
        mostCommonCategory: string;
        earliestDate: string;
        latestDate: string;
      }>();
      for (const t of filterTransactions(s.transactions, { demoMode: args.demoMode })) {
        const key = t.merchantKey || extractMerchantKey(t.description) || 'Unknown';
        const g = groups.get(key) || {
          merchantKey: key,
          totalSpend: 0,
          totalTransactions: 0,
          categories: {},
          mostCommonCategory: t.category || 'Uncategorized',
          earliestDate: t.date,
          latestDate: t.date,
        };
        g.totalTransactions += 1;
        if (t.amount < 0) {
          g.totalSpend = Math.round((g.totalSpend + Math.abs(t.amount)) * 100) / 100;
        }
        g.categories[t.category] = (g.categories[t.category] || 0) + 1;
        if (t.date < g.earliestDate) g.earliestDate = t.date;
        if (t.date > g.latestDate) g.latestDate = t.date;
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        let maxCount = -1;
        let bestCat = 'Uncategorized';
        for (const [cat, cnt] of Object.entries(g.categories)) {
          if (cnt > maxCount) {
            maxCount = cnt;
            bestCat = cat;
          }
        }
        g.mostCommonCategory = bestCat;
      }
      return Array.from(groups.values());
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
      const targetCat = String(args.category || '');
      if (!pat) return { totalMatches: 0, affectedCount: 0, sampleTransactions: [] };
      const matches = filterTransactions(s.transactions, { demoMode: args.demoMode }).filter(
        (t) => t.description.toLowerCase().includes(pat) || (t.merchantKey || '').toLowerCase().includes(pat)
      );
      const affectedCount = matches.filter((t) => t.category !== targetCat).length;
      return {
        totalMatches: matches.length,
        affectedCount,
        sampleTransactions: matches.slice(0, 5),
      };
    }
    case 'recategorize_all': {
      let updatedCount = 0;
      const ctx = { rules: s.rules };
      const userRulesCtx = { rules: s.rules.filter((r) => (r.priority || 0) >= 1000) };
      const validCats = new Set(s.categories.map((c) => c.name));
      const recurringCats = new Set(
        s.categories.filter((c) => c.defaultRecurrence === 'recurring').map((c) => c.name)
      );
      s.transactions = s.transactions.map((t) => {
        if (t.userOverridden) {
          if (!args.forceUserRules) return t;
          const userRuleMatch = categorize(t.description, t.merchantKey, t.rawCategory, userRulesCtx);
          if (userRuleMatch !== 'Uncategorized' && userRuleMatch !== t.category) {
            updatedCount += 1;
            return {
              ...t,
              category: userRuleMatch,
              recurrence: t.recurrenceOverride
                ? t.recurrence
                : recurringCats.has(userRuleMatch)
                ? 'recurring'
                : 'onetime',
            };
          }
          return t;
        }
        let nextCat = categorize(t.description, t.merchantKey, t.rawCategory, ctx);
        if (nextCat === 'Uncategorized') {
          const inferred =
            inferTypeCategory(t.amount, t.source, t.rawCategory, undefined, t.description) ||
            heuristicCategory(`${t.merchantKey || ''} ${t.description}`, t.amount, validCats);
          if (inferred) nextCat = inferred;
        }
        // Never downgrade an already-categorized transaction to Uncategorized
        if (nextCat === 'Uncategorized' && t.category && t.category !== 'Uncategorized') {
          return t;
        }
        if (nextCat !== t.category) {
          updatedCount += 1;
          return {
            ...t,
            category: nextCat,
            recurrence: t.recurrenceOverride
              ? t.recurrence
              : recurringCats.has(nextCat)
              ? 'recurring'
              : 'onetime',
          };
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
    case 'delete_merchant_override': {
      const key = String(args.merchantKey || '');
      if (key) {
        s.merchantOverrides = s.merchantOverrides.filter((x) => x.merchantKey !== key);
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
      purgeDemoDataIfRealSourcesConnected(s);
      persistState();
      return nextId;
    }
    case 'clear_imports': {
      s.imports = [];
      persistState();
      return null;
    }
    case 'get_settings':
      return s.settings.filter((x) => x.key !== 'simplefin_config');
    case 'get_setting':
      if (args.key === 'simplefin_config') return null;
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
    case 'get_mcp_server_info': {
      const executablePath = 'strictly-spending';
      const dbPath = '%APPDATA%\\com.strictlyspending.finance\\spending-viz.sqlite';
      const configObj = {
        mcpServers: {
          'strictly-spending': {
            command: executablePath,
            args: ['--mcp', '--db-path', dbPath],
          },
        },
      };
      return {
        executablePath,
        dbPath,
        configJson: JSON.stringify(configObj, null, 2),
        localUrls: ['http://localhost:5173'],
      };
    }
    case 'simplefin_get_config': {
      return redactSimpleFinConfigForUi(getSavedSimpleFinConfig(s));
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
      if (trimmed.startsWith('https://') && trimmed.includes('@')) {
        const cleaned = trimmed.replace(/\/+$/, '');
        parseSimpleFinUrl(cleaned);
        const cfg: SimpleFinConfig = {
          access_url: cleaned,
          claimed_at: new Date().toISOString(),
          last_synced_at: null,
        };
        saveSimpleFinConfigToState(s, cfg);
        return redactSimpleFinConfigForUi(cfg);
      }

      let claimUrl = '';
      try {
        claimUrl = atob(trimmed).trim();
      } catch {
        throw new Error('Invalid SimpleFIN Setup Token (not valid Base64).');
      }

      if (!claimUrl.startsWith('https://')) {
        throw new Error('Decoded SimpleFIN Setup Token must be an https:// URL.');
      }
      const claimHostPart = claimUrl.slice('https://'.length);
      if (!isAllowedSimpleFinHost(claimHostPart)) {
        throw new Error('Decoded SimpleFIN Setup Token host must be an official simplefin.org domain.');
      }

      // Simple POST with no custom headers avoids CORS preflight and works directly with beta-bridge.simplefin.org
      const resp = await fetch(claimUrl, { method: 'POST' });
      if (!resp.ok) {
        throw new Error(
          `SimpleFIN token claim failed (HTTP ${resp.status}). Note: Setup tokens are single-use and expire quickly.`
        );
      }
      const accessUrl = (await resp.text()).trim().replace(/\/+$/, '');
      parseSimpleFinUrl(accessUrl);

      const cfg: SimpleFinConfig = {
        access_url: accessUrl,
        claimed_at: new Date().toISOString(),
        last_synced_at: null,
      };
      saveSimpleFinConfigToState(s, cfg);
      return redactSimpleFinConfigForUi(cfg);
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
      const orgMap = new Map<string, string>();
      if (Array.isArray(accountSet?.connections)) {
        for (const c of accountSet.connections) {
          const cid = c?.conn_id || c?.id;
          const cname = c?.org_name || c?.name;
          if (cid && cname) orgMap.set(String(cid), String(cname));
        }
      }
      const rawAccounts: any[] = Array.isArray(accountSet?.accounts) ? accountSet.accounts : [];
      const existingById = new Map(s.simplefinAccounts.map((a) => [a.account_id, a]));
      const results: SimpleFinAccountRecord[] = [];
      let nextSfRowId = Math.max(0, ...s.simplefinAccounts.map((a) => a.id || 0)) + 1;

      for (const acc of rawAccounts) {
        const sfAccId = String(acc.id);
        const rawAccName = stripGenericInstitutionPrefix(String(acc.name || 'Account'));
        const rawOrg =
          acc?.org_name ||
          (acc?.conn_id ? orgMap.get(String(acc.conn_id)) : undefined) ||
          acc?.org?.name ||
          acc?.org?.['sfin-url'] ||
          acc?.org?.domain ||
          undefined;
        const orgName = inferOrgNameFromAccount(sfAccId, rawAccName, rawOrg);
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

        const { name: accountName, type: accountType, institution, last4 } = inferStrictlyAccountDetails(
          orgName,
          rawAccName,
          sfAccId
        );

        if (mappedAccountId === null) {
          const match = s.accounts.find(
            (a) =>
              a.source !== 'demo' &&
              (a.name.toLowerCase() === accountName.toLowerCase() ||
                stripGenericInstitutionPrefix(a.name).toLowerCase() === rawAccName.toLowerCase())
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
        }
        if (mappedAccountId !== null) {
          s.accounts = s.accounts.map((a) =>
            a.id === mappedAccountId
              ? {
                  ...a,
                  name: accountName,
                  type: a.type === 'checking' && accountType !== 'checking' ? accountType : a.type,
                  institution:
                    !a.institution || a.institution === 'Financial Institution' || a.institution === 'Bank'
                      ? institution
                      : a.institution,
                  last4: a.last4 || last4,
                  currentBalance: balance !== null ? balance : a.currentBalance,
                }
              : a
          );
        }

        results.push({
          id: prev?.id || nextSfRowId++,
          account_id: sfAccId,
          org_name: String(orgName),
          name: rawAccName,
          currency: String(acc.currency || 'USD'),
          balance,
          available_balance: availableBalance,
          balance_date: balanceDateEpoch,
          strictly_account_id: mappedAccountId,
          latest_transaction_date: prev?.latest_transaction_date ?? null,
        });
      }

      s.simplefinAccounts = results;
      purgeDemoDataIfRealSourcesConnected(s);
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
      const orgMap = new Map<string, string>();
      if (Array.isArray(accountSet?.connections)) {
        for (const c of accountSet.connections) {
          const cid = c?.conn_id || c?.id;
          const cname = c?.org_name || c?.name;
          if (cid && cname) orgMap.set(String(cid), String(cname));
        }
      }
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
        const rawAccName = stripGenericInstitutionPrefix(String(acc.name || 'Account'));
        const rawOrg =
          acc?.org_name ||
          (acc?.conn_id ? orgMap.get(String(acc.conn_id)) : undefined) ||
          acc?.org?.name ||
          acc?.org?.['sfin-url'] ||
          acc?.org?.domain ||
          undefined;
        const orgName = inferOrgNameFromAccount(sfAccId, rawAccName, rawOrg);
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

        const { name: accountName, type: accountType, institution, last4 } = inferStrictlyAccountDetails(
          orgName,
          rawAccName,
          sfAccId
        );

        if (mappedAccountId === null) {
          const match = s.accounts.find(
            (a) =>
              a.source !== 'demo' &&
              (a.name.toLowerCase() === accountName.toLowerCase() ||
                stripGenericInstitutionPrefix(a.name).toLowerCase() === rawAccName.toLowerCase())
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
        }
        if (mappedAccountId !== null) {
          s.accounts = s.accounts.map((a) =>
            a.id === mappedAccountId
              ? {
                  ...a,
                  name: accountName,
                  type: a.type === 'checking' && accountType !== 'checking' ? accountType : a.type,
                  institution:
                    !a.institution || a.institution === 'Financial Institution' || a.institution === 'Bank'
                      ? institution
                      : a.institution,
                  last4: a.last4 || last4,
                  currentBalance: balance !== null ? balance : a.currentBalance,
                }
              : a
          );
        }

        let latestTxDate: string | null = prev?.latest_transaction_date ?? null;

        if (mappedAccountId !== null) {
          accountsSynced += 1;
          const strictAcc = s.accounts.find((a) => a.id === mappedAccountId);
          const resolvedAccType = strictAcc?.type || accountType;
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

            const rawMerchantKey = extractMerchantKey(description);
            const lowerDesc = `${rawMerchantKey} ${description}`.toLowerCase();
            const merchantKey =
              lowerDesc.includes('rocket mortgage') || lowerDesc.includes('rocket mor')
                ? 'rocket mortgage'
                : lowerDesc.includes('santander')
                ? 'santander'
                : rawMerchantKey;
            const validCats = new Set(s.categories.map((c) => c.name));
            let category = categorize(description, merchantKey, rawMemo || undefined, ctx);
            if (category === 'Uncategorized') {
              const inferred =
                inferTypeCategory(amountNum, 'simplefin', rawMemo || undefined, resolvedAccType, description) ||
                heuristicCategory(`${merchantKey} ${description}`, amountNum, validCats);
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
          name: rawAccName,
          currency: String(acc.currency || 'USD'),
          balance,
          available_balance: availableBalance,
          balance_date: balanceDateEpoch,
          strictly_account_id: mappedAccountId,
          latest_transaction_date: latestTxDate,
        });
      }

      s.simplefinAccounts = updatedSfAccounts;
      if (newTransactions.length > 0) {
        s.transactions = [...newTransactions, ...s.transactions].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      }
      purgeDemoDataIfRealSourcesConnected(s);
      if (newTransactions.length > 0 || updatedSfAccounts.length > 0) {
        await handleBrowserDemoIpc('refresh_recurrence_all');
      }

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
