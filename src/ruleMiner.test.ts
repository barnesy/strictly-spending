/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mineRuleSuggestions } from './ruleMiner';
import { db } from './db';

vi.mock('./db', () => ({
  db: {
    rules: {
      toArray: vi.fn(),
    },
    transactions: {
      toArray: vi.fn(),
    },
  },
}));

describe('mineRuleSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array if no transactions are overridden', async () => {
    vi.mocked(db.transactions.toArray).mockResolvedValue([
      { id: 1, description: 'Uber Trip', category: 'Uncategorized', userOverridden: false, merchantKey: 'Uber' } as any,
    ]);
    vi.mocked(db.rules.toArray).mockResolvedValue([]);

    const suggestions = await mineRuleSuggestions();
    expect(suggestions).toEqual([]);
  });

  it('suggests rules for keys with at least 2 overrides and no matching rule', async () => {
    vi.mocked(db.transactions.toArray).mockResolvedValue([
      { id: 1, description: 'Uber Trip A', category: 'Transportation', userOverridden: true, merchantKey: 'Uber' } as any,
      { id: 2, description: 'Uber Trip B', category: 'Transportation', userOverridden: true, merchantKey: 'Uber' } as any,
      { id: 3, description: 'Netflix Card', category: 'Subscriptions', userOverridden: true, merchantKey: 'Netflix' } as any, // Only 1 override
    ]);
    vi.mocked(db.rules.toArray).mockResolvedValue([]);

    const suggestions = await mineRuleSuggestions();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      pattern: 'uber',
      category: 'Transportation',
      overridesCount: 2,
      sampleDescription: 'Uber Trip A',
    });
  });

  it('filters out candidates that match existing rules', async () => {
    vi.mocked(db.transactions.toArray).mockResolvedValue([
      { id: 1, description: 'Uber Trip A', category: 'Transportation', userOverridden: true, merchantKey: 'Uber' } as any,
      { id: 2, description: 'Uber Trip B', category: 'Transportation', userOverridden: true, merchantKey: 'Uber' } as any,
      { id: 3, description: 'Netflix Card A', category: 'Subscriptions', userOverridden: true, merchantKey: 'Netflix' } as any,
      { id: 4, description: 'Netflix Card B', category: 'Subscriptions', userOverridden: true, merchantKey: 'Netflix' } as any,
    ]);
    // There is an existing rule for Uber
    vi.mocked(db.rules.toArray).mockResolvedValue([
      { id: 101, pattern: 'Uber', category: 'Transportation', priority: 1, createdAt: '' },
    ]);

    const suggestions = await mineRuleSuggestions();
    // Only Netflix should be suggested, Uber is skipped
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].pattern).toBe('netflix');
  });
});
