import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPreview, commitPreview } from './import';
import { db } from './db';
import { localAI } from './ai';

const rulesData: any[] = [];
const transactionsData: any[] = [];
const accountsData: any[] = [];
const importsData: any[] = [];
const categoriesData: any[] = [{ name: 'Groceries' }, { name: 'Utilities' }];
let licenseSetting: any = { value: { active: false } };

vi.mock('./db', () => {
  return {
    db: {
      rules: {
        toArray: async () => [...rulesData],
      },
      transactions: {
        toArray: async () => [...transactionsData],
        bulkAdd: async (txns: any[]) => {
          transactionsData.push(...txns);
          return txns;
        },
        where: (field: string) => ({
          equals: (val: any) => ({
            toArray: async () => transactionsData.filter(t => t[field] === val)
          }),
          anyOf: (vals: any[]) => ({
            toArray: async () => transactionsData.filter(t => vals.includes(t[field]))
          })
        })
      },
      accounts: {
        where: (field: string) => ({
          equals: (val: any) => ({
            first: async () => accountsData.find(a => a[field] === val)
          })
        }),
        add: async (a: any) => {
          const newAcc = { ...a, id: accountsData.length + 1 };
          accountsData.push(newAcc);
          return newAcc.id;
        },
        update: async (id: number, patch: any) => {
          const acc = accountsData.find(a => a.id === id);
          if (acc) {
            Object.assign(acc, patch);
          }
          return 1;
        }
      },
      imports: {
        add: async (imp: any) => {
          const newImp = { ...imp, id: importsData.length + 1 };
          importsData.push(newImp);
          return newImp.id;
        }
      },
      categories: {
        toArray: async () => [...categoriesData]
      },
      settings: {
        get: async (key: string) => {
          if (key === 'license') return licenseSetting;
          return null;
        }
      }
    }
  };
});

vi.mock('./ai', () => {
  return {
    localAI: {
      isLoaded: true,
      reviewTransactions: vi.fn(async (txns, _categories) => {
        return txns.map(() => 'Groceries');
      })
    }
  };
});

describe('CSV Import Engine', () => {
  beforeEach(() => {
    rulesData.length = 0;
    transactionsData.length = 0;
    accountsData.length = 0;
    importsData.length = 0;
    licenseSetting = { value: { active: false } };
    expect(db).toBeDefined();
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

    it('invokes local AI categorization if license is active', async () => {
      licenseSetting = { value: { active: true } };
      const preview = await buildPreview('Chase_Chase1234_stmt.CSV', chaseCsvSample);
      expect(localAI.reviewTransactions).toHaveBeenCalled();
      expect(preview.rows[0].aiCategory).toBe('Groceries');
      expect(preview.rows[1].aiCategory).toBe('Groceries');
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
  });
});
