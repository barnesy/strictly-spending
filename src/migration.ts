import Dexie from 'dexie';
import { invoke } from '@tauri-apps/api/core';

export async function runMigration() {
  // Check if we have already migrated (e.g., if SQLite has any accounts)
  const existingAccounts: any[] = await invoke('get_accounts');
  if (existingAccounts.length > 0) {
    console.log('Already migrated to SQLite');
    return;
  }

  console.log('Starting migration from IndexedDB to SQLite...');

  // Connect to the old IndexedDB
  const oldDb = new Dexie('spending-viz');
  oldDb.version(13).stores({
    accounts: '++id, &name, source',
    transactions: '++id, accountId, date, category, source, merchantKey, &dedupKey, importBatchId, recurrence, isBusiness, deductionStatus',
    rules: '++id, pattern, category, priority',
    categories: '++id, &name, type, sortOrder',
    imports: '++id, importedAt, contentHash',
    merchantOverrides: '&merchantKey',
    budgets: '&category',
    settings: '&key',
    artifacts: 'id, type, createdAt',
    threads: 'id, title, createdAt, updatedAt',
    messages: '++id, threadId, role, createdAt',
    csvMappings: '++id, &headerHash',
    documents: 'id, associatedChecklistId, createdAt',
    documentContents: 'id',
    taxRules: '++id, pattern, priority',
    loans: '++id, name, type',
  });

  try {
    const isReady = await oldDb.open().then(() => true).catch(() => false);
    if (!isReady) return;

    // Accounts
    const accounts = await oldDb.table('accounts').toArray();
    for (const acc of accounts) {
      try { await invoke('add_account', { item: acc }); } catch (e) { console.log('Account exists', e); }
    }

    // Categories
    const categories = await oldDb.table('categories').toArray();
    for (const cat of categories) {
      try { await invoke('add_category', { item: cat }); } catch (e) { console.log('Category exists', e); }
    }

    // Merchant Overrides
    const overrides = await oldDb.table('merchantOverrides').toArray();
    for (const over of overrides) {
      await invoke('put_merchant_override', { item: over });
    }

    // Budgets
    const budgets = await oldDb.table('budgets').toArray();
    const cleanBudgets = budgets.map(b => ({
      category: String(b.category),
      monthlyAmount: Number(b.monthlyAmount) || 0,
      userSet: Boolean(b.userSet)
    }));
    await invoke('bulk_put_budgets', { budgets: cleanBudgets });

    // Rules
    const rules = await oldDb.table('rules').toArray();
    for (const rule of rules) {
      try { await invoke('add_rule', { item: rule }); } catch (e) { console.log('Rule exists', e); }
    }

    // Transactions (bulk insert to avoid blocking UI too long, but we'll do sequentially for simplicity right now)
    const txns = await oldDb.table('transactions').toArray();
    const batchSize = 1000;
    for (let i = 0; i < txns.length; i += batchSize) {
      const batch = txns.slice(i, i + batchSize);
      await Promise.all(batch.map(tx => invoke('add_transaction', { item: tx }).catch(e => console.log('Txn exists', e))));
    }

    // Imports
    const imports = await oldDb.table('imports').toArray();
    for (const imp of imports) { 
      try { await invoke('add_import', { item: imp }); } catch (e) { console.log('Import exists', e); } 
    }

    // Settings
    const settings = await oldDb.table('settings').toArray();
    for (const s of settings) { await invoke('put_setting', { item: { key: s.key, value: s.value } }); }

    // Artifacts
    const artifacts = await oldDb.table('artifacts').toArray();
    for (const a of artifacts) { await invoke('put_artifact', { item: a }); }

    // Threads
    const threads = await oldDb.table('threads').toArray();
    for (const t of threads) { await invoke('put_thread', { item: t }); }

    // Messages
    const messages = await oldDb.table('messages').toArray();
    for (const m of messages) { await invoke('put_message', { item: m }); }

    // CsvMappings
    const csvMappings = await oldDb.table('csvMappings').toArray();
    for (const c of csvMappings) { await invoke('put_csv_mapping', { item: c }); }

    // Documents
    const documents = await oldDb.table('documents').toArray();
    for (const d of documents) { await invoke('put_document', { item: d }); }

    // DocumentContents
    const documentContents = await oldDb.table('documentContents').toArray();
    for (const dc of documentContents) { await invoke('put_document_content', { item: dc }); }

    // TaxRules
    const taxRules = await oldDb.table('taxRules').toArray();
    for (const tr of taxRules) { await invoke('put_tax_rule', { item: tr }); }

    // Loans
    const loans = await oldDb.table('loans').toArray();
    for (const l of loans) { await invoke('put_loan', { item: l }); }

    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
  }
}
