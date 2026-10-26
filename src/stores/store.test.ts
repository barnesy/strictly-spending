/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { resolveDateRange, type FiltersState } from './store';
import { detectSubscriptionAlerts, detectSpendingAnomalies } from '../domain/insights';
import type { Transaction, MerchantOverride } from '../types';

describe('resolveDateRange - allTime scoping', () => {
  it('falls back to 2000-01-01 when boundaries are not set', () => {
    const dummyState: FiltersState = {
      preset: 'allTime',
      enabledAccountIds: [],
      seenAccountIds: [],
      disabledCategories: [],
      spendOnly: true,
      transactionType: 'spend',
      groupBy: 'category',
      recurrenceFilter: 'all',
      drill: null,
      searchQuery: '',
      demoMode: false,
      showRunway: false,
      forecastHorizon: 0,
      version: 1,
    };
    const range = resolveDateRange(dummyState);
    
    // Start date should be 2000-01-01 local time
    expect(range.start.getFullYear()).toBe(2000);
    expect(range.start.getMonth()).toBe(0); // January
    expect(range.start.getDate()).toBe(1);
    
    // End date should be today/now (current year)
    const now = new Date();
    expect(range.end.getFullYear()).toBe(now.getFullYear());
  });

  it('correctly scopes start and end dates when boundaries are present in state', () => {
    const dummyState: FiltersState = {
      preset: 'allTime',
      earliestTransactionDate: '2025-02-14',
      latestTransactionDate: '2026-05-23',
      enabledAccountIds: [],
      seenAccountIds: [],
      disabledCategories: [],
      spendOnly: true,
      transactionType: 'spend',
      groupBy: 'category',
      recurrenceFilter: 'all',
      drill: null,
      searchQuery: '',
      demoMode: false,
      showRunway: false,
      forecastHorizon: 0,
      version: 1,
    };
    const range = resolveDateRange(dummyState);
    
    // Start date should match 2025-02-14
    expect(range.start.getFullYear()).toBe(2025);
    expect(range.start.getMonth()).toBe(1); // February
    expect(range.start.getDate()).toBe(14);
    
    // End date should match 2026-05-23
    expect(range.end.getFullYear()).toBe(2026);
    expect(range.end.getMonth()).toBe(4); // May
    expect(range.end.getDate()).toBe(23);
  });
});

describe('copilotAnalytics - Subscription Alerts', () => {
  it('detects subscription price spikes', () => {
    const txns = [
      {
        accountId: 1,
        date: '2026-05-01',
        description: 'Netflix',
        amount: -15.49,
        category: 'Subscriptions',
        source: 'demo',
        merchantKey: 'netflix',
        userOverridden: false,
        dedupKey: 'netflix-1'
      },
      {
        accountId: 1,
        date: '2026-06-01',
        description: 'Netflix',
        amount: -22.99,
        category: 'Subscriptions',
        source: 'demo',
        merchantKey: 'netflix',
        userOverridden: false,
        dedupKey: 'netflix-2'
      }
    ] as any as Transaction[];
    
    // We pass an override to force recurrence: 'monthly'
    const overrides: MerchantOverride[] = [
      { merchantKey: 'netflix', recurrence: 'monthly' }
    ];

    const alerts = detectSubscriptionAlerts(txns, overrides);
    expect(alerts.priceSpikes.length).toBe(1);
    expect(alerts.priceSpikes[0].merchantName).toBe('Netflix');
    expect(alerts.priceSpikes[0].oldPrice).toBe(15.49);
    expect(alerts.priceSpikes[0].newPrice).toBe(22.99);
    expect(alerts.priceSpikes[0].percentageChange).toBeCloseTo(48.42, 2);
  });

  it('detects duplicate billing / double charges', () => {
    const txns = [
      {
        accountId: 1,
        date: '2026-06-01',
        description: 'Acme Corp Charge',
        amount: -45.00,
        category: 'Utilities',
        source: 'demo',
        merchantKey: 'acme',
        userOverridden: false,
        dedupKey: 'acme-1'
      },
      {
        accountId: 1,
        date: '2026-06-05',
        description: 'Acme Corp Charge',
        amount: -45.00,
        category: 'Utilities',
        source: 'demo',
        merchantKey: 'acme',
        userOverridden: false,
        dedupKey: 'acme-2'
      }
    ] as any as Transaction[];

    const overrides: MerchantOverride[] = [
      { merchantKey: 'acme', recurrence: 'monthly' }
    ];

    const alerts = detectSubscriptionAlerts(txns, overrides);
    expect(alerts.duplicateCharges.length).toBe(1);
    expect(alerts.duplicateCharges[0].amount).toBe(45.00);
    expect(alerts.duplicateCharges[0].dates).toContain('2026-06-01');
    expect(alerts.duplicateCharges[0].dates).toContain('2026-06-05');
  });

  it('detects overlapping active subscriptions in same group', () => {
    const spotifyTxns = [
      { accountId: 1, date: '2026-04-01', description: 'Spotify Premium', amount: -10.99, category: 'Subscriptions', source: 'demo', merchantKey: 'spotify', userOverridden: false, dedupKey: 'spot-1' },
      { accountId: 1, date: '2026-05-01', description: 'Spotify Premium', amount: -10.99, category: 'Subscriptions', source: 'demo', merchantKey: 'spotify', userOverridden: false, dedupKey: 'spot-2' },
      { accountId: 1, date: '2026-05-31', description: 'Spotify Premium', amount: -10.99, category: 'Subscriptions', source: 'demo', merchantKey: 'spotify', userOverridden: false, dedupKey: 'spot-3' },
    ] as any as Transaction[];
    const appleTxns = [
      { accountId: 1, date: '2026-04-02', description: 'Apple Music', amount: -10.99, category: 'Subscriptions', source: 'demo', merchantKey: 'applemusic', userOverridden: false, dedupKey: 'apple-1' },
      { accountId: 1, date: '2026-05-02', description: 'Apple Music', amount: -10.99, category: 'Subscriptions', source: 'demo', merchantKey: 'applemusic', userOverridden: false, dedupKey: 'apple-2' },
      { accountId: 1, date: '2026-06-01', description: 'Apple Music', amount: -10.99, category: 'Subscriptions', source: 'demo', merchantKey: 'applemusic', userOverridden: false, dedupKey: 'apple-3' },
    ] as any as Transaction[];

    const alerts = detectSubscriptionAlerts([...spotifyTxns, ...appleTxns], []);
    expect(alerts.overlappingSubscriptions.length).toBe(1);
    expect(alerts.overlappingSubscriptions[0].groupName).toBe('Music Streaming');
    expect(alerts.overlappingSubscriptions[0].merchants).toContain('Spotify Premium');
    expect(alerts.overlappingSubscriptions[0].merchants).toContain('Apple Music');
  });
});

describe('copilotAnalytics - Spending Anomalies', () => {
  it('detects category spending pace spikes', () => {
    const txns = [
      // Baseline transactions
      { accountId: 1, date: '2026-03-15', description: 'Market', amount: -100.00, category: 'Groceries', source: 'demo', merchantKey: 'market', userOverridden: false, dedupKey: 'm-1' },
      { accountId: 1, date: '2026-04-15', description: 'Market', amount: -100.00, category: 'Groceries', source: 'demo', merchantKey: 'market', userOverridden: false, dedupKey: 'm-2' },
      { accountId: 1, date: '2026-05-15', description: 'Market', amount: -100.00, category: 'Groceries', source: 'demo', merchantKey: 'market', userOverridden: false, dedupKey: 'm-3' },
      
      // Current transaction
      { accountId: 1, date: '2026-06-15', description: 'Market', amount: -500.00, category: 'Groceries', source: 'demo', merchantKey: 'market', userOverridden: false, dedupKey: 'm-4' }
    ] as any as Transaction[];

    const result = detectSpendingAnomalies(txns, ['Groceries'], '2026-06-01', '2026-06-30', []);
    expect(result.categorySpikes.length).toBe(1);
    expect(result.categorySpikes[0].category).toBe('Groceries');
    expect(result.categorySpikes[0].currentPeriodSpend).toBe(500);
    // Baseline monthly spend should be 300 * (30 / 90) = 100
    expect(result.categorySpikes[0].baselineMonthlySpend).toBeCloseTo(100, 2);
    // Pace increase: ((500 - 100) / 100) * 100 = 400%
    expect(result.categorySpikes[0].percentageChange).toBeCloseTo(400, 2);
  });

  it('detects outlier transactions based on stddev', () => {
    const txns: Transaction[] = [];
    
    // Add 10 consistent historical transactions in Groceries
    for (let i = 1; i <= 10; i++) {
      txns.push({
        id: i,
        accountId: 1,
        date: `2026-05-0${i}`,
        description: 'Consistent Groceries',
        amount: -10.00,
        category: 'Groceries',
        source: 'demo',
        merchantKey: 'grocery',
        userOverridden: false,
        dedupKey: `g-${i}`
      } as any);
    }

    // Add a huge current transaction in June (outlier)
    txns.push({
      id: 99,
      accountId: 1,
      date: '2026-06-15',
      description: 'Supermarket Megastore',
      amount: -150.00,
      category: 'Groceries',
      source: 'demo',
      merchantKey: 'grocery',
      userOverridden: false,
      dedupKey: 'g-99'
    } as any);

    const result = detectSpendingAnomalies(txns, ['Groceries'], '2026-06-01', '2026-06-30', []);
    expect(result.outliers.length).toBe(1);
    expect(result.outliers[0].id).toBe(99);
    expect(result.outliers[0].amount).toBe(150);
  });
});

describe('buildDashboardFilters account handling', () => {
  it('passes undefined for enabledAccountIds when seenAccountIds is empty', async () => {
    const { buildDashboardFilters } = await import('../hooks/queries');
    const state = {
      preset: 'ytd',
      enabledAccountIds: [],
      seenAccountIds: [],
      disabledCategories: [],
      spendOnly: true,
      recurrenceFilter: 'all',
      searchQuery: '',
      demoMode: false,
    };
    const filters = buildDashboardFilters(state);
    expect(filters.enabledAccountIds).toBeUndefined();
  });

  it('passes empty array when user clicked None after accounts have been seen', async () => {
    const { buildDashboardFilters } = await import('../hooks/queries');
    const state = {
      preset: 'ytd',
      enabledAccountIds: [],
      seenAccountIds: [1, 2, 3],
      disabledCategories: [],
      spendOnly: true,
      recurrenceFilter: 'all',
      searchQuery: '',
      demoMode: false,
    };
    const filters = buildDashboardFilters(state);
    expect(filters.enabledAccountIds).toEqual([]);
  });

  it('passes selected account IDs when specific accounts are enabled', async () => {
    const { buildDashboardFilters } = await import('../hooks/queries');
    const state = {
      preset: 'ytd',
      enabledAccountIds: [2, 3],
      seenAccountIds: [1, 2, 3],
      disabledCategories: [],
      spendOnly: true,
      recurrenceFilter: 'all',
      searchQuery: '',
      demoMode: false,
    };
    const filters = buildDashboardFilters(state);
    expect(filters.enabledAccountIds).toEqual([2, 3]);
  });

  it('correctly passes transactionType and spendOnly in buildDashboardFilters', async () => {
    const { buildDashboardFilters } = await import('../hooks/queries');

    const spendState = {
      preset: 'ytd',
      enabledAccountIds: [],
      seenAccountIds: [],
      disabledCategories: [],
      spendOnly: true,
      transactionType: 'spend',
      recurrenceFilter: 'all',
      searchQuery: '',
      demoMode: false,
    };
    const spendFilters = buildDashboardFilters(spendState);
    expect(spendFilters.transactionType).toBe('spend');
    expect(spendFilters.spendOnly).toBe(true);

    const incomeState = {
      ...spendState,
      spendOnly: false,
      transactionType: 'income',
    };
    const incomeFilters = buildDashboardFilters(incomeState);
    expect(incomeFilters.transactionType).toBe('income');
    expect(incomeFilters.spendOnly).toBe(false);

    const allState = {
      ...spendState,
      spendOnly: false,
      transactionType: 'all',
    };
    const allFilters = buildDashboardFilters(allState);
    expect(allFilters.transactionType).toBe('all');
    expect(allFilters.spendOnly).toBe(false);
  });
});
