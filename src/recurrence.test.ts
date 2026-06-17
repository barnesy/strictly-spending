import { describe, it, expect } from 'vitest';
import { resolveRecurrenceForTransaction } from './recurrence';
import type { Category, MerchantOverride, Transaction } from './types';

describe('Recurrence Resolution Hierarchy', () => {
  const categoryMap = new Map<string, Category>([
    ['Subscriptions', { id: 1, name: 'Subscriptions', color: '#fff', type: 'spend', sortOrder: 1, defaultRecurrence: 'recurring' }],
    ['Groceries', { id: 2, name: 'Groceries', color: '#fff', type: 'spend', sortOrder: 2, defaultRecurrence: 'onetime' }]
  ]);

  const merchantOverrideMap = new Map<string, MerchantOverride>([
    ['netflix', { merchantKey: 'netflix', recurrence: 'monthly' }],
    ['amazon', { merchantKey: 'amazon', recurrence: 'none' }]
  ]);

  const autoRecurringMerchantKeys = new Set<string>(['spotify']);

  const baseTxn: Omit<Transaction, 'id' | 'recurrence'> = {
    accountId: 1,
    date: '2026-06-01',
    description: 'Generic Charge',
    amount: -10,
    category: 'Groceries',
    source: 'chase',
    merchantKey: 'generic',
    userOverridden: false,
    dedupKey: 'd-1'
  };

  it('resolves to transaction-level override if present', () => {
    // 1. Transaction is forced to recurring even if category/merchant say one-time
    const txn1 = {
      ...baseTxn,
      recurrenceOverride: 'recurring' as const,
      category: 'Groceries',
      merchantKey: 'amazon'
    };
    expect(resolveRecurrenceForTransaction(txn1, categoryMap, merchantOverrideMap, autoRecurringMerchantKeys)).toBe('recurring');

    // 2. Transaction is forced to one-time even if category/merchant say recurring
    const txn2 = {
      ...baseTxn,
      recurrenceOverride: 'onetime' as const,
      category: 'Subscriptions',
      merchantKey: 'netflix'
    };
    expect(resolveRecurrenceForTransaction(txn2, categoryMap, merchantOverrideMap, autoRecurringMerchantKeys)).toBe('onetime');
  });

  it('resolves to merchant override if no transaction override is present', () => {
    // 1. Merchant override says monthly (recurring)
    const txn1 = {
      ...baseTxn,
      category: 'Groceries', // defaults to onetime
      merchantKey: 'netflix' // defaults to monthly (recurring)
    };
    expect(resolveRecurrenceForTransaction(txn1, categoryMap, merchantOverrideMap, autoRecurringMerchantKeys)).toBe('recurring');

    // 2. Merchant override says none (onetime)
    const txn2 = {
      ...baseTxn,
      category: 'Subscriptions', // defaults to recurring
      merchantKey: 'amazon' // defaults to none (onetime)
    };
    expect(resolveRecurrenceForTransaction(txn2, categoryMap, merchantOverrideMap, autoRecurringMerchantKeys)).toBe('onetime');
  });

  it('resolves to category default if no transaction or merchant override is present', () => {
    // 1. Category defaults to recurring
    const txn1 = {
      ...baseTxn,
      category: 'Subscriptions',
      merchantKey: 'unknown'
    };
    expect(resolveRecurrenceForTransaction(txn1, categoryMap, merchantOverrideMap, autoRecurringMerchantKeys)).toBe('recurring');

    // 2. Category defaults to onetime
    const txn2 = {
      ...baseTxn,
      category: 'Groceries',
      merchantKey: 'unknown'
    };
    expect(resolveRecurrenceForTransaction(txn2, categoryMap, merchantOverrideMap, autoRecurringMerchantKeys)).toBe('onetime');
  });

  it('resolves to auto-detection fallback if no higher override is present', () => {
    // 1. Merchant is in autoRecurring set
    const txn1 = {
      ...baseTxn,
      category: 'Groceries', // defaults to onetime
      merchantKey: 'spotify' // in autoRecurring set
    };
    expect(resolveRecurrenceForTransaction(txn1, categoryMap, merchantOverrideMap, autoRecurringMerchantKeys)).toBe('recurring');

    // 2. Merchant is not in autoRecurring set and category is onetime
    const txn2 = {
      ...baseTxn,
      category: 'Groceries',
      merchantKey: 'unknown'
    };
    expect(resolveRecurrenceForTransaction(txn2, categoryMap, merchantOverrideMap, autoRecurringMerchantKeys)).toBe('onetime');
  });
});
