import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { getDb } from './sqlite';
import * as schema from './schema';

export const db = drizzle(
  async (sql, params, method) => {
    const tauriDb = await getDb();
    
    try {
      if (method === 'run') {
        const result = await tauriDb.execute(sql, params);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('db-update'));
        }
        return { rows: [] };
      }

      const result = await tauriDb.select<any[]>(sql, params);
      
      // If Drizzle asks for 'values', we MUST map the array of objects to array of arrays
      if (method === 'values') {
        const rows = result.map(row => Object.values(row));
        return { rows };
      }

      // For 'all' or 'get'
      return { rows: result };
    } catch (err) {
      console.error(`[DB ERROR] Failed query: ${sql}`, params, err);
      throw err;
    }
  },
  { schema }
);
