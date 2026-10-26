import type { Transaction, Account, Category } from '../types';
import type { IncomeStream, IncomeStreamPayment } from '../api/scenarios';

export type IncomeStreamFrequency = 'monthly' | 'biweekly' | 'semimonthly' | 'weekly' | 'custom';

/**
 * Calculates the projected monthly income from a recurring paycheck payment amount
 * according to the pay frequency.
 */
export function calculateMonthlyFromPaycheck(
  paycheckAmount: number,
  frequency: IncomeStreamFrequency = 'biweekly'
): number {
  if (paycheckAmount <= 0) return 0;
  switch (frequency) {
    case 'biweekly':
      // 26 paychecks per year / 12 months = 2.1667 paychecks per month
      return Math.round((paycheckAmount * 26) / 12);
    case 'semimonthly':
      // Exactly 2 paychecks per month (e.g. 1st & 15th, or 15th & end of month)
      return Math.round(paycheckAmount * 2);
    case 'weekly':
      // 52 paychecks per year / 12 months = 4.3333 paychecks per month
      return Math.round((paycheckAmount * 52) / 12);
    case 'monthly':
    case 'custom':
    default:
      return Math.round(paycheckAmount);
  }
}

/**
 * Calculates the implied paycheck payment amount from a target monthly amount.
 */
export function calculatePaycheckFromMonthly(
  monthlyAmount: number,
  frequency: IncomeStreamFrequency = 'biweekly'
): number {
  if (monthlyAmount <= 0) return 0;
  switch (frequency) {
    case 'biweekly':
      return Math.round((monthlyAmount * 12) / 26);
    case 'semimonthly':
      return Math.round(monthlyAmount / 2);
    case 'weekly':
      return Math.round((monthlyAmount * 12) / 52);
    case 'monthly':
    case 'custom':
    default:
      return Math.round(monthlyAmount);
  }
}

/**
 * Updates an income stream when the user selects a specific recent payment as the recurring baseline.
 */
export function applyPaymentSelection(
  stream: IncomeStream,
  paymentId: string | number
): IncomeStream {
  const payment = stream.recentPayments?.find((p) => String(p.id) === String(paymentId));
  if (!payment) return stream;

  const paycheckAmount = payment.amount;
  const monthlyAmount = calculateMonthlyFromPaycheck(paycheckAmount, stream.frequency || 'biweekly');

  return {
    ...stream,
    paycheckAmount,
    monthlyAmount,
    selectedPaymentId: payment.id,
    isOverridden: true,
  };
}

/**
 * Updates an income stream when the user manually overrides the paycheck amount.
 */
export function applyPaycheckOverride(
  stream: IncomeStream,
  overrideAmount: number
): IncomeStream {
  const safeAmount = Math.max(0, overrideAmount);
  const monthlyAmount = calculateMonthlyFromPaycheck(safeAmount, stream.frequency || 'biweekly');

  return {
    ...stream,
    paycheckAmount: safeAmount,
    monthlyAmount,
    selectedPaymentId: 'custom',
    isOverridden: true,
  };
}

/**
 * Updates an income stream when the user manually overrides the monthly recurring amount.
 */
export function applyMonthlyOverride(
  stream: IncomeStream,
  overrideMonthly: number
): IncomeStream {
  const safeAmount = Math.max(0, overrideMonthly);
  const paycheckAmount = calculatePaycheckFromMonthly(safeAmount, stream.frequency || 'biweekly');

  return {
    ...stream,
    monthlyAmount: safeAmount,
    paycheckAmount,
    selectedPaymentId: 'custom',
    isOverridden: true,
  };
}

/**
 * Updates an income stream when the user modifies its pay frequency.
 */
export function applyFrequencyChange(
  stream: IncomeStream,
  newFrequency: IncomeStreamFrequency
): IncomeStream {
  const basePaycheck = stream.paycheckAmount ?? stream.monthlyAmount;
  const newMonthly = calculateMonthlyFromPaycheck(basePaycheck, newFrequency);

  return {
    ...stream,
    frequency: newFrequency,
    monthlyAmount: newMonthly,
    paycheckAmount: basePaycheck,
    isOverridden: true,
  };
}

/**
 * Cleanly extracts an employer or payroll stream name from transaction description or merchantKey.
 */
export function extractStreamName(description: string, merchantKey?: string): string {
  const descLower = description.toLowerCase();
  const merchantLower = (merchantKey || '').toLowerCase();

  if (descLower.includes('accelerant') || merchantLower.includes('accelerant')) {
    return 'Accelerant US Payroll';
  }
  if (descLower.includes('vertex') || merchantLower.includes('vertex')) {
    return 'Vertex Inc Payroll';
  }
  if (descLower.includes('opengov') || merchantLower.includes('opengov')) {
    return 'OpenGov Inc Payroll';
  }
  if (descLower.includes('dividend') || merchantLower.includes('dividend')) {
    return 'Investment Dividends';
  }

  // Common payroll processors (Gusto, ADP, Workday, Paychex, Rippling, Paylocity, Justworks, Deel)
  const processorMatch = description.match(
    /\b(gusto|adp|workday|paychex|rippling|paylocity|justworks|deel)\b(?:\s+(?:pay(?:roll)?|wage(?:s)?|direct\s*dep))?\s*[-:]?\s*([a-z0-9\s&.'-]{2,32})?/i
  );
  if (processorMatch) {
    const processor = processorMatch[1].toUpperCase() === 'ADP'
      ? 'ADP'
      : processorMatch[1].charAt(0).toUpperCase() + processorMatch[1].slice(1).toLowerCase();
    const tail = (processorMatch[2] || '')
      .replace(/\b(?:id|ppd|ccd|sec|trace|ref)\b.*$/i, '')
      .replace(/\b(?:direct\s*dep(?:osit)?|dir\s*dep|payroll|wages?|salary|pay)\b/gi, '')
      .replace(/\b\d{3,}\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (tail.length > 2) {
      const cleanTail = tail
        .split(/[_\s]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      return `${cleanTail} Payroll`;
    }
    return `${processor} Payroll`;
  }

  // Check for ACH payroll / direct deposit formatting:
  // e.g. "COMPANY NAME SE DES:PAYROLL", "COMPANY INC DES:DIRECT DEP", "COMPANY LLC DIRECT DEP"
  const achMatch = description.match(
    /^([^:]+?)(?:\s+se|\s+ppd|\s+ccd)?\s+(?:des:(?:payroll|direct\s*dep|dir\s*dep|salary|wages)|direct\s*dep(?:osit)?|payroll\b)/i
  );
  if (achMatch && achMatch[1]) {
    const rawName = achMatch[1]
      .replace(/^(?:ach\s+(?:credit|deposit)|direct\s+dep(?:osit)?|orig\s+co\s+name)\s*[-:]?\s*/i, '')
      .trim();
    if (rawName.length > 2) {
      return (
        rawName
          .split(/[_\s]+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ') + ' Payroll'
      );
    }
  }

  if (merchantKey && merchantKey.length > 2) {
    return merchantKey
      .split(/[_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  return description.slice(0, 24).trim();
}

/**
 * Detects income streams from transactions, identifying employer payroll streams,
 * recurring intervals (bi-weekly, semi-monthly, monthly, weekly), and defaults
 * the recurring baseline to the latest recurring paycheck payment.
 */
export function detectIncomeStreams(
  txns: Transaction[],
  accounts: Account[] = [],
  categories: Category[] = [],
  referenceDate?: string
): IncomeStream[] {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const maxTxnDate = txns.reduce((max, t) => (t.date > max ? t.date : max), '');
  const refDateStr = referenceDate || maxTxnDate || new Date().toISOString().split('T')[0];
  const refTime = new Date(refDateStr).getTime();

  // Income transactions: category is Income OR positive deposit with payroll indicators
  const incomeTxns = txns.filter((t) => {
    const acc = accountMap.get(t.accountId);
    // Exclude investment, retirement, credit card, loan, and mortgage accounts from paycheck income streams
    if (acc && ['investment', 'credit', 'loan', 'mortgage'].includes(acc.type)) {
      return false;
    }
    if (/\binvestment\s+(sell|buy)\b|\bdividend\s+reinvestment\b/i.test(t.description || '')) {
      return false;
    }

    const cat = categories.find((c) => c.name === t.category);
    const catNameLower = (t.category || '').toLowerCase();
    const isIncomeCat = cat?.type === 'income' || catNameLower.includes('income');
    const isNotTransfer =
      cat?.type !== 'transfer' &&
      !['transfers', 'transfer', 'credit card payment'].includes(catNameLower);
    const isPayrollDesc =
      /payroll|direct\s*dep|dir\s*dep|salary|wages|des:payroll|des:dir|gusto|adp\b|workday|paychex|rippling|paylocity|justworks|deel\b|vertex|accelerant|opengov/i.test(
        t.description
      );

    return (isIncomeCat || (t.amount > 300 && isPayrollDesc)) && isNotTransfer && t.amount > 0;
  });

  // Group by account and stream name
  const groupedStreams = new Map<
    string,
    {
      accountId?: number;
      accountName: string;
      name: string;
      txns: Transaction[];
    }
  >();

  for (const t of incomeTxns) {
    const acc = accountMap.get(t.accountId);
    const streamName = extractStreamName(t.description, t.merchantKey);
    const groupKey = `${t.accountId || 'none'}-${streamName}`;

    if (!groupedStreams.has(groupKey)) {
      groupedStreams.set(groupKey, {
        accountId: t.accountId,
        accountName: acc?.name || 'Bank Account',
        name: streamName,
        txns: [],
      });
    }
    groupedStreams.get(groupKey)!.txns.push(t);
  }

  const streams: IncomeStream[] = [];

  for (const [key, grp] of groupedStreams.entries()) {
    // Sort transactions by date descending (latest first)
    const sortedTxns = [...grp.txns].sort((a, b) => b.date.localeCompare(a.date));

    // Identify candidate paycheck deposits: filter out tiny ancillary items if substantial paychecks exist
    const hasSubstantial = sortedTxns.some((t) => t.amount >= 300);
    const candidateTxns = hasSubstantial
      ? sortedTxns.filter((t) => t.amount >= 200)
      : sortedTxns.filter((t) => t.amount >= 20);

    if (candidateTxns.length === 0) continue;

    const recentPayments: IncomeStreamPayment[] = candidateTxns.slice(0, 10).map((t) => ({
      id: String(t.id ?? `${t.date}-${t.amount}`),
      date: t.date,
      amount: t.amount,
      description: t.description,
    }));

    // Detect frequency from transaction intervals & calendar rules
    let detectedFreq: IncomeStreamFrequency = 'monthly';
    if (candidateTxns.length >= 2) {
      const sortedDatesAsc = [...candidateTxns]
        .map((t) => new Date(t.date).getTime())
        .sort((a, b) => a - b);

      let totalDiffDays = 0;
      for (let i = 1; i < sortedDatesAsc.length; i++) {
        totalDiffDays += (sortedDatesAsc[i] - sortedDatesAsc[i - 1]) / (1000 * 60 * 60 * 24);
      }
      const avgInterval = totalDiffDays / (sortedDatesAsc.length - 1);

      // Check calendar day-of-month & weekday patterns to distinguish semi-monthly (15th & EOM or 1st & 15th) from bi-weekly
      const parsedDates = candidateTxns.map((t) => {
        const [y, m, d] = t.date.split('-').map(Number);
        const weekday = new Date(y, (m || 1) - 1, d || 1).getDay();
        return { day: d || 1, weekday };
      });
      const midMonthHits = parsedDates.filter((p) => p.day >= 13 && p.day <= 16).length;
      const endOrFirstHits = parsedDates.filter((p) => p.day >= 27 || p.day <= 3).length;
      const semiMonthlyBoundaryRatio = (midMonthHits + endOrFirstHits) / parsedDates.length;
      const distinctWeekdays = new Set(parsedDates.map((p) => p.weekday)).size;
      const isSemiMonthlyCalendar =
        midMonthHits >= 1 &&
        endOrFirstHits >= 1 &&
        semiMonthlyBoundaryRatio >= 0.75 &&
        (distinctWeekdays >= 2 || parsedDates.some((p) => p.day >= 28));

      if (avgInterval >= 5 && avgInterval <= 9) {
        detectedFreq = 'weekly';
      } else if (avgInterval >= 10 && avgInterval <= 19) {
        detectedFreq = isSemiMonthlyCalendar ? 'semimonthly' : 'biweekly';
      } else if (avgInterval >= 25 && avgInterval <= 35) {
        detectedFreq = 'monthly';
      } else if (isSemiMonthlyCalendar) {
        detectedFreq = 'semimonthly';
      } else if (/payroll|salary/i.test(grp.name)) {
        detectedFreq = 'biweekly';
      }
    } else if (candidateTxns.length === 1 && /payroll|salary|accelerant/i.test(grp.name)) {
      const d = Number(candidateTxns[0].date.split('-')[2] || 1);
      detectedFreq = d === 15 || d >= 28 ? 'semimonthly' : 'biweekly';
    } else if (/payroll|salary/i.test(grp.name)) {
      detectedFreq = 'biweekly';
    }

    // Default to the LATEST recurring payment as the baseline!
    const latestPayment = recentPayments[0];
    const defaultPaycheckAmount = latestPayment
      ? latestPayment.amount
      : Math.round(candidateTxns.reduce((s, t) => s + t.amount, 0) / candidateTxns.length);

    const monthlyAmount = calculateMonthlyFromPaycheck(defaultPaycheckAmount, detectedFreq);

    // Stale/former employer check: If the latest payment was more than 60 days before the reference date,
    // default enabled to false so old employers (e.g. OpenGov) aren't projected!
    let isFormer = false;
    if (latestPayment?.date) {
      const daysSinceLatest = (refTime - new Date(latestPayment.date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLatest > 60) {
        isFormer = true;
      }
    }

    if (monthlyAmount >= 50) {
      streams.push({
        id: `stream-${key}`,
        name: grp.name,
        accountId: grp.accountId,
        accountName: grp.accountName,
        monthlyAmount,
        paycheckAmount: defaultPaycheckAmount,
        frequency: detectedFreq,
        isTaxed: true, // Actual deposits from employers are post-tax take-home pay
        enabled: !isFormer,
        isFormerEmployer: isFormer,
        lastPaymentDate: latestPayment?.date,
        realMonthlyAmount: monthlyAmount,
        recentPayments,
        selectedPaymentId: latestPayment?.id,
        isOverridden: false,
      });
    }
  }

  return streams;
}

/**
 * Loads baseline financial data from accounts, budgets, categories, loans, and recent transactions,
 * detecting employer income streams and calculating starting cash, investments, and home equity.
 */
export async function loadForecastBaselineData(): Promise<{
  baseline: {
    income: number;
    recurring: number;
    variable: number;
    startingCash: number;
    startingSavings: number;
    startingInvestments: number;
    homePropertyValue: number;
    mortgageBalance: number;
    homeEquity: number;
  };
  destinations: import('../api/scenarios').DestinationAccount[];
  incomeStreams: IncomeStream[];
  accounts: Account[];
}> {
  const { api } = await import('../api');

  const [accounts, budgets, categories, loans] = await Promise.all([
    api.getAccounts(),
    api.getBudgets(),
    api.getCategories(),
    api.getLoans(),
  ]);

  let realCheckingCash = 0;
  let realSavingsTotal = 0;
  let realInvestmentsTotal = 0;
  const initialDestinations: import('../api/scenarios').DestinationAccount[] = [];
  const truist5463Acc = accounts.find(
    (a) => a.type === 'checking' && /\b5463\b/.test(`${a.name || ''} ${a.last4 || ''}`)
  );
  const boa6669Acc = accounts.find(
    (a) => a.type === 'checking' && /\b6669\b/.test(`${a.name || ''} ${a.last4 || ''}`)
  );
  const hasLegacyTruistBoaPair = Boolean(truist5463Acc && boa6669Acc);
  const truistPrimaryKey = truist5463Acc?.id !== undefined ? String(truist5463Acc.id) : 'truist';
  const boaPrimaryKey = boa6669Acc?.id !== undefined ? String(boa6669Acc.id) : 'boa';

  for (const acc of accounts) {
    const bal = acc.currentBalance || 0;
    const isEnabled = acc.enabled !== false;

    if (acc.type === 'checking') {
      if (bal > 0) realCheckingCash += bal;
    } else if (acc.type === 'savings') {
      realSavingsTotal += Math.max(0, bal);
      if (isEnabled) {
        const isLegacyTruistSavings = hasLegacyTruistBoaPair && /truist/i.test(acc.name);
        const displayName =
          isLegacyTruistSavings && !/shared/i.test(acc.name) ? 'Truist Shared Savings' : acc.name;
        const effectiveBal = bal > 0 ? bal : isLegacyTruistSavings ? 30000 : Math.max(0, bal);
        initialDestinations.push({
          id: `account-${acc.id ?? acc.name}`,
          accountId: acc.id,
          name: displayName,
          accountType: 'savings',
          currentBalance: effectiveBal,
          realBalance: effectiveBal,
          monthlyAllocation: isLegacyTruistSavings ? 5000 : 0,
          sourceAllocations: isLegacyTruistSavings
            ? { [truistPrimaryKey]: 2000, [boaPrimaryKey]: 3000 }
            : {},
          annualGrowthRate: 4.0,
          enabled: true,
        });
      }
    } else if (acc.type === 'investment') {
      realInvestmentsTotal += Math.max(0, bal);
      const isRoth = acc.name.toUpperCase().includes('ROTH') || acc.name.toUpperCase().includes('IRA');
      if (isEnabled) {
        initialDestinations.push({
          id: `account-${acc.id ?? acc.name}`,
          accountId: acc.id,
          name: acc.name,
          accountType: 'investment',
          isRothIra: isRoth,
          currentBalance: bal,
          realBalance: bal,
          monthlyAllocation: 0,
          sourceAllocations: {},
          annualGrowthRate: isRoth ? 7.5 : 8.0,
          enabled: true,
        });
      }
    }
  }

  // Only seed Truist Shared Savings fallback when the legacy 5463/6669 pair is connected
  if (hasLegacyTruistBoaPair && !initialDestinations.some((d) => d.accountType === 'savings')) {
    initialDestinations.unshift({
      id: 'account-truist-shared-savings',
      name: 'Truist Shared Savings',
      accountType: 'savings',
      currentBalance: 30000,
      realBalance: 30000,
      monthlyAllocation: 5000,
      sourceAllocations: { [truistPrimaryKey]: 2000, [boaPrimaryKey]: 3000 },
      annualGrowthRate: 4.0,
      enabled: true,
    });
  }

  let totalRecurring = 0;
  let totalVariable = 0;
  let budgetIncome = 0;

  for (const b of budgets) {
    const cat = categories.find((c) => c.name === b.category);
    if (cat) {
      if (cat.type === 'income') {
        budgetIncome += b.monthlyAmount;
      } else if (cat.defaultRecurrence === 'recurring') {
        totalRecurring += b.monthlyAmount;
      } else {
        totalVariable += b.monthlyAmount;
      }
    }
  }

  const initialIncomeStreams: IncomeStream[] = [];
  let realMonthlyIncome = budgetIncome;

  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];
    const recentTxns = await api.getTransactions(sixMonthsAgo, todayStr);

    const detected = detectIncomeStreams(recentTxns, accounts, categories);
    initialIncomeStreams.push(...detected);

    if (initialIncomeStreams.length > 0) {
      realMonthlyIncome = initialIncomeStreams
        .filter((s) => s.enabled)
        .reduce((sum, s) => sum + s.monthlyAmount, 0);
    }
  } catch (e) {
    console.warn('Could not compute real income streams:', e);
  }

  if (initialIncomeStreams.length === 0) {
    initialIncomeStreams.push({
      id: 'stream-default',
      name: 'Primary Income',
      monthlyAmount: realMonthlyIncome > 0 ? realMonthlyIncome : 6000,
      paycheckAmount: realMonthlyIncome > 0 ? realMonthlyIncome : 6000,
      frequency: 'monthly',
      isTaxed: true,
      enabled: true,
      realMonthlyAmount: realMonthlyIncome > 0 ? realMonthlyIncome : 6000,
      isOverridden: false,
    });
  }

  const houseLoan = loans.find(
    (l) => l.enabled !== false && (l.type === 'house' || /housing|mortgage/i.test(l.category || ''))
  );
  const mortgageAcc = accounts.find((a) => a.enabled !== false && a.type === 'mortgage');
  const hasRealEstate = Boolean(houseLoan || mortgageAcc);
  const mortgageBal = Math.abs(mortgageAcc?.currentBalance ?? houseLoan?.principal ?? 0);
  const propertyVal = hasRealEstate
    ? (houseLoan?.propertyValue ?? (mortgageBal > 0 ? Math.round(mortgageBal * 1.25) : 500000))
    : 0;
  const equity = hasRealEstate ? Math.max(0, propertyVal - mortgageBal) : 0;

  return {
    baseline: {
      income: realMonthlyIncome > 0 ? realMonthlyIncome : 6000,
      recurring: totalRecurring > 0 ? Math.round(totalRecurring) : 2500,
      variable: totalVariable > 0 ? Math.round(totalVariable) : 2500,
      startingCash: realCheckingCash > 0 ? Math.round(realCheckingCash) : 2500,
      startingSavings: realSavingsTotal,
      startingInvestments: realInvestmentsTotal,
      homePropertyValue: propertyVal,
      mortgageBalance: Math.round(mortgageBal),
      homeEquity: Math.round(equity),
    },
    destinations: initialDestinations,
    incomeStreams: initialIncomeStreams,
    accounts,
  };
}
