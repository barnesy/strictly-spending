import { sqliteDb } from './db/sqlite';
import type {
  Account, Transaction, CategoryRule, Category, ImportBatch,
  MerchantOverride, Budget, AppSetting, ChatArtifact, ChatThread,
  DbChatMessage, CsvMapping, AppDocument, TaxRule, Loan
} from './types';

class MockQuery<T> {
  constructor(private tableName: string, private keyColumn: string, private filterFn: (arr: any[]) => any[]) {}
  
  async toArray(): Promise<T[]> {
    const arr = await sqliteDb.toArray<T>(this.tableName);
    return this.filterFn(arr);
  }
  async modify(_updates: any): Promise<void> {}
  async delete(): Promise<void> {}
  async count(): Promise<number> {
    const arr = await this.toArray();
    return arr.length;
  }
  async first(): Promise<T | undefined> {
    const arr = await this.toArray();
    return arr[0];
  }
  async keys(): Promise<any[]> {
    return this.primaryKeys();
  }
  async primaryKeys(): Promise<any[]> {
    const arr = await this.toArray();
    return arr.map((x: any) => x[this.keyColumn]);
  }
  sortBy(prop: string) {
    return this.toArray().then(arr => arr.sort((a: any, b: any) => a[prop] < b[prop] ? -1 : 1));
  }
  reverse() {
    return this;
  }
}

class TableWrapper<T> {
  constructor(public tableName: string, public keyColumn: string) {}

  hook(_eventName: string, _callback: any) {}

  async get(key: any): Promise<T | null> {
    return sqliteDb.get<T>(this.tableName, this.keyColumn, key);
  }

  async put(data: any): Promise<void> {
    const key = data[this.keyColumn];
    return sqliteDb.put(this.tableName, this.keyColumn, key, data);
  }

  async delete(key: any): Promise<void> {
    return sqliteDb.delete(this.tableName, this.keyColumn, key);
  }

  async toArray(): Promise<T[]> {
    return sqliteDb.toArray<T>(this.tableName);
  }

  async add(data: any): Promise<number> {
    return sqliteDb.add(this.tableName, data);
  }

  async bulkAdd(items: any[], options?: any): Promise<any> {
    await sqliteDb.bulkAdd(this.tableName, items);
    if (options && options.allKeys) return items.map(x => x[this.keyColumn]);
    return undefined;
  }

  async bulkPut(items: any[]): Promise<void> {
    for (const item of items) {
      await this.put(item);
    }
    window.dispatchEvent(new Event('db-update'));
  }

  async bulkDelete(keys: any[]): Promise<void> {
    for (const k of keys) {
      await this.delete(k);
    }
  }

  async update(key: any, updates: any): Promise<void> {
    return sqliteDb.update(this.tableName, this.keyColumn, key, updates);
  }

  async count(): Promise<number> {
    const arr = await this.toArray();
    return arr.length;
  }

  async clear(): Promise<void> {
    return sqliteDb.clear(this.tableName);
  }

  reverse() {
    return this;
  }
  async keys(): Promise<any[]> {
    const arr = await this.toArray();
    return arr.map(x => x[this.keyColumn]);
  }
  sortBy(prop: string) {
    return this.toArray().then(arr => arr.sort((a: any, b: any) => a[prop] < b[prop] ? -1 : 1));
  }
  orderBy(column: string) {
    return new MockQuery<T>(this.tableName, this.keyColumn, arr => arr.sort((a: any, b: any) => a[column] < b[column] ? -1 : 1));
  }

  where(column: string) {
    return {
      equals: (val: any) => new MockQuery<T>(this.tableName, this.keyColumn, arr => arr.filter((x: any) => x[column] === val)),
      notEqual: (val: any) => new MockQuery<T>(this.tableName, this.keyColumn, arr => arr.filter((x: any) => x[column] !== val)),
      anyOf: (keys: any[]) => new MockQuery<T>(this.tableName, this.keyColumn, arr => arr.filter((x: any) => keys.includes(x[column]))),
      between: (start: any, end: any, includeLower = true, includeUpper = false) => new MockQuery<T>(this.tableName, this.keyColumn, arr => arr.filter((x: any) => {
        const val = x[column];
        const lowerPass = includeLower ? val >= start : val > start;
        const upperPass = includeUpper ? val <= end : val < end;
        return lowerPass && upperPass;
      }))
    };
  }
}

class SpendingDB {
  accounts = new TableWrapper<Account>('accounts', 'id');
  transactions = new TableWrapper<Transaction>('transactions', 'id');
  rules = new TableWrapper<CategoryRule>('rules', 'id');
  categories = new TableWrapper<Category>('categories', 'id');
  imports = new TableWrapper<ImportBatch>('imports', 'id');
  merchantOverrides = new TableWrapper<MerchantOverride>('merchantOverrides', 'merchantKey');
  budgets = new TableWrapper<Budget>('budgets', 'category');
  settings = new TableWrapper<AppSetting>('settings', 'key');
  artifacts = new TableWrapper<ChatArtifact>('artifacts', 'id');
  threads = new TableWrapper<ChatThread>('threads', 'id');
  messages = new TableWrapper<DbChatMessage>('messages', 'id');
  csvMappings = new TableWrapper<CsvMapping>('csvMappings', 'id');
  documents = new TableWrapper<AppDocument>('documents', 'id');
  documentContents = new TableWrapper<{ id: string; content: string }>('documentContents', 'id');
  taxRules = new TableWrapper<TaxRule>('taxRules', 'id');
  loans = new TableWrapper<Loan>('loans', 'id');

  async transaction(_mode: string, ...args: any[]): Promise<void> {
    const cb = args.pop();
    if (typeof cb === 'function') {
      await cb();
    }
  }
}

export const db = new SpendingDB();

if (typeof window !== 'undefined') {
  (window as any).db = db;
}
