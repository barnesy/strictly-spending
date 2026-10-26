import { describe, it, expect } from 'vitest';
import {
  computeCategoryProjections,
  computeIncomeProjections,
  consolidateRecurringMerchants,
  getMerchantBillStatus,
  getStreamPaycheckSchedule,
  normalizeTimelineMerchantKey,
  reconcileMonthTimeline,
} from './forecastSpending';
import type { RecurrenceInfo } from './recurrence';

describe('forecastSpending — bill-aware current-month projections', () => {
  it('identifies whether a recurring merchant has already posted in the target month', () => {
    const recurrenceMap = new Map<string, RecurrenceInfo>([
      [
        'Netflix',
        {
          kind: 'monthly',
          count: 6,
          meanIntervalDays: 30,
          meanAmount: 22.99,
          estMonthlyCost: 22.99,
          lastDate: '2026-10-05',
          source: 'auto',
        },
      ],
      [
        'Electric Co',
        {
          kind: 'monthly',
          count: 6,
          meanIntervalDays: 30,
          meanAmount: 145,
          estMonthlyCost: 145,
          lastDate: '2026-09-24',
          source: 'auto',
        },
      ],
    ]);

    const refDate = new Date(2026, 9, 15); // Oct 15, 2026
    const paidStatus = getMerchantBillStatus('Netflix', '2026-10', recurrenceMap, refDate);
    expect(paidStatus.isPaidThisMonth).toBe(true);
    expect(paidStatus.expectedDay).toBe(5);
    expect(paidStatus.lastPaidShortLabel).toBe('Oct 5');
    expect(paidStatus.countdownText).toBe('Paid Oct 5');

    const unpaidStatus = getMerchantBillStatus('Electric Co', '2026-10', recurrenceMap, refDate);
    expect(unpaidStatus.isPaidThisMonth).toBe(false);
    expect(unpaidStatus.expectedDay).toBe(24);
    expect(unpaidStatus.lastPaidShortLabel).toBe('Sep 24');
    expect(unpaidStatus.expectedShortLabel).toBe('Oct 24');
    expect(unpaidStatus.daysSinceLastPaid).toBe(21);
    expect(unpaidStatus.daysUntilDue).toBe(9);
    expect(unpaidStatus.countdownText).toBe('Due in 9d');
  });

  it('guarantees remaining spend is at least unpaidRecurring even if variable spend already exceeded baseline', () => {
    const recurrenceMap = new Map<string, RecurrenceInfo>([
      [
        'Electric Co',
        {
          kind: 'monthly',
          count: 6,
          meanIntervalDays: 30,
          meanAmount: 150,
          estMonthlyCost: 150,
          lastDate: '2026-09-25',
          source: 'auto',
        },
      ],
      [
        'Water Utility',
        {
          kind: 'monthly',
          count: 6,
          meanIntervalDays: 30,
          meanAmount: 50,
          estMonthlyCost: 50,
          lastDate: '2026-10-03',
          source: 'auto',
        },
      ],
    ]);

    const projections = computeCategoryProjections({
      categories: [{ name: 'Utilities', color: '#4caf50', type: 'spend' } as any],
      budgets: [],
      consolidatedMerchants: [
        {
          merchantKey: 'Electric Co',
          category: 'Utilities',
          monthlyAverage: 150,
          occurrences: 6,
          cadence: 'monthly',
        } as any,
        {
          merchantKey: 'Water Utility',
          category: 'Utilities',
          monthlyAverage: 50,
          occurrences: 6,
          cadence: 'monthly',
        } as any,
      ],
      trailingAverages: [
        {
          category: 'Utilities',
          average: 220, // 200 recurring + 20 variable
        } as any,
      ],
      disabledCategories: [],
      targetMonthKey: '2026-10',
      actualSpendByCategory: new Map([['Utilities', 120]]), // $50 Water Utility + $70 variable spend so far
      recurrenceMap,
    });

    const utilProj = projections.get('Utilities');
    expect(utilProj).toBeDefined();
    expect(utilProj?.paidRecurring).toBe(50);
    expect(utilProj?.unpaidRecurring).toBe(150);
    // Baseline is 220, actualToDate is 120 (naive remaining = 100),
    // but Electric Co ($150) is still unpaid! So remaining must be 150 and total = 270.
    expect(utilProj?.remaining).toBe(150);
    expect(utilProj?.total).toBe(270);
  });
});

describe('forecastSpending — income forecasting & paycheck schedules', () => {
  it('computes bi-weekly paycheck schedule and upcoming paydays within the target month', () => {
    const stream = {
      id: 'stream-1',
      name: 'ACME Payroll',
      accountId: 1,
      accountName: 'BoA Checking',
      monthlyAmount: 6500,
      paycheckAmount: 3000,
      frequency: 'biweekly' as const,
      enabled: true,
      isAutoDetected: true,
      isTaxed: true,
      recentPayments: [
        { date: '2026-10-09', amount: 3000 },
        { date: '2026-09-25', amount: 3000 },
      ],
    };

    const schedule = getStreamPaycheckSchedule(stream, '2026-10');
    expect(schedule.receivedCount).toBe(1);
    expect(schedule.receivedToDate).toBe(3000);
    // 2026-10-09 + 14 days = 2026-10-23
    expect(schedule.upcomingDays).toEqual([23]);
    expect(schedule.nextExpectedDay).toBe(23);
    expect(schedule.expectedCount).toBe(2);
  });

  it('projects current-month receivedToDate, remaining income, and extra deposits', () => {
    const streams = [
      {
        id: 'stream-1',
        name: 'ACME Payroll',
        accountId: 1,
        accountName: 'BoA Checking',
        monthlyAmount: 6000,
        paycheckAmount: 3000,
        frequency: 'biweekly' as const,
        enabled: true,
        isAutoDetected: true,
        isTaxed: true,
        recentPayments: [{ date: '2026-10-09', amount: 3000 }],
      },
    ];

    const currentProjs = computeIncomeProjections({
      incomeStreams: streams,
      targetMonthKey: '2026-10',
      actualIncomeToDate: 3500, // $3000 payroll + $500 extra deposit
    });

    expect(currentProjs).toHaveLength(2);
    const payroll = currentProjs.find((p) => p.id === 'stream-1');
    expect(payroll?.receivedToDate).toBe(3000);
    expect(payroll?.remaining).toBe(3000);
    expect(payroll?.total).toBe(6000);

    const other = currentProjs.find((p) => p.id === 'other-income-actual');
    expect(other?.receivedToDate).toBe(500);
    expect(other?.remaining).toBe(0);
    expect(other?.total).toBe(500);
  });

  it('falls back to seasonal prior-year monthly income when no active streams are configured', () => {
    const historicalMonthlyIncome = new Map<string, number>([['2025-11', 7250]]);
    const futureProjs = computeIncomeProjections({
      incomeStreams: [],
      targetMonthKey: '2026-11',
      historicalMonthlyIncome,
      recentAvgIncome: 6800,
    });

    expect(futureProjs).toHaveLength(1);
    expect(futureProjs[0].basis).toBe('last_year_month');
    expect(futureProjs[0].total).toBe(7250);
  });
});

describe('forecastSpending — educated-guess timeline reconciliation without duplicates', () => {
  it('normalizes bank merchant variations into a canonical key', () => {
    expect(normalizeTimelineMerchantKey('VERIZON WIRELESS 09/14 #84920')).toBe(
      normalizeTimelineMerchantKey('VZWRLSS*APOCC VISB 10/14')
    );
    expect(normalizeTimelineMerchantKey('CHECKCARD 1012 NETFLIX.COM CA')).toBe('netflix');
  });

  it('reconciles actual spend and income against expected bills and paydays without duplicates', () => {
    const recurrenceMap = new Map<string, RecurrenceInfo>([
      [
        'VERIZON WIRELESS 09/14',
        {
          kind: 'monthly',
          count: 5,
          meanIntervalDays: 30,
          meanAmount: 85,
          estMonthlyCost: 85,
          lastDate: '2026-09-14',
          source: 'auto',
        },
      ],
      [
        'DUKE ENERGY BILL',
        {
          kind: 'monthly',
          count: 6,
          meanIntervalDays: 30,
          meanAmount: 140,
          estMonthlyCost: 140,
          lastDate: '2026-09-22',
          source: 'auto',
        },
      ],
    ]);

    const consolidatedMerchants = [
      // Two duplicate variants of Verizon from 60-day window + one Duke Energy bill
      {
        merchantKey: 'VERIZON WIRELESS 09/14',
        category: 'Utilities',
        monthlyAverage: 85,
        avgPeriodDays: 30,
        occurrences: 3,
      } as any,
      {
        merchantKey: 'VZWRLSS*APOCC VISB',
        category: 'Utilities',
        monthlyAverage: 85,
        avgPeriodDays: 30,
        occurrences: 2,
      } as any,
      {
        merchantKey: 'DUKE ENERGY BILL',
        category: 'Utilities',
        monthlyAverage: 140,
        avgPeriodDays: 30,
        occurrences: 6,
      } as any,
    ];

    const transactions = [
      // Actual Verizon charge on Oct 15 under the VZWRLSS description
      {
        id: 101,
        date: '2026-10-15',
        description: 'VZWRLSS*APOCC VISB 10/15',
        category: 'Utilities',
        amount: -86.12,
        accountId: 1,
      } as any,
      // Actual paycheck on Oct 9
      {
        id: 102,
        date: '2026-10-09',
        description: 'ACME CORP DIRECT DEP PAYROLL',
        category: 'Income',
        amount: 3000,
        accountId: 1,
      } as any,
    ];

    const incomeStreams = [
      {
        id: 'stream-acme',
        name: 'ACME CORP',
        accountId: 1,
        accountName: 'Checking',
        monthlyAmount: 6000,
        paycheckAmount: 3000,
        frequency: 'biweekly' as const,
        enabled: true,
        isAutoDetected: true,
        isTaxed: true,
        recentPayments: [
          { date: '2026-10-09', amount: 3000 },
          { date: '2026-09-25', amount: 3000 },
        ],
      },
    ];

    const result = reconcileMonthTimeline({
      monthKey: '2026-10',
      daysInMonth: 31,
      transactions,
      consolidatedMerchants,
      recurrenceMap,
      incomeStreams,
      taxRate: 0,
      disabledCategories: [],
      enabledAccountIds: [],
      isCurrentMonth: true,
      todayDay: 15,
    });

    // 1. Verizon variants were deduplicated into 1 bill, and matched to txn #101!
    expect(result.totalExpectedBillsCount).toBe(2); // Verizon + Duke Energy
    expect(result.reconciledBillsCount).toBe(1); // Verizon filled!
    expect(result.reconciledByTxnId.get(101)).toBeDefined();
    expect(result.reconciledByTxnId.get(101)?.kind).toBe('bill');
    expect(result.reconciledByTxnId.get(101)?.expectedDay).toBe(14);

    // 2. Only Duke Energy remains in upcomingBillsByDay (on day 22) — no duplicate Verizon on day 14/15!
    const allRemainingBills = Array.from(result.upcomingBillsByDay.values()).flat();
    expect(allRemainingBills).toHaveLength(1);
    expect(allRemainingBills[0].canonicalKey).toContain('duke');
    expect(result.upcomingBillsByDay.get(22)).toHaveLength(1);

    // 3. ACME Payroll Oct 9 was matched to txn #102, and Oct 23 remains as upcoming income!
    expect(result.totalExpectedPaydaysCount).toBe(2);
    expect(result.reconciledPaydaysCount).toBe(1);
    expect(result.reconciledByTxnId.get(102)).toBeDefined();
    expect(result.reconciledByTxnId.get(102)?.kind).toBe('income');
    const allRemainingIncome = Array.from(result.upcomingIncomeByDay.values()).flat();
    expect(allRemainingIncome).toHaveLength(1);
    expect(allRemainingIncome[0].expectedDay).toBe(23);

    // 4. allExpectedBills and allExpectedBillsByDay retain both filled and upcoming charges
    expect(result.allExpectedBills).toHaveLength(2);
    expect(result.allExpectedBills.filter((b) => b.status === 'filled')).toHaveLength(1);
    expect(result.allExpectedBills.filter((b) => b.status === 'upcoming')).toHaveLength(1);
    expect(result.allExpectedBillsByDay.get(15)?.some((b) => b.status === 'filled')).toBe(true);
    expect(result.allExpectedBillsByDay.get(22)?.some((b) => b.status === 'upcoming')).toBe(true);
  });

  it('consolidates CSV and SimpleFIN Google charge variants and reconciles their paid status across Budget and Timeline', () => {
    expect(normalizeTimelineMerchantKey('google workspace')).toBe('google workspace');
    expect(normalizeTimelineMerchantKey('google_workspace_ca_recurring')).toBe('google workspace');
    expect(normalizeTimelineMerchantKey('google services')).toBe('google services');
    expect(normalizeTimelineMerchantKey('google_services')).toBe('google services');
    expect(normalizeTimelineMerchantKey('google store id barnes christopher co id')).toBe('google store');
    expect(normalizeTimelineMerchantKey('google store')).toBe('google store');
    expect(normalizeTimelineMerchantKey('google google mountain view')).toBe('google');
    expect(normalizeTimelineMerchantKey('google')).toBe('google');
    expect(normalizeTimelineMerchantKey('google fi 4xh mountain view')).toBe('google fi');
    expect(normalizeTimelineMerchantKey('google fi tp6 mountain view')).toBe('google fi');

    const recurrenceMap = new Map<string, RecurrenceInfo>([
      [
        'google workspace',
        {
          kind: 'monthly',
          count: 1,
          meanIntervalDays: 30,
          meanAmount: 50.4,
          estMonthlyCost: 50.4,
          lastDate: '2026-09-02',
          source: 'category',
        },
      ],
      [
        'google_workspace_ca_recurring',
        {
          kind: 'monthly',
          count: 1,
          meanIntervalDays: 30,
          meanAmount: 50.4,
          estMonthlyCost: 50.4,
          lastDate: '2026-10-02',
          source: 'category',
        },
      ],
      [
        'google store id barnes christopher co id',
        {
          kind: 'monthly',
          count: 1,
          meanIntervalDays: 30,
          meanAmount: 54.47,
          estMonthlyCost: 54.47,
          lastDate: '2026-09-11',
          source: 'category',
        },
      ],
      [
        'google store',
        {
          kind: 'monthly',
          count: 1,
          meanIntervalDays: 30,
          meanAmount: 54.47,
          estMonthlyCost: 54.47,
          lastDate: '2026-10-13',
          source: 'category',
        },
      ],
    ]);

    const rawMerchants = [
      { merchantKey: 'google workspace', category: 'Utilities', monthlyAverage: 50.4, occurrences: 1 } as any,
      { merchantKey: 'google_workspace_ca_recurring', category: 'Utilities', monthlyAverage: 50.4, occurrences: 1 } as any,
      { merchantKey: 'google store id barnes christopher co id', category: 'Utilities', monthlyAverage: 54.47, occurrences: 1 } as any,
      { merchantKey: 'google store', category: 'Utilities', monthlyAverage: 54.47, occurrences: 1 } as any,
    ];

    const consolidated = consolidateRecurringMerchants(rawMerchants, recurrenceMap);
    expect(consolidated).toHaveLength(2);

    // Even if queried by the older CSV key, getMerchantBillStatus resolves the latest canonical payment
    const statusOldKey = getMerchantBillStatus('google workspace', '2026-10', recurrenceMap);
    expect(statusOldKey.isPaidThisMonth).toBe(true);
    expect(statusOldKey.lastDate).toBe('2026-10-02');
  });

  it('uses the most recent monthly charge when consolidating merchant variants with an older catch-up payment', () => {
    const recurrenceMap = new Map<string, RecurrenceInfo>([
      [
        'homesite ins pmt',
        {
          kind: 'monthly',
          count: 1,
          meanIntervalDays: 30,
          meanAmount: 996.75,
          estMonthlyCost: 996.75,
          lastDate: '2026-09-08',
          source: 'category',
        },
      ],
      [
        'homesite ins des pmt id barnes christopher co id',
        {
          kind: 'monthly',
          count: 1,
          meanIntervalDays: 30,
          meanAmount: 335.25,
          estMonthlyCost: 335.25,
          lastDate: '2026-10-07',
          source: 'category',
        },
      ],
    ]);

    const rawMerchants = [
      { merchantKey: 'homesite ins pmt', category: 'Home', monthlyAverage: 996.75, occurrences: 1 } as any,
      {
        merchantKey: 'homesite ins des pmt id barnes christopher co id',
        category: 'Home',
        monthlyAverage: 335.25,
        occurrences: 1,
      } as any,
    ];

    const consolidated = consolidateRecurringMerchants(rawMerchants, recurrenceMap);
    expect(consolidated).toHaveLength(1);
    expect(consolidated[0].monthlyAverage).toBe(335.25);
  });

  it('uses active consolidated recurring bills as the baseline for recurring categories instead of stale auto-seeded budgets', () => {
    const projections = computeCategoryProjections({
      categories: [
        { name: 'Home', color: '#2196f3', type: 'spend', defaultRecurrence: 'recurring' } as any,
        { name: 'Restaurants', color: '#ff9800', type: 'spend', defaultRecurrence: 'onetime' } as any,
      ],
      budgets: [
        // Stale auto-seeded budget on Home ($4,898) and explicit $0 budget on Restaurants for an isolated account
        { category: 'Home', monthlyLimit: 4898 } as any,
        { category: 'Restaurants', monthlyLimit: 0 } as any,
      ],
      consolidatedMerchants: [
        {
          merchantKey: 'M&T Bank Mortgage',
          category: 'Home',
          monthlyAverage: 4249.49,
          occurrences: 3,
          cadence: 'monthly',
        } as any,
        {
          merchantKey: 'Homesite Insurance',
          category: 'Home',
          monthlyAverage: 335.25,
          occurrences: 2,
          cadence: 'monthly',
        } as any,
      ],
      trailingAverages: [
        { category: 'Home', average: 4916 } as any,
        { category: 'Restaurants', average: 480 } as any,
      ],
      disabledCategories: [],
      targetMonthKey: '2026-11',
      historicalMonthlySpend: new Map([
        ['2025-11', new Map([['Home', 5200], ['Restaurants', 600]])],
      ]),
    });

    const homeProj = projections.get('Home');
    expect(homeProj?.recurring).toBe(4585);
    expect(homeProj?.total).toBe(4585);
    expect(homeProj?.basis).toBe('recurring');

    // Explicit $0 budget with $0 actual spend is excluded from projections rather than falling back to $600 prior-year spend
    const restProj = projections.get('Restaurants');
    expect(restProj).toBeUndefined();
  });
});
