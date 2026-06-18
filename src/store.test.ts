import { describe, it, expect, vi } from 'vitest';
import { resolveDateRange, type FiltersState } from './store';

describe('resolveDateRange - allTime scoping', () => {
  it('falls back to 2000-01-01 when boundaries are not set', () => {
    const dummyState: FiltersState = {
      preset: 'allTime',
      enabledAccountIds: [],
      disabledCategories: [],
      spendOnly: true,
      groupBy: 'category',
      recurrenceFilter: 'all',
      drill: null,
      searchQuery: '',
      demoMode: false,
      showRunway: false,
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
      disabledCategories: [],
      spendOnly: true,
      groupBy: 'category',
      recurrenceFilter: 'all',
      drill: null,
      searchQuery: '',
      demoMode: false,
      showRunway: false,
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

import { matchCategories, matchAccounts, cleanChatHistory, getMonthsInRange, calculateBudgetStatus, executeCopilotCommand, aggregateTransactions } from './copilotMatcher';

describe('copilotMatcher - Category Matching', () => {
  const mockCategories = [
    { name: 'Groceries' },
    { name: 'Restaurants & Coffee' },
    { name: 'Transportation' },
    { name: 'Auto Loan' },
    { name: 'Utilities' },
    { name: 'Subscriptions' },
    { name: 'Housing' },
  ];

  it('matches exact name case insensitively and with whitespace normalization', () => {
    expect(matchCategories(['groceries'], mockCategories)).toEqual(['Groceries']);
    expect(matchCategories(['  subscriptions  '], mockCategories)).toEqual(['Subscriptions']);
  });

  it('resolves category synonyms (e.g. food -> Groceries & Restaurants)', () => {
    const matched = matchCategories(['food'], mockCategories);
    expect(matched).toContain('Groceries');
    expect(matched).toContain('Restaurants & Coffee');
    expect(matched.length).toBe(2);
  });

  it('resolves specific synonym to exact category (e.g. rent -> Housing)', () => {
    expect(matchCategories(['rent'], mockCategories)).toEqual(['Housing']);
    expect(matchCategories(['netflix'], mockCategories)).toEqual(['Subscriptions']);
  });

  it('resolves travel, entertainment, and mortgage synonyms to their specific categories', () => {
    const categoriesWithAll = [
      ...mockCategories,
      { name: 'Travel' },
      { name: 'Entertainment' },
      { name: 'Mortgage' }
    ];
    expect(matchCategories(['travel'], categoriesWithAll)).toEqual(['Travel']);
    expect(matchCategories(['entertainment'], categoriesWithAll)).toEqual(['Entertainment']);
    expect(matchCategories(['mortgage'], categoriesWithAll)).toEqual(['Mortgage']);
  });

  it('matches fuzzy partials', () => {
    expect(matchCategories(['utility'], mockCategories)).toEqual(['Utilities']);
    expect(matchCategories(['transit'], mockCategories)).toEqual(['Transportation']);
  });
});

describe('copilotMatcher - Account Matching', () => {
  const mockAccounts = [
    { id: 1, name: 'Demo: Checking' },
    { id: 2, name: 'Demo: Credit Card' },
    { id: 3, name: 'Demo: Joint Card' },
  ];

  it('matches account name ignoring colons, spaces, and punctuation', () => {
    expect(matchAccounts(['Demo Credit Card'], mockAccounts)).toEqual([2]);
    expect(matchAccounts(['demo checking'], mockAccounts)).toEqual([1]);
  });

  it('matches by account ID string', () => {
    expect(matchAccounts(['3'], mockAccounts)).toEqual([3]);
  });

  it('matches fuzzy partial account names', () => {
    expect(matchAccounts(['credit card'], mockAccounts)).toEqual([2]);
  });
});

describe('copilotMatcher - Chat History Cleaning', () => {
  it('extracts natural language explanation from assistant JSON commands in history', () => {
    const rawMessages = [
      { role: 'user' as const, content: 'Filter to food' },
      {
        role: 'assistant' as const,
        content: JSON.stringify({
          action: 'filter',
          categories: ['Groceries', 'Restaurants & Coffee'],
          explanation: 'Showing food spending.',
        }),
      },
      { role: 'user' as const, content: 'Filter to credit card also' },
    ];

    const cleaned = cleanChatHistory(rawMessages);
    expect(cleaned[0]).toEqual({ role: 'user', content: 'Filter to food' });
    expect(cleaned[1]).toEqual({ role: 'assistant', content: 'Showing food spending.' });
    expect(cleaned[2]).toEqual({ role: 'user', content: 'Filter to credit card also' });
  });

  it('leaves non-JSON or plain text assistant messages untouched', () => {
    const rawMessages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hello! How can I help you today?' },
    ];
    const cleaned = cleanChatHistory(rawMessages);
    expect(cleaned).toEqual(rawMessages);
  });

  it('correctly handles multi-turn two-stage query histories containing Stage 1 and Stage 2 responses', () => {
    const rawMessages = [
      { role: 'user' as const, content: 'How much did I spend on dining out last month?' },
      {
        role: 'assistant' as const,
        content: JSON.stringify({
          title: 'Dining Out',
          body: 'Querying last month dining spend.',
          gen_ux: { type: 'none', options: [] },
          suggested_actions: ['Reset filters'],
          agent_action: { action: 'query_data', categories: ['Restaurants & Coffee'], preset: 'lastMonth' }
        })
      },
      {
        role: 'system' as const,
        content: 'Database Query Results for categories [Restaurants & Coffee] between ...: - Total Spent: $252.78'
      },
      {
        role: 'assistant' as const,
        content: JSON.stringify({
          title: 'Dining Out Spend',
          body: 'You spent $252.78 on dining out last month.',
          gen_ux: { type: 'none', options: [] },
          suggested_actions: ['Reset filters'],
          agent_action: { action: 'none' }
        }),
        actionResult: {
          action: 'query_data',
          categories: ['Restaurants & Coffee'],
          metrics: { totalSpend: 252.78 }
        }
      },
      { role: 'user' as const, content: 'Show me groceries for the year' }
    ];

    const cleaned = cleanChatHistory(rawMessages);
    expect(cleaned.length).toBe(3);
    expect(cleaned[0]).toEqual({ role: 'user', content: 'How much did I spend on dining out last month?' });
    expect(cleaned[1]).toEqual({ role: 'assistant', content: 'You spent $252.78 on dining out last month.' });
    expect(cleaned[2]).toEqual({ role: 'user', content: 'Show me groceries for the year' });
  });

  it('preserves all active loop messages that appear at or after the last user message', () => {
    const rawMessages = [
      { role: 'user' as const, content: 'Old question' },
      { role: 'assistant' as const, content: 'Old answer' },
      { role: 'user' as const, content: 'Show me Apple transactions' },
      {
        role: 'assistant' as const,
        content: JSON.stringify({
          agent_action: { action: 'query_data', search: 'Apple' }
        })
      },
      {
        role: 'system' as const,
        content: 'Database Query Results: - Total Spent: $95.88'
      }
    ];

    const cleaned = cleanChatHistory(rawMessages);
    expect(cleaned.length).toBe(5);
    expect(cleaned[0]).toEqual({ role: 'user', content: 'Old question' });
    expect(cleaned[1]).toEqual({ role: 'assistant', content: 'Old answer' });
    expect(cleaned[2]).toEqual({ role: 'user', content: 'Show me Apple transactions' });
    expect(cleaned[3]).toEqual(rawMessages[3]);
    expect(cleaned[4]).toEqual(rawMessages[4]);
  });
});

describe('copilotMatcher - Budget Scaling and Status', () => {
  it('calculates calendar month duration between dates inclusive of months bounds', () => {
    // January 1st to March 31st = 3 months
    expect(getMonthsInRange('2026-01-01', '2026-03-31')).toBe(3);
    // January 15th to February 20th = 1.23 months (37 days inclusive / 30)
    expect(getMonthsInRange('2026-01-15', '2026-02-20')).toBeCloseTo(1.23, 2);
    // Single month
    expect(getMonthsInRange('2026-05-01', '2026-05-31')).toBe(1);
  });

  it('generates correct statusText and scales budget for within-budget scenarios', () => {
    const totalSpend = 850.00;
    const monthlyBudget = 283.33;
    const numMonths = 3; // 283.33 * 3 = 849.99 (rounded / float check)
    
    const status = calculateBudgetStatus(totalSpend, monthlyBudget, numMonths);
    expect(status.scaledBudget).toBeCloseTo(849.99, 2);
    expect(status.isOverBudget).toBe(true); // 850.00 > 849.99
    expect(status.statusText).toContain('OVER budget');
  });

  it('generates correct statusText and scales budget for under-budget scenarios', () => {
    const totalSpend = 120.00;
    const monthlyBudget = 200.00;
    const numMonths = 1;
    
    const status = calculateBudgetStatus(totalSpend, monthlyBudget, numMonths);
    expect(status.scaledBudget).toBe(200.00);
    expect(status.isOverBudget).toBe(false);
    expect(status.statusText).toContain('UNDER/WITHIN budget by $80.00');
  });
});

describe('copilotMatcher - Command Execution', () => {
  const mockCategories = [
    { name: 'Groceries' },
    { name: 'Restaurants & Coffee' },
    { name: 'Utilities' },
  ];
  const mockAccounts = [
    { id: 1, name: 'Demo: Checking' },
    { id: 2, name: 'Demo: Credit Card' },
  ];

  it('correctly maps custom dates and start/end dates properties', () => {
    let customStartVal: string | undefined;
    let customEndVal: string | undefined;
    
    const mockCtx = {
      categories: mockCategories,
      accounts: mockAccounts,
      currentPath: '/',
      navigate: () => {},
      setPreset: () => {},
      setCustomRange: (s?: string, e?: string) => {
        customStartVal = s;
        customEndVal = e;
      },
      setDisabledCategories: () => {},
      setEnabledAccounts: () => {},
      setSearchQuery: () => {},
      setMinPrice: () => {},
      setMaxPrice: () => {},
    };

    // Test with startDate/endDate
    executeCopilotCommand({
      action: 'filter',
      preset: 'custom',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    }, mockCtx);

    expect(customStartVal).toBe('2026-01-01');
    expect(customEndVal).toBe('2026-03-31');

    // Test with customStart/customEnd
    executeCopilotCommand({
      action: 'filter',
      preset: 'custom',
      customStart: '2026-01-15',
      customEnd: '2026-02-20',
    }, mockCtx);

    expect(customStartVal).toBe('2026-01-15');
    expect(customEndVal).toBe('2026-02-20');
  });

  it('filters specific categories and disables others', () => {
    let disabledCats: string[] = [];
    const mockCtx = {
      categories: mockCategories,
      accounts: mockAccounts,
      currentPath: '/',
      navigate: () => {},
      setPreset: () => {},
      setCustomRange: () => {},
      setDisabledCategories: (cats: string[]) => {
        disabledCats = cats;
      },
      setEnabledAccounts: () => {},
      setSearchQuery: () => {},
      setMinPrice: () => {},
      setMaxPrice: () => {},
    };

    executeCopilotCommand({
      action: 'filter',
      categories: ['Groceries'],
    }, mockCtx);

    expect(disabledCats).toContain('Restaurants & Coffee');
    expect(disabledCats).toContain('Utilities');
    expect(disabledCats).not.toContain('Groceries');
  });

  it('keeps all categories and accounts enabled when empty arrays are provided', () => {
    let disabledCats: string[] = ['DummyCategory'];
    let enabledAccts: number[] = [];
    const mockCtx = {
      categories: mockCategories,
      accounts: mockAccounts,
      currentPath: '/',
      navigate: () => {},
      setPreset: () => {},
      setCustomRange: () => {},
      setDisabledCategories: (cats: string[]) => {
        disabledCats = cats;
      },
      setEnabledAccounts: (ids: number[]) => {
        enabledAccts = ids;
      },
      setSearchQuery: () => {},
      setMinPrice: () => {},
      setMaxPrice: () => {},
    };

    executeCopilotCommand({
      action: 'filter',
      categories: [],
      accounts: [],
    }, mockCtx);

    // Empty arrays should result in 0 disabled categories and all accounts enabled
    expect(disabledCats).toEqual([]);
    expect(enabledAccts).toEqual([1, 2]);
  });
});

describe('copilotMatcher - Transaction Aggregation (Deterministic Math)', () => {
  const mockCategoryTypes = {
    groceries: 'spend',
    'restaurants & coffee': 'spend',
    income: 'income',
    transfers: 'transfer'
  };

  it('correctly aggregates spend category and nets out positive refunds (credits)', () => {
    const txns = [
      { category: 'Groceries', amount: -100.00 }, // expense
      { category: 'Groceries', amount: 20.00 },   // refund
      { category: 'Restaurants & Coffee', amount: -50.00 } // expense
    ];
    
    const results = aggregateTransactions(txns, mockCategoryTypes, 200, 1);
    
    // Total spent should be 100 - 20 + 50 = 130
    expect(results.totalSpend).toBe(130.00);
    expect(results.spendCount).toBe(3);
    expect(results.totalIncome).toBe(0);
    expect(results.spendAverage).toBeCloseTo(43.33, 2);
    expect(results.isOverBudget).toBe(false);
  });

  it('correctly aggregates income category summing positive values', () => {
    const txns = [
      { category: 'Income', amount: 4200.00 }, // paycheck
      { category: 'Income', amount: -50.00 }   // correction/withholding
    ];
    
    const results = aggregateTransactions(txns, mockCategoryTypes, 0, 1);
    
    expect(results.totalIncome).toBe(4150.00);
    expect(results.incomeCount).toBe(2);
    expect(results.totalSpend).toBe(0);
    expect(results.incomeAverage).toBe(2075.00);
  });

  it('correctly calculates mixed spending and income queries', () => {
    const txns = [
      { category: 'Groceries', amount: -80.00 },
      { category: 'Income', amount: 1000.00 },
      { category: 'Transfers', amount: -200.00 } // negative transfer counts as spend
    ];
    
    const results = aggregateTransactions(txns, mockCategoryTypes, 100, 1);
    
    // total spend should be 80 (Groceries) + 200 (Transfer) = 280
    expect(results.totalSpend).toBe(280.00);
    expect(results.totalIncome).toBe(1000.00);
    expect(results.spendCount).toBe(2);
    expect(results.incomeCount).toBe(1);
    expect(results.isOverBudget).toBe(true); // 280 > 100
  });
});

import { detectSubscriptionAlerts, detectSpendingAnomalies } from './copilotAnalytics';
import type { Transaction, MerchantOverride } from './types';

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
    // Actually let's use exact 30 day spacing to make it simpler and pass overrides
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
    // Current period: June 1st to June 30th (30 days)
    // Historical period: March 3rd to May 31st (90 days)
    // We spend $500 in June on Groceries
    // We spend $300 in total across the 90 days baseline (e.g. $100 per month)
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

const threadsData: any[] = [];
const messagesData: any[] = [];

vi.mock('./db', () => {
  return {
    db: {
      threads: {
        clear: async () => { threadsData.length = 0; },
        put: async (t: any) => {
          const idx = threadsData.findIndex(x => x.id === t.id);
          if (idx >= 0) threadsData[idx] = t;
          else threadsData.push(t);
        },
        delete: async (id: string) => {
          const idx = threadsData.findIndex(x => x.id === id);
          if (idx >= 0) threadsData.splice(idx, 1);
        },
        update: async (id: string, updates: any) => {
          const t = threadsData.find(x => x.id === id);
          if (t) Object.assign(t, updates);
        },
        toArray: async () => [...threadsData],
        reverse: () => ({
          sortBy: async () => [...threadsData].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        })
      },
      messages: {
        clear: async () => { messagesData.length = 0; },
        add: async (m: any) => {
          const newMsg = { ...m, id: messagesData.length + 1 };
          messagesData.push(newMsg);
          return newMsg.id;
        },
        where: (field: string) => ({
          equals: (val: any) => ({
            toArray: async () => messagesData.filter(m => m[field] === val),
            delete: async () => {
              const keep = messagesData.filter(m => m[field] !== val);
              messagesData.length = 0;
              messagesData.push(...keep);
            },
            sortBy: async (sortField: string) => {
              const filtered = messagesData.filter(m => m[field] === val);
              return filtered.sort((a, b) => a[sortField] - b[sortField]);
            }
          })
        })
      }
    }
  };
});

import { useChatStore } from './chatStore';
import { db } from './db';

describe('useChatStore - Thread-ID Session Isolation & Dexie checkpointers', () => {
  it('correctly creates threads, saves messages under activeThreadId, and switches threads', async () => {
    // Clear existing DB tables for test isolation
    await db.threads.clear();
    await db.messages.clear();

    const { createThread, addMessage, setActiveThreadId, deleteThread } = useChatStore.getState();

    // 1. Create first thread
    const threadId1 = await createThread('Test Thread 1');
    expect(threadId1).toBeDefined();
    expect(useChatStore.getState().activeThreadId).toBe(threadId1);

    // 2. Add message to first thread
    await addMessage({ role: 'user', content: 'Message in thread 1' });
    expect(useChatStore.getState().messages.length).toBe(1);

    // Verify it is saved in Dexie messages
    const dbMessages1 = await db.messages.where('threadId').equals(threadId1).toArray();
    expect(dbMessages1.length).toBe(1);
    expect(dbMessages1[0].content).toBe('Message in thread 1');

    // 3. Create second thread
    const threadId2 = await createThread('Test Thread 2');
    expect(threadId2).toBeDefined();
    expect(useChatStore.getState().activeThreadId).toBe(threadId2);
    expect(useChatStore.getState().messages.length).toBe(0); // Should be empty

    // 4. Add message to second thread
    await addMessage({ role: 'user', content: 'Message in thread 2' });
    expect(useChatStore.getState().messages.length).toBe(1);

    // Verify it is saved in Dexie messages
    const dbMessages2 = await db.messages.where('threadId').equals(threadId2).toArray();
    expect(dbMessages2.length).toBe(1);
    expect(dbMessages2[0].content).toBe('Message in thread 2');

    // 5. Switch back to first thread
    await setActiveThreadId(threadId1);
    expect(useChatStore.getState().activeThreadId).toBe(threadId1);
    expect(useChatStore.getState().messages.length).toBe(1);
    expect(useChatStore.getState().messages[0].content).toBe('Message in thread 1');

    // 6. Delete second thread
    await deleteThread(threadId2);
    const threads = await db.threads.toArray();
    expect(threads.some(t => t.id === threadId2)).toBe(false);
    const messages = await db.messages.where('threadId').equals(threadId2).toArray();
    expect(messages.length).toBe(0);
  });
});

import { parseAIResponse, extractFieldUsingRegex, getMessageDisplayContent, runSkillTestCase, localAI, forceBoldAndTwoDecimals } from './ai';

describe('parseAIResponse & cleanJSONString', () => {
  it('raw input formatting checks', () => {
    const raw = `{\n  "title": "Outliers",\n  "body": "Here is list:\n- item 1\n- item 2",\n  "agent_action": {\n    "action": "none"\n  }\n}`;
    const parsed = parseAIResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.title).toBe('Outliers');
    expect(parsed.body).toContain('- item 1');
  });

  it('correctly cleans trailing commas before closing braces', () => {
    const raw = `{\n  "title": "Outliers",\n  "body": "No action",\n  "suggested_actions": ["Action 1", "Action 2",],\n  "agent_action": {\n    "action": "none",\n  }\n}`;
    const parsed = parseAIResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.suggested_actions).toEqual(["Action 1", "Action 2"]);
    expect(parsed.agent_action.action).toBe('none');
  });

  it('returns null on completely invalid inputs', () => {
    expect(parseAIResponse('This is not a JSON')).toBeNull();
  });

  it('correctly parses choices gen_ux payloads', () => {
    const raw = `{\n  "title": "Query Choices",\n  "body": "Select an option:",\n  "gen_ux": {\n    "type": "choices",\n    "options": ["Option 1", "Option 2"]\n  },\n  "agent_action": { "action": "none" }\n}`;
    const parsed = parseAIResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.gen_ux.type).toBe('choices');
    expect(parsed.gen_ux.options).toEqual(["Option 1", "Option 2"]);
  });

  it('correctly parses confirmation gen_ux payloads', () => {
    const raw = `{\n  "title": "Confirm Delete",\n  "body": "Are you sure?",\n  "gen_ux": {\n    "type": "confirmation",\n    "options": ["Yes, delete", "No, keep"]\n  },\n  "agent_action": { "action": "none" }\n}`;
    const parsed = parseAIResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.gen_ux.type).toBe('confirmation');
    expect(parsed.gen_ux.options).toEqual(["Yes, delete", "No, keep"]);
  });

  it('correctly parses form gen_ux payloads', () => {
    const raw = `{\n  "title": "Onboarding",\n  "body": "Please fill out the details:",\n  "gen_ux": {\n    "type": "form",\n    "options": ["Field 1", "Field 2"]\n  },\n  "agent_action": { "action": "none" }\n}`;
    const parsed = parseAIResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.gen_ux.type).toBe('form');
    expect(parsed.gen_ux.options).toEqual(["Field 1", "Field 2"]);
  });

  it('escapes unescaped nested double quotes in string values', () => {
    const raw = `{ "title": "Audit", "body": "Found duplicate "Netflix" subscriptions." }`;
    const parsed = parseAIResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.body).toBe('Found duplicate "Netflix" subscriptions.');
  });

  it('correctly handles nested quotes inside arrays', () => {
    const raw = `{\n  "title": "Outliers",\n  "body": "Check \\"this\\" out",\n  "suggested_actions": ["Action 1", "Action "Two"",],\n}`;
    const parsed = parseAIResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.suggested_actions).toEqual(["Action 1", "Action \"Two\""]);
  });

  it('extracts fields using regex safety net', () => {
    const raw = `{ "title": "Audit", "body": "My unescaped \\"body\\" text" }`;
    expect(extractFieldUsingRegex(raw, 'body')).toBe('My unescaped "body" text');
  });

  it('resolves message display content for user and assistant roles', () => {
    const parsed = {
      title: 'Spreadsheet title',
      agent_action: {
        action: 'create_artifact',
        title: 'Report Title'
      }
    };
    expect(getMessageDisplayContent(parsed)).toBe('Created artifact: Report Title.');
  });

  describe('forceBoldAndTwoDecimals', () => {
    it('formats plain integers and decimals and bolds them', () => {
      expect(forceBoldAndTwoDecimals('you spent $250 across 6 transactions')).toBe('you spent **$250.00** across **6.00** transactions');
      expect(forceBoldAndTwoDecimals('difference of $141.29 (+56.5%)')).toBe('difference of **$141.29** (**+56.50%**)');
      expect(forceBoldAndTwoDecimals('negative amount -$15.5')).toBe('negative amount **-$15.50**');
    });

    it('handles already bolded numbers', () => {
      expect(forceBoldAndTwoDecimals('spent **$391.29** across **6** transactions')).toBe('spent **$391.29** across **6.00** transactions');
    });

    it('does not format years or dates', () => {
      expect(forceBoldAndTwoDecimals('Between 2026-05-01 and 2026-06-01')).toBe('Between 2026-05-01 and 2026-06-01');
      expect(forceBoldAndTwoDecimals('In the year 2026, you spent $200.')).toBe('In the year 2026, you spent **$200.00**.');
    });

    it('does not touch markdown links, HTML or code blocks', () => {
      expect(forceBoldAndTwoDecimals('[link](file:///path/to/file#L123)')).toBe('[link](file:///path/to/file#L123)');
      expect(forceBoldAndTwoDecimals('`code 123` and `<div id="1">`')).toBe('`code 123` and `<div id="1">`');
    });
  });
});

describe('runSkillTestCase', () => {
  it('correctly runs execution and evaluation flow on success', async () => {
    const chatCopilotSpy = vi.spyOn(localAI, 'chatCopilot')
      .mockResolvedValueOnce('Assistant output for Netflix duplicates.')
      .mockResolvedValueOnce(JSON.stringify({
        success: true,
        score: 95,
        reasoning: 'The model correctly analyzed the subscription charges.'
      }));

    const skill = {
      id: 'builtin:subscriptions',
      name: 'Subscriptions Audit',
      description: '...',
      systemPromptExtension: 'Must analyze subscriptions.',
      enabled: true
    };
    const testCase = {
      prompt: 'Check subscriptions',
      criteria: 'Must mention Netflix duplicates'
    };

    const result = await runSkillTestCase(skill, testCase);

    expect(result.success).toBe(true);
    expect(result.score).toBe(95);
    expect(result.reasoning).toBe('The model correctly analyzed the subscription charges.');
    expect(result.output).toBe('Assistant output for Netflix duplicates.');

    expect(chatCopilotSpy).toHaveBeenCalledTimes(2);
    chatCopilotSpy.mockRestore();
  });

  it('correctly handles fallback regex parser if evaluator output is malformed JSON', async () => {
    const chatCopilotSpy = vi.spyOn(localAI, 'chatCopilot')
      .mockResolvedValueOnce('Assistant response.')
      .mockResolvedValueOnce('Evaluator response that is plain text but mentions "success": true and "score": 85 and "reasoning": "Criteria was met successfully."');

    const skill = {
      id: 'builtin:accessibility',
      name: 'Accessibility',
      description: '...',
      systemPromptExtension: 'Run audit.',
      enabled: true
    };
    const testCase = {
      prompt: 'Audit page',
      criteria: 'Must flag headings structure'
    };

    const result = await runSkillTestCase(skill, testCase);

    expect(result.success).toBe(true);
    expect(result.score).toBe(85);
    expect(result.reasoning).toBe('Criteria was met successfully.');

    chatCopilotSpy.mockRestore();
  });

  it('returns failure details when assistant execution fails', async () => {
    const chatCopilotSpy = vi.spyOn(localAI, 'chatCopilot')
      .mockRejectedValueOnce(new Error('Model loading timeout'));

    const skill = {
      id: 'builtin:accessibility',
      name: 'Accessibility',
      description: '...',
      systemPromptExtension: 'Run audit.',
      enabled: true
    };
    const testCase = {
      prompt: 'Audit page',
      criteria: 'Must flag headings structure'
    };

    const result = await runSkillTestCase(skill, testCase);

    expect(result.success).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('Assistant execution failure: Model loading timeout');

    chatCopilotSpy.mockRestore();
  });
});

describe('safeFetch Error Handling', () => {
  it('correctly maps WebKit network exception to clean offline message', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new DOMException('The string did not match the expected pattern.'));

    try {
      await localAI.init();
      expect(true).toBe(false); // should not reach here
    } catch (err: any) {
      expect(err.message).toBe('Ollama server is offline or connection was blocked. Please check that Ollama is running.');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('correctly passes through abort errors without translating them', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));

    try {
      await localAI.init();
      expect(true).toBe(false); // should not reach here
    } catch (err: any) {
      expect(err.name).toBe('AbortError');
      expect(err.message).toContain('The user aborted a request');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('handles invalid non-JSON responses from Ollama by raising an error', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'Not a JSON response'
    });

    try {
      await localAI.init();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toBe('Failed to parse Ollama tags response as JSON.');
    } finally {
      global.fetch = originalFetch;
    }
  });
});



