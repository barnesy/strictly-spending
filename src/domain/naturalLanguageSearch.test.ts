import { describe, it, expect } from 'vitest';
import { parseNaturalLanguageSearch } from './naturalLanguageSearch';
import type { Account, Category } from '../types';

const mockAccounts: Account[] = [
  { id: 1, name: 'Bank of America Checking', type: 'checking', institution: 'Bank of America', last4: '1122', source: 'simplefin', enabled: true },
  { id: 2, name: 'BoA Customized Cash Rewards', type: 'credit', institution: 'Bank of America', last4: '6669', source: 'simplefin', enabled: true },
  { id: 3, name: 'Truist Savings', type: 'savings', institution: 'Truist', last4: '4455', source: 'simplefin', enabled: true },
  { id: 4, name: 'WEBTIME LLC Business Adv', type: 'checking', institution: 'Bank of America', last4: '8899', source: 'simplefin', enabled: true },
  { id: 5, name: 'Fidelity 401(k)', type: 'investment', institution: 'Fidelity', source: 'simplefin', enabled: true },
];

const mockCategories: Category[] = [
  { id: 1, name: 'Groceries', color: '#4caf50', type: 'spend', sortOrder: 10 },
  { id: 2, name: 'Restaurants & Coffee', color: '#ff7043', type: 'spend', sortOrder: 20 },
  { id: 3, name: 'Transportation', color: '#5c6bc0', type: 'spend', sortOrder: 30 },
  { id: 4, name: 'Auto Loan', color: '#3949ab', type: 'spend', sortOrder: 35 },
  { id: 5, name: 'Utilities', color: '#26a69a', type: 'spend', sortOrder: 40 },
  { id: 6, name: 'Subscriptions', color: '#ab47bc', type: 'spend', sortOrder: 50 },
  { id: 7, name: 'Housing', color: '#8d6e63', type: 'spend', sortOrder: 60 },
  { id: 8, name: 'Mortgage', color: '#6d4c41', type: 'spend', sortOrder: 65 },
  { id: 9, name: 'Shopping', color: '#ec407a', type: 'spend', sortOrder: 70 },
  { id: 10, name: 'Entertainment', color: '#ffa726', type: 'spend', sortOrder: 80 },
  { id: 11, name: 'Health', color: '#42a5f5', type: 'spend', sortOrder: 90 },
  { id: 12, name: 'Travel', color: '#66bb6a', type: 'spend', sortOrder: 110 },
  { id: 13, name: 'Income', color: '#2e7d32', type: 'income', sortOrder: 200 },
  { id: 14, name: 'Transfers', color: '#90a4ae', type: 'transfer', sortOrder: 210 },
  { id: 15, name: 'Uncategorized', color: '#9e9e9e', type: 'spend', sortOrder: 999 },
];

const refDate = new Date(2026, 9, 28); // Oct 28, 2026

describe('parseNaturalLanguageSearch', () => {
  it('handles simple merchant keyword search with no structured intents', () => {
    const res = parseNaturalLanguageSearch('starbucks', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.hasStructuredIntents).toBe(false);
    expect(res.remainingSearchQuery).toBe('starbucks');
  });

  it('parses category + date range + min price ("groceries last month over $50")', () => {
    const res = parseNaturalLanguageSearch('groceries last month over $50', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.hasStructuredIntents).toBe(true);
    expect(res.preset).toBe('lastMonth');
    expect(res.soloCategories).toEqual(['Groceries']);
    expect(res.minPrice).toBe(50);
    expect(res.remainingSearchQuery).toBe('');
    expect(res.viewMode).toBe('table');
  });

  it('parses merchant keyword + date range + price ("amazon purchases over $100 this year")', () => {
    const res = parseNaturalLanguageSearch('amazon purchases over $100 this year', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.hasStructuredIntents).toBe(true);
    expect(res.preset).toBe('ytd');
    expect(res.minPrice).toBe(100);
    expect(res.transactionType).toBe('spend');
    expect(res.remainingSearchQuery).toBe('amazon');
    expect(res.viewMode).toBe('table');
  });

  it('parses price range ("between $20 and $80 last 30 days")', () => {
    const res = parseNaturalLanguageSearch('between $20 and $80 last 30 days', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.preset).toBe('last30');
    expect(res.minPrice).toBe(20);
    expect(res.maxPrice).toBe(80);
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses multiple categories with synonyms ("dining and groceries this month")', () => {
    const res = parseNaturalLanguageSearch('dining and groceries this month', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.preset).toBe('thisMonth');
    expect(res.soloCategories).toEqual(expect.arrayContaining(['Restaurants & Coffee', 'Groceries']));
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses excluded categories ("spending this month without mortgage and housing")', () => {
    const res = parseNaturalLanguageSearch('spending this month without mortgage and housing', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.preset).toBe('thisMonth');
    expect(res.excludedCategories).toEqual(expect.arrayContaining(['Mortgage', 'Housing']));
    expect(res.soloCategories).toBeUndefined();
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses recurring bills on credit cards', () => {
    const res = parseNaturalLanguageSearch('recurring bills on credit cards', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.recurrenceFilter).toBe('recurring');
    expect(res.enabledAccountIds).toEqual([2]);
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses specific account by institution and last4 ("boa 6669 last month")', () => {
    const res = parseNaturalLanguageSearch('boa 6669 last month', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.enabledAccountIds).toEqual([2]);
    expect(res.preset).toBe('lastMonth');
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses income / paychecks and sets transactionType to income', () => {
    const res = parseNaturalLanguageSearch('paychecks last 90 days', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.transactionType).toBe('income');
    expect(res.spendOnly).toBe(false);
    expect(res.preset).toBe('last90');
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses sorting intents ("biggest purchases this month")', () => {
    const res = parseNaturalLanguageSearch('biggest purchases this month', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.sortBy).toBe('amount_desc');
    expect(res.preset).toBe('thisMonth');
    expect(res.viewMode).toBe('table');
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses chart view and group by account ("chart spending by account this year")', () => {
    const res = parseNaturalLanguageSearch('chart spending by account this year', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.viewMode).toBe('chart');
    expect(res.groupBy).toBe('account');
    expect(res.preset).toBe('ytd');
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses named month ("in march" -> March 2026)', () => {
    const res = parseNaturalLanguageSearch('travel in march', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.preset).toBe('custom');
    expect(res.customStart).toBe('2026-03-01');
    expect(res.customEnd).toBe('2026-03-31');
    expect(res.soloCategories).toEqual(['Travel']);
    expect(res.remainingSearchQuery).toBe('');
  });

  it('parses business profile ("business expenses this year")', () => {
    const res = parseNaturalLanguageSearch('business expenses this year', {
      accounts: mockAccounts,
      categories: mockCategories,
      referenceDate: refDate,
    });
    expect(res.profile).toBe('business');
    expect(res.enabledAccountIds).toEqual([4]);
    expect(res.preset).toBe('ytd');
  });
});
