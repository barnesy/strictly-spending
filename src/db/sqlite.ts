import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

let dispatchTimeout: ReturnType<typeof setTimeout> | null = null;
export function dispatchDbUpdate() {
  if (typeof window === 'undefined') return;
  if (dispatchTimeout) {
    clearTimeout(dispatchTimeout);
  }
  dispatchTimeout = setTimeout(() => {
    window.dispatchEvent(new Event('db-update'));
  }, 50);
}
export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:spending-viz.sqlite');
  }
  return dbInstance;
}

export const sqliteDb = {
  get: async <T>(table: string, keyColumn: string, key: any): Promise<T | null> => {
    const db = await getDb();
    const result = await db.select<T[]>(`SELECT * FROM ${table} WHERE ${keyColumn} = $1`, [key]);
    if (result.length > 0) {
      const row: any = result[0];
      return row.data ? JSON.parse(row.data) : row;
    }
    return null;
  },
  
  put: async (table: string, keyColumn: string, key: any, data: any): Promise<void> => {
    const db = await getDb();
    const dataStr = JSON.stringify(data);
    
    // UPSERT
    await db.execute(
      `INSERT INTO ${table} (${keyColumn}, data) VALUES ($1, $2)
       ON CONFLICT(${keyColumn}) DO UPDATE SET data = excluded.data`,
      [key, dataStr]
    );
    dispatchDbUpdate();
  },

  delete: async (table: string, keyColumn: string, key: any): Promise<void> => {
    const db = await getDb();
    await db.execute(`DELETE FROM ${table} WHERE ${keyColumn} = $1`, [key]);
    dispatchDbUpdate();
  },

  toArray: async <T>(table: string): Promise<T[]> => {
    const db = await getDb();
    const results = await db.select<any[]>(`SELECT * FROM ${table}`);
    return results.map(row => row.data ? JSON.parse(row.data) : row);
  },

  add: async (table: string, data: any): Promise<number> => {
    const db = await getDb();
    const dataStr = JSON.stringify(data);
    const res = await db.execute(`INSERT INTO ${table} (data) VALUES ($1)`, [dataStr]);
    dispatchDbUpdate();
    return res.lastInsertId;
  },

  bulkAdd: async (table: string, items: any[]): Promise<void> => {
    const db = await getDb();
    for (const item of items) {
      await db.execute(`INSERT INTO ${table} (data) VALUES ($1)`, [JSON.stringify(item)]);
    }
    dispatchDbUpdate();
  },

  update: async (table: string, keyColumn: string, key: any, updates: any): Promise<void> => {
    // const db = await getDb();
    // In JSON pattern, we need to fetch, merge, and put.
    const row = await sqliteDb.get<any>(table, keyColumn, key);
    if (row) {
      const updated = { ...row, ...updates };
      await sqliteDb.put(table, keyColumn, key, updated);
    }
  },

  whereAnyOf: async <T>(table: string, keyColumn: string, keys: any[]): Promise<T[]> => {
    if (keys.length === 0) return [];
    const db = await getDb();
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
    const results = await db.select<any[]>(`SELECT * FROM ${table} WHERE ${keyColumn} IN (${placeholders})`, keys);
    return results.map(row => row.data ? JSON.parse(row.data) : row);
  },
  
  whereAnyOfModify: async (table: string, keyColumn: string, keys: any[], updates: any): Promise<void> => {
    if (keys.length === 0) return;
    // const db = await getDb();
    for (const key of keys) {
      await sqliteDb.update(table, keyColumn, key, updates);
    }
  },
  
  clear: async (table: string): Promise<void> => {
    const db = await getDb();
    await db.execute(`DELETE FROM ${table}`);
    dispatchDbUpdate();
  }
};
