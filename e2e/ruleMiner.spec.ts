import { test, expect } from './test';

test.beforeEach(async ({ tauriPage }) => {
  await tauriPage.waitForFunction('window.__TEST_API__ !== undefined');
  await tauriPage.evaluate(`(async () => {
    const { db, schema } = window.__TEST_API__;
    await db.delete(schema.transactions);
    await db.delete(schema.rules);
  })()`);
});

test('returns empty array if no transactions are overridden', async ({ tauriPage }) => {
  const suggestions = await tauriPage.evaluate(`(async () => {
    const { db, schema, mineRuleSuggestions } = window.__TEST_API__;
    await db.insert(schema.transactions).values([
      { id: '1', accountId: 0, date: '2023-01-01', description: 'Uber Trip', amount: 10, category: 'Uncategorized', userOverridden: false, merchantKey: 'Uber', source: 'demo', rawCategory: '', recurrence: 'onetime', dedupKey: 'dedup1' }
    ]);
    return await mineRuleSuggestions();
  })()`);
  expect(suggestions).toEqual([]);
});

test('suggests rules for keys with at least 2 overrides and no matching rule', async ({ tauriPage }) => {
  const suggestions = await tauriPage.evaluate(`(async () => {
    const { db, schema, mineRuleSuggestions } = window.__TEST_API__;
    await db.insert(schema.transactions).values([
      { id: '1', accountId: 0, date: '2023-01-01', description: 'Uber Trip A', amount: 10, category: 'Transportation', userOverridden: true, merchantKey: 'Uber', source: 'demo', rawCategory: '', recurrence: 'onetime', dedupKey: 'dedup1' },
      { id: '2', accountId: 0, date: '2023-01-02', description: 'Uber Trip B', amount: 12, category: 'Transportation', userOverridden: true, merchantKey: 'Uber', source: 'demo', rawCategory: '', recurrence: 'onetime', dedupKey: 'dedup2' },
      { id: '3', accountId: 0, date: '2023-01-03', description: 'Netflix Card', amount: 15, category: 'Subscriptions', userOverridden: true, merchantKey: 'Netflix', source: 'demo', rawCategory: '', recurrence: 'recurring', dedupKey: 'dedup3' },
    ]);
    return await mineRuleSuggestions();
  })()`);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0]).toEqual({
    pattern: 'uber',
    category: 'Transportation',
    overridesCount: 2,
    sampleDescription: 'Uber Trip A',
  });
});

test('filters out candidates that match existing rules', async ({ tauriPage }) => {
  const suggestions = await tauriPage.evaluate(`(async () => {
    const { db, schema, mineRuleSuggestions } = window.__TEST_API__;
    await db.insert(schema.transactions).values([
      { id: '1', accountId: 0, date: '2023-01-01', description: 'Uber Trip A', amount: 10, category: 'Transportation', userOverridden: true, merchantKey: 'Uber', source: 'demo', rawCategory: '', recurrence: 'onetime', dedupKey: 'dedup1' },
      { id: '2', accountId: 0, date: '2023-01-02', description: 'Uber Trip B', amount: 12, category: 'Transportation', userOverridden: true, merchantKey: 'Uber', source: 'demo', rawCategory: '', recurrence: 'onetime', dedupKey: 'dedup2' },
      { id: '3', accountId: 0, date: '2023-01-03', description: 'Netflix Card A', amount: 15, category: 'Subscriptions', userOverridden: true, merchantKey: 'Netflix', source: 'demo', rawCategory: '', recurrence: 'recurring', dedupKey: 'dedup3' },
      { id: '4', accountId: 0, date: '2023-02-03', description: 'Netflix Card B', amount: 15, category: 'Subscriptions', userOverridden: true, merchantKey: 'Netflix', source: 'demo', rawCategory: '', recurrence: 'recurring', dedupKey: 'dedup4' },
    ]);
    await db.insert(schema.rules).values([
      { id: 101, pattern: 'uber', category: 'Transportation', priority: 1, createdAt: '' }
    ]);
    return await mineRuleSuggestions();
  })()`);
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0].pattern).toBe('netflix');
});
