import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryDataTool } from '../QueryDataTool';
import { setupTestDb, createMockContext } from './setup';

// Global variable to hold our mocked test DB
let currentTestDb: any;

vi.mock('../../../db/drizzle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../db/drizzle')>();
  return {
    ...actual,
    get db() {
      return currentTestDb;
    }
  };
});

describe('QueryDataTool', () => {
  let sqlite: any;

  beforeEach(() => {
    const setup = setupTestDb();
    currentTestDb = setup.db;
    sqlite = setup.sqlite;

    // Seed test data
    sqlite.exec(`
      INSERT INTO transactions (account_id, date, description, amount, category, source, merchant_key, dedup_key, recurrence)
      VALUES 
      (1, '2026-05-10', 'Delta Airlines', -500.0, 'Travel', 'plaid', 'delta', 't1', 'onetime'),
      (1, '2026-05-15', 'Amazon', -100.0, 'Shopping', 'plaid', 'amazon', 't2', 'onetime'),
      (2, '2026-06-01', 'Electric Bill', -150.0, 'Utilities', 'plaid', 'coned', 't3', 'recurring');
    `);
  });

  it('generates correct SQL and calculates sum', async () => {
    const tool = new QueryDataTool();
    const context = createMockContext();
    
    const actionObj = {
      action: 'query_data',
      preset: 'custom',
      customStart: '2026-01-01',
      customEnd: '2026-06-30',
      categories: ['Travel', 'Shopping']
    };

    const result = await tool.execute(actionObj, context);
    
    expect(result.feedbackError).toBeUndefined();
    expect(result.systemResultsMsg).toContain('Total Spent: $600.00');
    expect(result.systemResultsMsg).toContain('Number of Transactions: 2');
    expect(result.systemResultsMsg).toContain('| Travel | $500.00 |');
    expect(result.systemResultsMsg).toContain('| Shopping | $100.00 |');
  });

  it('calculates averages correctly without crashing on Drizzle template interpolations', async () => {
    const tool = new QueryDataTool();
    const context = createMockContext();
    
    const actionObj = {
      action: 'query_data',
      preset: 'custom',
      customStart: '2026-01-01',
      customEnd: '2026-12-31',
      categories: ['Utilities']
    };

    const result = await tool.execute(actionObj, context);
    
    expect(result.feedbackError).toBeUndefined();
    expect(result.systemResultsMsg).toContain('Total Spent: $150.00');
  });
});
