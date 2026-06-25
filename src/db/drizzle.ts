import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { getDb, dispatchDbUpdate } from './sqlite';
import * as schema from './schema';

export const db = drizzle(
  async (sql, params, method) => {
    const tauriDb = await getDb();
    
    try {
      if (method === 'run') {
        const result = await tauriDb.execute(sql, params);
        if (typeof window !== 'undefined') {
          dispatchDbUpdate();
        }
        return { rows: [] };
      }

      const result = await tauriDb.select<any[]>(sql, params);
      
      if (method === 'get') {
        const row = result[0];
        return { rows: row ? Object.values(row) : [] };
      }
      
      const rows = result.map(row => Object.values(row));
      return { rows };
    } catch (err) {
      console.error(`[DB ERROR] Failed query: ${sql}`, params, err);
      throw err;
    }
  },
  { schema }
);
