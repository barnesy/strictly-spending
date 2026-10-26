import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPreview,
  commitPreview,
  updatePreviewAccount,
  updatePreviewAccountMapping,
  findBestMatchingAccount,
} from './import';
import { api } from '../api';

const rulesData: any[] = [];
const transactionsData: any[] = [];
const accountsData: any[] = [];
const importsData: any[] = [];
const csvMappingsData: any[] = [];
const categoriesData: any[] = [{ name: 'Groceries' }, { name: 'Utilities' }];
let licenseSetting: any = { active: false };

vi.mock('../api', () => ({
  api: {
    getRules: async () => [...rulesData],
    getTaxRules: async () => [],
    getTransactions: async () => [...transactionsData],
    bulkAddTransactions: async (txns: any[]) => {
      transactionsData.push(...txns);
    },
    updateTransaction: async (id: number, updates: any) => {
      const t = transactionsData.find(x => x.id === id);
      if (t) Object.assign(t, updates);
    },
    getAccounts: async () => [...accountsData],
    addAccount: async (a: any) => {
      const newAcc = { ...a, id: accountsData.length + 1 };
      accountsData.push(newAcc);
      return newAcc.id;
    },
    updateAccount: async (id: number, patch: any) => {
      const acc = accountsData.find(a => a.id === id);
      if (acc) {
        Object.assign(acc, patch);
      }
    },
    addImport: async (imp: any) => {
      const newImp = { ...imp, id: importsData.length + 1 };
      importsData.push(newImp);
      return newImp.id;
    },
    getImports: async () => [...importsData],
    getCategories: async () => [...categoriesData],
    getMerchantOverrides: async () => [],
    getCsvMappings: async () => [...csvMappingsData],
    addCsvMapping: async (m: any) => {
      const newMapping = { ...m, id: csvMappingsData.length + 1 };
      csvMappingsData.push(newMapping);
      return newMapping.id;
    },
    getSetting: async (key: string) => {
      if (key === 'license') return licenseSetting;
      return null;
    }
  }
}));

vi.mock('./recurrence', () => ({
  refreshRecurrenceAll: async () => {}
}));

describe('CSV Import Engine', () => {
  beforeEach(() => {
    rulesData.length = 0;
    transactionsData.length = 0;
    accountsData.length = 0;
    importsData.length = 0;
    csvMappingsData.length = 0;
    licenseSetting = { active: false };
    vi.clearAllMocks();
  });

  const chaseCsvSample = `Card Member,Transaction Date,Post Date,Description,Category,Type,Amount,Memo
JOHN DOE,05/22/2026,05/23/2026,Payment Thank You - Web,Food,Payment,540.82,
JOHN DOE,05/21/2026,05/22/2026,YouTube Premium Membership,Bills & Utilities,Sale,-14.99,`;

  describe('buildPreview', () => {
    it('creates preview showing total count, new count and classifications', async () => {
      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', chaseCsvSample);
      expect(preview.error).toBeUndefined();
      expect(preview.source).toBe('chase');
      expect(preview.totalCount).toBe(2);
      expect(preview.newCount).toBe(2);
      expect(preview.duplicateCount).toBe(0);
      expect(preview.rows[0].parsed.amount).toBe(540.82);
      expect(preview.rows[1].parsed.amount).toBe(-14.99);
      expect(preview.rows[1].category).toBe('Utilities'); // Mapped via Chase default Category rule
    });

    it('identifies duplicate transactions against committed database records', async () => {
      // Add existing transaction to mock DB matching first row's dedupKey
      // Bucket structure: Chase 1234|2026-05-22|540.82|payment thank you - web|0
      transactionsData.push({
        dedupKey: 'Chase 1234|2026-05-22|540.82|payment thank you - web|0'
      });

      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', chaseCsvSample);
      expect(preview.totalCount).toBe(2);
      expect(preview.newCount).toBe(1);
      expect(preview.duplicateCount).toBe(1);
      expect(preview.rows[0].duplicate).toBe(true);
      expect(preview.rows[1].duplicate).toBe(false);
    });

    it('handles intra-batch duplicates with progressive seq identifiers', async () => {
      // Sample has two identical transactions on the same day
      const doubleSample = `Card Member,Transaction Date,Post Date,Description,Category,Type,Amount,Memo
JOHN DOE,05/22/2026,05/23/2026,Netflix Card,Subscriptions,Sale,-15.00,
JOHN DOE,05/22/2026,05/23/2026,Netflix Card,Subscriptions,Sale,-15.00,`;

      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', doubleSample);
      expect(preview.totalCount).toBe(2);
      expect(preview.newCount).toBe(2);
      expect(preview.duplicateCount).toBe(0);
      expect(preview.rows[0].dedupKey).toBe('Chase 1234|2026-05-22|-15.00|netflix card|0');
      expect(preview.rows[1].dedupKey).toBe('Chase 1234|2026-05-22|-15.00|netflix card|1');
    });
  });

  describe('commitPreview', () => {
    it('saves batch, auto-creates accounts, and bulk inserts new transactions', async () => {
      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', chaseCsvSample);
      
      const commitRes = await commitPreview(preview);
      expect(commitRes.imported).toBe(2);
      expect(commitRes.skippedDuplicates).toBe(0);
      expect(importsData.length).toBe(1);
      expect(accountsData.length).toBe(1);
      expect(accountsData[0].name).toBe('Chase 1234');
      expect(transactionsData.length).toBe(2);
    });

    it('skips duplicate rows in the batch during database commit', async () => {
      // Populate database with one duplicate matching row 0
      transactionsData.push({
        dedupKey: 'Chase 1234|2026-05-22|540.82|payment thank you - web|0'
      });

      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', chaseCsvSample);
      const commitRes = await commitPreview(preview);
      expect(commitRes.imported).toBe(1);
      expect(commitRes.skippedDuplicates).toBe(1);
      expect(transactionsData.length).toBe(2); // Initial 1 + Imported 1 = 2
    });

    it('commits transactions directly into selected targetAccountId', async () => {
      accountsData.push({
        id: 99,
        name: 'My Preferred Checking',
        institution: 'Community Bank',
        type: 'checking',
        source: 'custom',
        enabled: true,
      });

      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', chaseCsvSample);
      const updatedPreview = await updatePreviewAccount(preview, {
        id: 99,
        name: 'My Preferred Checking',
        institution: 'Community Bank',
        type: 'checking',
      });

      expect(updatedPreview.targetAccountId).toBe(99);
      expect(updatedPreview.targetAccountName).toBe('My Preferred Checking');
      expect(updatedPreview.rows[0].parsed.accountName).toBe('My Preferred Checking');
      expect(updatedPreview.rows[0].dedupKey).toContain('My Preferred Checking|2026-05-22|540.82');

      const commitRes = await commitPreview(updatedPreview);
      expect(commitRes.imported).toBe(2);
      expect(transactionsData.every(t => t.accountId === 99)).toBe(true);
      // Ensure we did not create another account
      expect(accountsData.length).toBe(1);
    });
  });

  describe('updatePreviewAccount', () => {
    it('recalculates dedup keys and duplicate counts against existing transactions of the target account', async () => {
      // Existing transaction in target account
      transactionsData.push({
        dedupKey: 'Target Credit|2026-05-22|540.82|payment thank you - web|0'
      });

      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', chaseCsvSample);
      // Initially, 0 duplicates because Chase 1234 has no transactions
      expect(preview.duplicateCount).toBe(0);
      expect(preview.newCount).toBe(2);

      const switched = await updatePreviewAccount(preview, {
        id: 15,
        name: 'Target Credit',
        institution: 'Target Bank',
        type: 'credit',
      });

      expect(switched.targetAccountId).toBe(15);
      expect(switched.targetAccountName).toBe('Target Credit');
      expect(switched.duplicateCount).toBe(1);
      expect(switched.newCount).toBe(1);
      expect(switched.rows[0].duplicate).toBe(true);
      expect(switched.rows[1].duplicate).toBe(false);
    });
  });

  describe('Custom CSV Mapped Import', () => {
    const customCsvText = `TxnDate,Merchant,TotalAmount,Balance\n06/15/2026,Coffee Shop,-4.50,100.00\n06/16/2026,Salary,2500.00,2600.00`;

    it('returns requiresMapping: true when layout is unrecognized', async () => {
      const preview = await buildPreview('statement_9999.csv', customCsvText);
      expect(preview.requiresMapping).toBe(true);
      expect(preview.headers).toEqual(['TxnDate', 'Merchant', 'TotalAmount', 'Balance']);
      expect(preview.rawText).toBe(customCsvText);
    });

    it('parses correctly once mapping is saved to DB', async () => {
      // Pre-add custom mapping to mock DB
      csvMappingsData.push({
        name: 'Test Union',
        headerHash: 'TxnDate,Merchant,TotalAmount,Balance',
        headers: ['TxnDate', 'Merchant', 'TotalAmount', 'Balance'],
        dateColumn: 'TxnDate',
        descriptionColumn: 'Merchant',
        amountColumn: 'TotalAmount',
        balanceColumn: 'Balance',
        accountName: 'My Savings',
        accountType: 'savings',
        institution: 'Union Bank',
      });

      const preview = await buildPreview('statement_9999.csv', customCsvText);
      expect(preview.requiresMapping).toBeUndefined();
      expect(preview.source).toBe('custom');
      expect(preview.totalCount).toBe(2);
      expect(preview.newCount).toBe(2);
      expect(preview.rows[0].parsed.amount).toBe(-4.5);
      expect(preview.rows[0].parsed.description).toBe('Coffee Shop');
      expect(preview.rows[0].parsed.balance).toBe(100.0);
      expect(preview.rows[1].parsed.amount).toBe(2500.0);
    });
  });

  describe('findBestMatchingAccount', () => {
    const existingAccounts = [
      { id: 19, name: 'Bank of America Adv Plus Banking- 6669 (6669)', institution: 'Bank of America', type: 'checking' },
      { id: 20, name: 'Bank of America Business Adv Customized Cash Rewards - 7562', institution: 'Bank of America', type: 'credit' },
      { id: 22, name: 'Bank of America Customized Cash Rewards - 5592', institution: 'Bank of America', type: 'credit' },
      { id: 30, name: 'Chase Sapphire Preferred', institution: 'Chase', type: 'credit' },
    ];

    it('matches Bank of America Adv Plus Banking correctly', () => {
      const match = findBestMatchingAccount('Bank of America - Bank - ADV PLUS BANKING', existingAccounts);
      expect(match?.id).toBe(19);
    });

    it('matches Bank of America personal Customized Cash Rewards correctly', () => {
      const match = findBestMatchingAccount(
        'Bank of America - Credit Card - Customized Cash Rewards Visa Signature',
        existingAccounts
      );
      expect(match?.id).toBe(22);
    });

    it('matches Bank of America Business Adv Customized Cash Rewards correctly', () => {
      const match = findBestMatchingAccount(
        'Bank of America - Credit Card - Business Adv Customized Cash Rewards',
        existingAccounts
      );
      expect(match?.id).toBe(20);
    });
  });

  describe('Multi-Account CSV Mapped Import', () => {
    const multiCsvText = `Status,Date,Original Description,Amount,Account Name
posted,09/17/2024,TESLA MOTORS,-9.99,Bank of America - Bank - ADV PLUS BANKING
posted,09/16/2024,Microsoft Store,-49.99,Bank of America - Credit Card - Customized Cash Rewards Visa Signature
posted,09/13/2024,ARROW EXTERMINATOR,-95.00,Bank of America - Credit Card - Business Adv Customized Cash Rewards`;

    it('builds preview and commits transactions with multi-account routing', async () => {
      // Setup SimpleFIN accounts in mock DB
      accountsData.push(
        { id: 19, name: 'Bank of America Adv Plus Banking- 6669 (6669)', institution: 'Bank of America', type: 'checking' },
        { id: 20, name: 'Bank of America Business Adv Customized Cash Rewards - 7562', institution: 'Bank of America', type: 'credit' },
        { id: 22, name: 'Bank of America Customized Cash Rewards - 5592', institution: 'Bank of America', type: 'credit' }
      );

      // Save mapping configuration with accountColumn and accountMappings
      csvMappingsData.push({
        name: 'Bank of America Multi-Account',
        headerHash: 'Status,Date,Original Description,Amount,Account Name',
        headers: ['Status', 'Date', 'Original Description', 'Amount', 'Account Name'],
        dateColumn: 'Date',
        descriptionColumn: 'Original Description',
        amountColumn: 'Amount',
        institution: 'Bank of America',
        accountName: 'Multiple Accounts',
        accountType: 'checking',
        accountColumn: 'Account Name',
        accountMappings: {
          'Bank of America - Bank - ADV PLUS BANKING': {
            accountId: 19,
            accountName: 'Bank of America Adv Plus Banking- 6669 (6669)',
            institution: 'Bank of America',
            accountType: 'checking',
          },
          'Bank of America - Credit Card - Customized Cash Rewards Visa Signature': {
            accountId: 22,
            accountName: 'Bank of America Customized Cash Rewards - 5592',
            institution: 'Bank of America',
            accountType: 'credit',
          },
          'Bank of America - Credit Card - Business Adv Customized Cash Rewards': {
            accountId: 20,
            accountName: 'Bank of America Business Adv Customized Cash Rewards - 7562',
            institution: 'Bank of America',
            accountType: 'credit',
          },
        },
      });

      const preview = await buildPreview('bofa_export.csv', multiCsvText);
      expect(preview.totalCount).toBe(3);
      expect(preview.newCount).toBe(3);
      expect(preview.targetAccountMap).toBeDefined();
      expect(preview.targetAccountMap!['Bank of America - Bank - ADV PLUS BANKING']).toBe(19);

      // Commit and verify each transaction received the right accountId
      const res = await commitPreview(preview);
      expect(res.imported).toBe(3);

      const tesla = transactionsData.find(t => t.description === 'TESLA MOTORS');
      expect(tesla?.accountId).toBe(19);

      const msft = transactionsData.find(t => t.description === 'Microsoft Store');
      expect(msft?.accountId).toBe(22);

      const arrow = transactionsData.find(t => t.description === 'ARROW EXTERMINATOR');
      expect(arrow?.accountId).toBe(20);
    });

    it('allows changing target account mapping for a specific file account group', async () => {
      accountsData.push(
        { id: 19, name: 'Checking Account', institution: 'Bank of America', type: 'checking' },
        { id: 22, name: 'Card 1', institution: 'Bank of America', type: 'credit' },
        { id: 99, name: 'Custom Re-routed Account', institution: 'Other Bank', type: 'savings' }
      );

      csvMappingsData.push({
        name: 'Bank of America Multi-Account',
        headerHash: 'Status,Date,Original Description,Amount,Account Name',
        headers: ['Status', 'Date', 'Original Description', 'Amount', 'Account Name'],
        dateColumn: 'Date',
        descriptionColumn: 'Original Description',
        amountColumn: 'Amount',
        institution: 'Bank of America',
        accountName: 'Multiple Accounts',
        accountType: 'checking',
        accountColumn: 'Account Name',
      });

      const preview = await buildPreview('bofa_export.csv', multiCsvText);
      
      // Update mapping for the checking group to route to custom account 99
      const updated = await updatePreviewAccountMapping(
        preview,
        'Bank of America - Bank - ADV PLUS BANKING',
        { id: 99, name: 'Custom Re-routed Account', institution: 'Other Bank', type: 'savings' }
      );

      const res = await commitPreview(updated);
      expect(res.imported).toBe(3);

      const tesla = transactionsData.find(t => t.description === 'TESLA MOTORS');
      expect(tesla?.accountId).toBe(99);
    });

    it('detects duplicate CSV transactions against SimpleFIN records with different dedupKey formats', async () => {
      accountsData.push({
        id: 19,
        name: 'Bank of America Adv Plus Banking- 6669',
        institution: 'Bank of America',
        type: 'checking',
      });

      // Simulate a SimpleFIN transaction already in the database
      transactionsData.push({
        id: 999,
        accountId: 19,
        date: '2026-05-22',
        amount: 540.82,
        description: 'Payment Thank You - Web',
        dedupKey: 'simplefin_TRN-987654321', // Notice SimpleFIN dedupKey format!
      });

      // Import CSV containing the exact same transaction
      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', chaseCsvSample);
      
      // Update preview to target account 19
      const updated = await updatePreviewAccountMapping(
        preview,
        'Chase 1234',
        { id: 19, name: 'Bank of America Adv Plus Banking- 6669', institution: 'Bank of America', type: 'checking' }
      );

      expect(updated.totalCount).toBe(2);
      expect(updated.duplicateCount).toBe(1);
      expect(updated.newCount).toBe(1);
      expect(updated.rows[0].duplicate).toBe(true);
      expect(updated.rows[1].duplicate).toBe(false);

      // Verify committing skips the duplicate
      const initialTxnCount = transactionsData.length;
      const res = await commitPreview(updated);
      expect(res.imported).toBe(1);
      expect(res.skippedDuplicates).toBe(1);
      expect(transactionsData.length).toBe(initialTxnCount + 1);
    });

    it('detects duplicate across differently named accounts via source/global semantic matching', async () => {
      accountsData.push({
        id: 19,
        name: 'Bank of America Adv Plus Banking- 6669 (6669)',
        institution: 'Bank of America',
        type: 'checking',
        source: 'boa-checking',
      });

      // SimpleFIN transaction in DB with clean description 'Rocket Mortgage'
      transactionsData.push({
        id: 1001,
        accountId: 19,
        date: '2026-10-05',
        amount: -2288.41,
        description: 'Rocket Mortgage',
        dedupKey: 'simplefin_TRN-e6e3b231-fd3f-4e25-9d63-c0b9734b3298',
      });

      // Raw CSV transaction row from a Bank of America export
      const rawBoaCsv = `Description,,Summary Amt.
Beginning balance as of 10/01/2026,,"1,000.00"

Date,Description,Amount,Running Bal.
10/05/2026,"ROCKET MORTGAGE DES:LOAN ID:3645284 INDN:CHRISTOPHER *BARN CO ID:0000452701 WEB",-2288.41,1000.00`;

      const preview = await buildPreview('stmt.csv', rawBoaCsv);
      expect(preview.totalCount).toBe(1);
      expect(preview.duplicateCount).toBe(1);
      expect(preview.newCount).toBe(0);
      expect(preview.rows[0].duplicate).toBe(true);
    });
  });
});
