import { api } from './api';
import { mineRuleSuggestions } from './ruleMiner';

export const testBridge = {
  db: {
    delete: (table: string) => {
      return {
        then: async (resolve?: () => void) => {
          if (table === 'transactions') {
            await api.clearTransactions();
          } else if (table === 'rules') {
            await api.clearRules();
          }
          if (resolve) resolve();
        }
      };
    },
    insert: (table: string) => {
      return {
        values: (items: any[]) => {
          return {
            then: async (resolve?: () => void) => {
              if (table === 'transactions') {
                const mapped = items.map(item => ({
                  ...item,
                  id: typeof item.id === 'string' ? parseInt(item.id, 10) : item.id,
                  accountId: item.accountId || 0,
                  userOverridden: !!item.userOverridden,
                  isBusiness: !!item.isBusiness,
                }));
                await api.bulkAddTransactions(mapped);
              } else if (table === 'rules') {
                for (const item of items) {
                  await api.addRule(item);
                }
              }
              if (resolve) resolve();
            }
          };
        }
      };
    }
  },
  schema: {
    transactions: 'transactions',
    rules: 'rules'
  },
  mineRuleSuggestions,
};

declare global {
  interface Window {
    __TEST_API__: typeof testBridge;
  }
}

if (typeof window !== 'undefined') {
  window.__TEST_API__ = testBridge;

  // Mock Tauri IPC invoke when running in a standard web browser
  if (!(window as any).__TAURI_INTERNALS__) {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        console.log('Mocked invoke called:', cmd, args);
        if (cmd === 'get_accounts') return [{ id: 1, name: 'Checking', type: 'checking', source: 'real', enabled: true, currentBalance: 1000 }];
        if (cmd === 'get_categories') return [{ id: 1, name: 'Food', color: '#ff0000', type: 'spend', sortOrder: 1 }];
        if (cmd === 'get_transaction_count') return 10;
        if (cmd === 'get_dashboard_aggregates') return { totalSpend: 100, totalIncome: 50, accountTotals: { 1: 100 } };
        if (cmd === 'get_top_merchants') return [];
        if (cmd === 'get_spend_chart_data') return [];
        if (cmd === 'get_income_chart_data') return [];
        if (cmd === 'get_consolidated_recurring_merchants') return [];
        if (cmd === 'get_category_trailing_averages') return [];
        if (cmd === 'get_unique_merchants') return [];
        if (cmd === 'get_transaction_bounds') return ['2026-01-01', '2026-06-26'];
        if (cmd === 'get_uncategorized_count') return 0;
        if (cmd === 'get_settings') return [];
        return [];
      },
      transformCallback: (cb: any) => {
        return Math.floor(Math.random() * 1000000);
      }
    };
  }
}

