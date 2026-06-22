import { describe, it, expect, vi } from 'vitest';
import { generateBalanceSheetData, generateLedgerData, generateExpenseSummaryData } from './pnlGenerator';

const accountsData = [
  { id: 1, name: 'Checking Account', type: 'checking' as const, institution: 'Demo Bank', enabled: true, currentBalance: 5000.00, source: 'demo' as const },
  { id: 2, name: 'Credit Card', type: 'credit' as const, institution: 'Demo Bank', enabled: true, currentBalance: -1200.00, source: 'demo' as const }
];

const transactionsData = [
  { id: 101, accountId: 1, date: '2026-03-01', description: 'Consulting Income', amount: 3000.00, category: 'Income', isBusiness: true, deductionStatus: 'confirmed' as const, source: 'demo' as const, userOverridden: true, dedupKey: 'k1', recurrence: 'onetime' as const },
  { id: 102, accountId: 2, date: '2026-03-02', description: 'AWS Hosting', amount: -200.00, category: 'Utilities', isBusiness: true, taxCategory: 'officeExpense', deductionStatus: 'confirmed' as const, source: 'demo' as const, userOverridden: true, dedupKey: 'k2', recurrence: 'onetime' as const },
  { id: 103, accountId: 2, date: '2026-03-03', description: 'Business Lunch', amount: -100.00, category: 'Restaurants & Coffee', isBusiness: true, taxCategory: 'meals', deductionStatus: 'confirmed' as const, source: 'demo' as const, userOverridden: true, dedupKey: 'k3', recurrence: 'onetime' as const },
  { id: 104, accountId: 2, date: '2026-06-15', description: 'Post-period charge', amount: -50.00, category: 'Shopping', isBusiness: false, source: 'demo' as const, userOverridden: true, dedupKey: 'k4', recurrence: 'onetime' as const }
];

vi.mock('./db', () => {
  return {
    db: {
      accounts: {
        toArray: async () => [...accountsData]
      },
      transactions: {
        toArray: async () => [...transactionsData]
      },
      categories: {
        toArray: async () => [
          { name: 'Income', type: 'income' },
          { name: 'Utilities', type: 'spend' },
          { name: 'Restaurants & Coffee', type: 'spend' },
          { name: 'Shopping', type: 'spend' }
        ]
      },
      settings: {
        get: async (key: string) => {
          if (key === 'app:taxSettings') {
            return { value: { hasBusiness: true } };
          }
          return null;
        }
      }
    }
  };
});

vi.mock('./dataStore', () => {
  return {
    useDataStore: {
      getState: () => ({
        isInitialized: false,
        accounts: [...accountsData],
        transactions: [...transactionsData],
        categories: [
          { name: 'Income', type: 'income' },
          { name: 'Utilities', type: 'spend' },
          { name: 'Restaurants & Coffee', type: 'spend' },
          { name: 'Shopping', type: 'spend' }
        ]
      })
    }
  };
});

describe('Document Generators', () => {
  it('generateBalanceSheetData correctly computes Assets, Liabilities, and Equity', async () => {
    const params = {
      start: '2026-01-01',
      end: '2026-03-31',
      resolvedAccts: [1, 2],
      markdownDocId: 'doc-md-id',
      spreadsheetDocId: 'doc-csv-id'
    };

    const res = await generateBalanceSheetData(params);
    expect(res.balanceSheetMarkdown).toContain('# Balance Sheet');
    // Balance at end calculation should add back the -50.00 post-period charge to the Credit Card currentBalance of -1200.00
    // CC balance before transaction = -1200 - (-50) = -1150.00
    // Math.abs(CC balance) = 1150.00
    expect(res.balanceSheetMarkdown).toContain('$1150.00');
    // Net Income = 3000 (Income) - 200 (Office Expense) - (100 * 50% meals deduction) = 3000 - 200 - 50 = 2750.00
    expect(res.balanceSheetMarkdown).toContain('$2750.00');
  });

  it('generateLedgerData retrieves chronological transaction entries', async () => {
    const params = {
      start: '2026-01-01',
      end: '2026-03-31',
      resolvedAccts: [1, 2],
      markdownDocId: 'doc-md-id',
      spreadsheetDocId: 'doc-csv-id'
    };

    const res = await generateLedgerData(params);
    expect(res.ledgerMarkdown).toContain('# General Ledger');
    expect(res.ledgerMarkdown).toContain('AWS Hosting');
    expect(res.ledgerMarkdown).toContain('Business Lunch');
    // It should exclude post-period transaction (since end is 2026-03-31 and post-period is 2026-06-15)
    expect(res.ledgerMarkdown).not.toContain('Post-period charge');
  });

  it('generateExpenseSummaryData aggregates verified business deductions', async () => {
    const params = {
      start: '2026-01-01',
      end: '2026-03-31',
      resolvedAccts: [1, 2],
      markdownDocId: 'doc-md-id',
      spreadsheetDocId: 'doc-csv-id'
    };

    const res = await generateExpenseSummaryData(params);
    expect(res.summaryMarkdown).toContain('# Business Expense & Deduction Summary');
    // AWS Hosting = 200.00 (Office Expense & Software)
    expect(res.summaryMarkdown).toContain('$200.00');
    // Business Lunch = 100 * 50% = 50.00
    expect(res.summaryMarkdown).toContain('$50.00');
  });
});
