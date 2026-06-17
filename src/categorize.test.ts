import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeRawCategory,
  extractMerchantKey,
  categorize,
  inferTypeCategory,
  recategorizeAll,
  categorizeBatch,
} from './categorize';
import { db } from './db';

const rulesData: any[] = [];
const transactionsData: any[] = [];

vi.mock('./db', () => {
  return {
    db: {
      rules: {
        toArray: async () => [...rulesData],
      },
      transactions: {
        toArray: async () => [...transactionsData],
        update: async (id: number, updates: any) => {
          const t = transactionsData.find(x => x.id === id);
          if (t) Object.assign(t, updates);
        },
      },
      categories: {
        toArray: async () => [],
      },
      merchantOverrides: {
        toArray: async () => [],
      },
      transaction: async (_mode: string, _tables: any, callback: () => Promise<void>) => {
        await callback();
      }
    }
  };
});

describe('categorize engine', () => {
  beforeEach(() => {
    rulesData.length = 0;
    transactionsData.length = 0;
    vi.clearAllMocks();
  });

  it('database instance is defined', () => {
    expect(db).toBeDefined();
  });

  describe('normalizeRawCategory', () => {
    it('correctly maps raw bank categories to system categories', () => {
      expect(normalizeRawCategory('Gas')).toBe('Transportation');
      expect(normalizeRawCategory('Bills & Utilities')).toBe('Utilities');
      expect(normalizeRawCategory('Eating Places, Restaurants')).toBe('Restaurants & Coffee');
      expect(normalizeRawCategory('Paychecks')).toBe('Income');
    });

    it('returns null for unknown categories', () => {
      expect(normalizeRawCategory('Unknown Raw Category')).toBeNull();
      expect(normalizeRawCategory('')).toBeNull();
    });
  });

  describe('extractMerchantKey', () => {
    it('strips card processor prefixes', () => {
      expect(extractMerchantKey('SQ *MY MERCHANT')).toBe('my merchant');
      expect(extractMerchantKey('TST* THE BAKERY')).toBe('the bakery');
      expect(extractMerchantKey('SP * HOME DEPOT')).toBe('home depot');
    });

    it('strips date identifiers', () => {
      expect(extractMerchantKey('NETFLIX.COM 05/22')).toBe('netflix com');
      expect(extractMerchantKey('STARBUCKS 12/31/2026')).toBe('starbucks');
    });

    it('strips common transactional keywords and trailing location tokens', () => {
      expect(extractMerchantKey('Chevron Gas Station CA')).toBe('chevron gas station');
      expect(extractMerchantKey('PURCHASE DEBIT CARD APPLE COM BILL')).toBe('apple com bill');
      expect(extractMerchantKey('AMZN Mktp US POS')).toBe('amzn mktp us');
    });

    it('collapses whitespace and punctuation', () => {
      expect(extractMerchantKey('   Uber   Trip!!!   ')).toBe('uber trip');
    });
  });

  describe('categorize', () => {
    it('matches patterns fuzzy and case-insensitively', () => {
      const ctx = {
        rules: [
          { id: 1, pattern: 'Starbucks', category: 'Restaurants & Coffee', priority: 1, createdAt: '' }
        ]
      };
      expect(categorize('STARBUCKS COFFEE #123', 'starbucks', undefined, ctx)).toBe('Restaurants & Coffee');
    });

    it('respects rule priorities when multiple rules match', () => {
      const ctx = {
        rules: [
          { id: 1, pattern: 'Target', category: 'Shopping', priority: 1, createdAt: '' },
          { id: 2, pattern: 'Target Superstore', category: 'Groceries', priority: 2, createdAt: '' }
        ]
      };
      expect(categorize('Target Superstore NYC', 'target superstore', undefined, ctx)).toBe('Groceries');
      expect(categorize('Target Express', 'target', undefined, ctx)).toBe('Shopping');
    });

    it('falls back to raw bank category normalization if no rules match', () => {
      const ctx = { rules: [] };
      expect(categorize('Uber Trip', 'uber', 'Gas', ctx)).toBe('Transportation');
    });

    it('returns Uncategorized if no match is found', () => {
      const ctx = { rules: [] };
      expect(categorize('Random description', undefined, undefined, ctx)).toBe('Uncategorized');
    });
  });

  describe('inferTypeCategory', () => {
    it('infers positive credit amounts as Transfers', () => {
      expect(inferTypeCategory(150.00, 'chase', undefined)).toBe('Transfers');
      expect(inferTypeCategory(20.00, 'boa-credit', undefined)).toBe('Transfers');
    });

    it('returns null for credit charges or checking deposits', () => {
      expect(inferTypeCategory(-50.00, 'chase', undefined)).toBeNull();
      expect(inferTypeCategory(1500.00, 'boa-checking', undefined)).toBeNull();
    });
  });

  describe('recategorizeAll', () => {
    it('updates transactions that are not user overridden and whose categories changed', async () => {
      rulesData.push({ id: 1, pattern: 'Netflix', category: 'Subscriptions', priority: 1, createdAt: '' });
      transactionsData.push(
        { id: 101, description: 'Netflix Card', category: 'Uncategorized', userOverridden: false },
        { id: 102, description: 'Netflix Card Premium', category: 'Entertainment', userOverridden: true } // Overridden - skip
      );

      const result = await recategorizeAll();
      expect(result.updated).toBe(1);
      expect(transactionsData[0].category).toBe('Subscriptions');
      expect(transactionsData[1].category).toBe('Entertainment'); // Remains untouched
    });
  });

  describe('categorizeBatch', () => {
    it('correctly maps a batch of transactions', async () => {
      rulesData.push({ id: 1, pattern: 'Hulu', category: 'Subscriptions', priority: 1, createdAt: '' });
      const batch = [
        { description: 'Hulu Subscription', amount: -15.00, source: 'chase' as const },
        { description: 'Unknown charge', amount: -10.00, source: 'chase' as const },
        { description: 'Chase payment check', amount: 500.00, source: 'chase' as const }
      ];

      const result = await categorizeBatch(batch);
      expect(result).toEqual(['Subscriptions', 'Uncategorized', 'Transfers']);
    });
  });
});
