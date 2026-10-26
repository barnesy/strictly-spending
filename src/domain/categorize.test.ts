import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeRawCategory,
  extractMerchantKey,
  categorize,
  inferTypeCategory,
  recategorizeAll,
  categorizeBatch,
  deriveRulePattern,
} from './categorize';
import { api } from '../api';

const rulesData: any[] = [];
const transactionsData: any[] = [];

vi.mock('../api', () => {
  return {
    api: {
      getRules: async () => [...rulesData],
      getTransactions: async () => [...transactionsData],
      refreshRecurrenceAll: async () => 0,
      recategorizeAll: vi.fn(async (forceUserRules = true) => {
        let updated = 0;
        for (const t of transactionsData) {
          const matching = rulesData
            .filter((r) => t.description.toLowerCase().includes(r.pattern.toLowerCase()))
            .sort((a, b) => b.priority - a.priority)[0];
          if (t.userOverridden && !(forceUserRules && matching && matching.priority >= 1000)) {
            continue;
          }
          const nextCat = matching ? matching.category : 'Uncategorized';
          if (nextCat !== t.category) {
            t.category = nextCat;
            updated++;
          }
        }
        return updated;
      }),
      bulkUpdateTransactions: async (updates: any[]) => {
        for (const u of updates) {
          const t = transactionsData.find(x => x.id === u.id);
          if (t) Object.assign(t, u);
        }
      },
    }
  };
});

describe('categorize engine', () => {
  beforeEach(() => {
    rulesData.length = 0;
    transactionsData.length = 0;
    vi.clearAllMocks();
  });

  it('api instance is defined', () => {
    expect(api).toBeDefined();
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

    it('prefers more specific pattern when priorities are equal', () => {
      const ctx = {
        rules: [
          { id: 1, pattern: 'paypal', category: 'Shopping', priority: 1000, createdAt: '' },
          { id: 2, pattern: 'paypal inst xfer godaddy', category: 'Subscriptions', priority: 1000, createdAt: '' }
        ]
      };
      expect(categorize('PAYPAL DES:INST XFER ID:GODADDY.COM INDN:DANIEL LLC', 'paypal inst xfer godaddy com daniel llc', undefined, ctx)).toBe('Subscriptions');
    });

    it('does not match pattern inside a longer word', () => {
      const ctx = {
        rules: [
          { id: 1, pattern: 'mobil', category: 'Transportation', priority: 100, createdAt: '' },
          { id: 2, pattern: 'ep', category: 'Shopping', priority: 1000, createdAt: '' }
        ]
      };
      // 'mobile' should not match 'mobil'
      expect(categorize('RACETRAC 1234 MOBILE PURCHASE CANTON GA', 'racetrac canton', undefined, ctx)).toBe('Uncategorized');
      // 'dep' should not match 'ep'
      expect(categorize('OPENGOV INC DES:DIRECT DEP ID:123', 'opengov inc', undefined, ctx)).toBe('Uncategorized');
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
    it('infers positive credit amounts as Transfers across any credit card account or payment description', () => {
      expect(inferTypeCategory(150.00, 'chase', undefined)).toBe('Transfers');
      expect(inferTypeCategory(20.00, 'boa-credit', undefined)).toBe('Transfers');
      expect(inferTypeCategory(320.00, 'simplefin', undefined, 'credit')).toBe('Transfers');
      expect(inferTypeCategory(410.00, 'custom', undefined, 'checking', 'AMEX EPAYMENT ACH')).toBe('Transfers');
    });

    it('returns null for credit charges or checking deposits', () => {
      expect(inferTypeCategory(-50.00, 'chase', undefined)).toBeNull();
      expect(inferTypeCategory(-80.00, 'simplefin', undefined, 'credit')).toBeNull();
      expect(inferTypeCategory(1500.00, 'boa-checking', undefined)).toBeNull();
      expect(inferTypeCategory(2500.00, 'simplefin', undefined, 'checking', 'GUSTO PAY 123456')).toBeNull();
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

    it('updates user overridden transactions if a user rule (priority >= 1000) explicitly matches', async () => {
      rulesData.push({ id: 1, pattern: 'Racetrac', category: 'Gas Station', priority: 1000, createdAt: '' });
      transactionsData.push(
        { id: 103, description: 'Racetrac Tucker', category: 'Transportation', userOverridden: true }
      );

      const result = await recategorizeAll();
      expect(result.updated).toBe(1);
      expect(transactionsData[0].category).toBe('Gas Station');
    });

    it('reports progress via onProgress callback', async () => {
      rulesData.push({ id: 1, pattern: 'Netflix', category: 'Subscriptions', priority: 1, createdAt: '' });
      transactionsData.push({ id: 104, description: 'Netflix monthly', category: 'Uncategorized', userOverridden: false });

      const progressReports: any[] = [];
      await recategorizeAll({
        onProgress: (p) => progressReports.push(p),
      });

      expect(progressReports.length).toBeGreaterThan(0);
      expect(progressReports[0].phase).toContain('Loading');
      expect(progressReports[progressReports.length - 1].percent).toBe(100);
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

  describe('deriveRulePattern', () => {
    it('cleans messy merchant strings to their core brand', () => {
      expect(deriveRulePattern('THE HOME DEPOT #0 08/23 MOBILE PURCHASE DECATUR GA')).toBe('the home depot');
      expect(deriveRulePattern('the_home_depot')).toBe('the home depot');
      expect(deriveRulePattern('RACETRAC 75 01/03 MOBILE PURCHASE CANTON GA')).toBe('racetrac');
      expect(deriveRulePattern('racetrac canton')).toBe('racetrac');
      expect(deriveRulePattern('CHEVRON 0352024 04/06 MOBILE PURCHASE EUFAULA AL')).toBe('chevron');
      expect(deriveRulePattern('DUNKIN #304875 Q3 08/12 MOBILE PURCHASE DUNWOODY GA')).toBe('dunkin');
      expect(deriveRulePattern('Xero US INV-6175 DES:Xero US IN ID:ST-M8P0D0U2G6E6 INDN:WEBTIME CO ID:1800948598 WEB')).toBe('xero');
      expect(deriveRulePattern('THE CORNER CU 05/31 MOBILE')).toBe('the corner');
      expect(deriveRulePattern('THE UPS STORE 223 05/29 MOBILE PURCHASE ALPHARETTA GA')).toBe('the ups store');
    });
  });

  describe('underscore pattern matching', () => {
    it('matches rules with underscores against bank descriptions with spaces', () => {
      const ctx = {
        rules: [
          { id: 1, pattern: 'the_home_depot', category: 'Housing', priority: 100, createdAt: '' },
          { id: 2, pattern: 'circle_k', category: 'Gas Station', priority: 100, createdAt: '' },
        ]
      };
      expect(categorize('THE HOME DEPOT #0 DECATUR GA', 'the home depot decatur', undefined, ctx)).toBe('Housing');
      expect(categorize('CIRCLE K 123 ATLANTA', 'circle k atlanta', undefined, ctx)).toBe('Gas Station');
    });
  });
});

