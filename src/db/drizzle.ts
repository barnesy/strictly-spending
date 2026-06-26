import { queryClient } from '../queryClient';
import { api } from '../api';

function getTableName(table: any): string {
  if (typeof table === 'string') return table;
  if (!table) return '';
  
  // 1. Try scanning symbols (Drizzle's internal storage)
  const symbols = Object.getOwnPropertySymbols(table);
  for (const sym of symbols) {
    const str = sym.toString();
    if (str === 'Symbol(drizzle:Name)' || str === 'Symbol(drizzle:OriginalName)' || str === 'Symbol(drizzle:BaseName)') {
      const val = table[sym];
      if (typeof val === 'string' && val) return val;
    }
  }

  // 2. Try properties
  if (table._?.name) return table._.name;
  if (table.name) return table.name;
  
  return '';
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

function getColumnKey(column: any): string {
  if (typeof column === 'string') return toCamelCase(column);
  const dbName = column.name || '';
  return toCamelCase(dbName);
}

export interface DbFilter {
  op: 'eq' | 'ne' | 'inArray' | 'between' | 'and';
  key: string;
  value?: any;
  values?: any[];
  min?: any;
  max?: any;
  conditions?: DbFilter[];
}


function invalidateTable(t: string) {
  if (t === 'transactions') {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['transactions_paginated'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard_aggregates'] });
    queryClient.invalidateQueries({ queryKey: ['top_merchants'] });
    queryClient.invalidateQueries({ queryKey: ['uncategorized_count'] });
    queryClient.invalidateQueries({ queryKey: ['spend_chart_data'] });
  } else if (t === 'merchant_overrides' || t === 'merchantOverrides') {
    queryClient.invalidateQueries({ queryKey: ['merchant_overrides'] });
  } else if (t === 'document_contents' || t === 'documentContents') {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
  } else if (t === 'tax_rules' || t === 'taxRules') {
    queryClient.invalidateQueries({ queryKey: ['tax_rules'] });
  } else if (t === 'csv_mappings' || t === 'csvMappings') {
    queryClient.invalidateQueries({ queryKey: ['csv_mappings'] });
  } else {
    queryClient.invalidateQueries({ queryKey: [t] });
  }
}

export function evaluateFilter(item: any, filter: any): boolean {
  if (typeof filter === 'function') return filter(item);
  if (!filter || typeof filter !== 'object') return true;

  const f = filter as DbFilter;
  switch (f.op) {
    case 'eq': return item[f.key] === f.value;
    case 'ne': return item[f.key] !== f.value;
    case 'inArray': return f.values ? f.values.includes(item[f.key]) : false;
    case 'between': return item[f.key] >= f.min && item[f.key] <= f.max;
    case 'and': return f.conditions ? f.conditions.every(c => evaluateFilter(item, c)) : true;
    default: return true;
  }
}

export function eq(column: any, value: any): DbFilter {
  return { op: 'eq', key: getColumnKey(column), value };
}

export function ne(column: any, value: any): DbFilter {
  return { op: 'ne', key: getColumnKey(column), value };
}

export function inArray(column: any, values: any[]): DbFilter {
  return { op: 'inArray', key: getColumnKey(column), values };
}

export function between(column: any, min: any, max: any): DbFilter {
  return { op: 'between', key: getColumnKey(column), min, max };
}

export function desc(column: any) {
  return { column: getColumnKey(column), direction: 'desc' as const };
}

export function asc(column: any) {
  return { column: getColumnKey(column), direction: 'asc' as const };
}

class SelectBuilder {
  private tableName: string = '';
  private whereClause: any = null;
  private limitVal: number | null = null;

  from(table: any) {
    this.tableName = getTableName(table);
    return this;
  }

  where(clause: any) {
    this.whereClause = clause;
    return this;
  }

  orderBy(clause: any) {
    // We can ignore sorting or implement simple sorting if needed
    return this;
  }

  groupBy(...args: any[]) {
    return this;
  }

  limit(val: number) {
    this.limitVal = val;
    return this;
  }

  then<TResult1 = any[], TResult2 = never>(
    onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute() {
    const t = this.tableName;
    let items: any[] = [];

    let txStartDate = '1970-01-01';
    let txEndDate = '2100-01-01';
    const txFilters: any = {};

    if (t === 'transactions' && this.whereClause) {
      const parseAst = (f: DbFilter) => {
        if (f.op === 'between' && f.key === 'date') {
          txStartDate = f.min;
          txEndDate = f.max;
        } else if (f.op === 'eq') {
          txFilters[f.key] = f.value;
        } else if (f.op === 'and' && f.conditions) {
          f.conditions.forEach(parseAst);
        }
      };
      parseAst(this.whereClause as DbFilter);
    }

    if (t === 'transactions') items = await api.getTransactions(txStartDate, txEndDate, txFilters);
    else if (t === 'accounts') items = await api.getAccounts();
    else if (t === 'categories') items = await api.getCategories();
    else if (t === 'merchant_overrides' || t === 'merchantOverrides') items = await api.getMerchantOverrides();
    else if (t === 'budgets') items = await api.getBudgets();
    else if (t === 'rules') items = await api.getRules();
    else if (t === 'settings') items = await api.getSettings();
    else if (t === 'messages') items = await api.getMessages();
    else if (t === 'threads') items = await api.getThreads();
    else if (t === 'csv_mappings' || t === 'csvMappings') items = await api.getCsvMappings();
    else if (t === 'documents') items = await api.getDocuments();
    else if (t === 'document_contents' || t === 'documentContents') items = await api.getDocumentContents();
    else if (t === 'tax_rules' || t === 'taxRules') items = await api.getTaxRules();
    else if (t === 'loans') items = await api.getLoans();
    else if (t === 'imports') items = await api.getImports();
    else if (t === 'artifacts') items = await api.getArtifacts();
    else throw new Error(`Unknown table in select: ${t}`);

    if (this.whereClause) {
      items = items.filter(i => evaluateFilter(i, this.whereClause));
    }

    if (this.limitVal !== null) {
      items = items.slice(0, this.limitVal);
    }

    return items;
  }
}

class InsertBuilder {
  private tableName: string = '';
  private valuesList: any[] = [];
  private onConflict: 'nothing' | 'update' | null = null;

  constructor(table: any) {
    this.tableName = getTableName(table);
  }

  values(val: any | any[]) {
    this.valuesList = Array.isArray(val) ? val : [val];
    return this;
  }

  onConflictDoNothing() {
    this.onConflict = 'nothing';
    return this;
  }

  returning() {
    return this;
  }

  onConflictDoUpdate(config: any) {
    return this;
  }

  then<TResult1 = any[], TResult2 = never>(
    onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute() {
    const t = this.tableName;
    const results: any[] = [];

    if (t === 'transactions') {
      if (this.valuesList.length > 0) {
        const mapped = this.valuesList.map(item => ({
          ...item,
          accountId: item.accountId || 0,
          userOverridden: !!item.userOverridden,
          isBusiness: !!item.isBusiness,
        }));
        await api.bulkAddTransactions(mapped, this.onConflict === 'nothing');
      }
    } else if (t === 'budgets') {
      if (this.valuesList.length > 0) {
        await api.bulkPutBudgets(this.valuesList);
      }
    } else {
      for (const item of this.valuesList) {
        let res: any = null;
        if (t === 'accounts') res = await api.addAccount(item);
        else if (t === 'categories') res = await api.addCategory(item);
        else if (t === 'merchant_overrides' || t === 'merchantOverrides') {
          await api.putMerchantOverride(item);
        } else if (t === 'rules') {
          res = await api.addRule(item);
        } else if (t === 'settings') {
          await api.putSetting(item.key, item.value);
        } else if (t === 'messages') {
          await api.putMessage(item);
        } else if (t === 'threads') {
          await api.putThread(item);
        } else if (t === 'csv_mappings' || t === 'csvMappings') {
          await api.putCsvMapping(item);
        } else if (t === 'documents') {
          await api.putDocument(item);
        } else if (t === 'document_contents' || t === 'documentContents') {
          await api.putDocumentContent(item);
        } else if (t === 'tax_rules' || t === 'taxRules') {
          await api.putTaxRule(item);
        } else if (t === 'loans') {
          await api.putLoan(item);
        } else if (t === 'imports') {
          res = await api.addImport(item);
        } else if (t === 'artifacts') {
          await api.putArtifact(item);
        } else {
          throw new Error(`Unknown table for insert: ${t}`);
        }
        
        results.push({ id: res });
      }
    }

    invalidateTable(t);
    return results;
  }
}

class UpdateBuilder {
  private tableName: string = '';
  private updates: any = null;
  private whereClause: any = null;

  constructor(table: any) {
    this.tableName = getTableName(table);
  }

  set(val: any) {
    this.updates = val;
    return this;
  }

  where(clause: any) {
    this.whereClause = clause;
    return this;
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute() {
    const t = this.tableName;
    const items = await db.select().from(t).where(this.whereClause);
    if (t === 'transactions') {
      const mapped = items.map(item => ({ ...item, ...this.updates }));
      if (mapped.length > 0) {
        await api.bulkUpdateTransactions(mapped);
      }
    } else {
      for (const item of items) {
        const full = { ...item, ...this.updates };
        if (t === 'accounts') {
        await api.updateAccount(item.id, full);
      } else if (t === 'categories') {
        await api.updateCategory(item.id, full);
      } else if (t === 'rules') {
        await api.updateRule(item.id, full);
      } else if (t === 'settings') {
        await api.putSetting(item.key, full.value);
      } else if (t === 'messages') {
        await api.putMessage(full);
      } else if (t === 'threads') {
        await api.putThread(full);
      } else if (t === 'csv_mappings' || t === 'csvMappings') {
        await api.putCsvMapping(full);
      } else if (t === 'documents') {
        await api.putDocument(full);
      } else if (t === 'document_contents' || t === 'documentContents') {
        await api.putDocumentContent(full);
      } else if (t === 'tax_rules' || t === 'taxRules') {
        await api.putTaxRule(full);
      } else if (t === 'loans') {
        await api.putLoan(full);
      } else if (t === 'artifacts') {
        await api.putArtifact(full);
      } else {
        throw new Error(`Unknown table for update: ${t}`);
      }
    }
    }
    invalidateTable(t);
  }
}

class DeleteBuilder {
  private tableName: string = '';
  private whereClause: any = null;

  constructor(table: any) {
    this.tableName = getTableName(table);
  }

  where(clause: any) {
    this.whereClause = clause;
    return this;
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute() {
    const t = this.tableName;
    const items = await db.select().from(t).where(this.whereClause);
    for (const item of items) {
      if (t === 'transactions') {
        await api.deleteTransaction(item.id);
      } else if (t === 'accounts') {
        await api.deleteAccount(item.id);
      } else if (t === 'categories') {
        await api.deleteCategory(item.id);
      } else if (t === 'merchant_overrides' || t === 'merchantOverrides') {
        await api.deleteMerchantOverride(item.merchantKey);
      } else if (t === 'rules') {
        await api.deleteRule(item.id);
      } else if (t === 'settings') {
        await api.deleteSetting(item.key);
      } else if (t === 'messages') {
        await api.deleteMessage(item.id);
      } else if (t === 'threads') {
        await api.deleteThread(item.id);
      } else if (t === 'csv_mappings' || t === 'csvMappings') {
        await api.deleteCsvMapping(item.id);
      } else if (t === 'documents') {
        await api.deleteDocument(item.id);
      } else if (t === 'document_contents' || t === 'documentContents') {
        await api.deleteDocumentContent(item.id);
      } else if (t === 'tax_rules' || t === 'taxRules') {
        await api.deleteTaxRule(item.id);
      } else if (t === 'loans') {
        await api.deleteLoan(item.id);
      } else if (t === 'artifacts') {
        await api.deleteArtifact(item.id);
      } else {
        throw new Error(`Unknown table for delete: ${t}`);
      }
    }
    invalidateTable(t);
  }
}

export const db = {
  select: (...args: any[]) => new SelectBuilder(),
  insert: (table: any) => new InsertBuilder(table),
  update: (table: any) => new UpdateBuilder(table),
  delete: (table: any) => new DeleteBuilder(table),
  transaction: async (cb: (tx: any) => Promise<any>) => {
    return cb(db);
  }
};

export const sql = (() => {
  const fn = () => {};
  (fn as any).mapWith = () => fn;
  return fn;
}) as any;

export function and(...conditions: any[]): DbFilter {
  return { op: 'and', key: '', conditions: conditions as DbFilter[] };
}

