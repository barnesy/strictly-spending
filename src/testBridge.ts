import { api } from './api';

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
  mineRuleSuggestions: (demoMode?: boolean) => api.mineRuleSuggestions(demoMode),
};

declare global {
  interface Window {
    __TEST_API__: typeof testBridge;
  }
}

if (typeof window !== 'undefined') {
  window.__TEST_API__ = testBridge;

  // Connect Tauri IPC invoke to Vite dev server SQLite endpoint when running in a standard web browser
  if (!(window as any).__TAURI_INTERNALS__) {
    const isLandingBuild = import.meta.env.VITE_LANDING_ONLY === 'true';
    const isTestMode = import.meta.env.MODE === 'test';

    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        if (cmd === 'plugin:shell|open' || cmd === 'open_document') {
          const targetUrl = args?.path || args?.url;
          if (targetUrl && typeof window !== 'undefined') {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          }
          return null;
        }
        if (!isLandingBuild) {
          try {
            const res = await fetch('/api/tauri-ipc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cmd, args: args || {} }),
            });
            if (res.ok) {
              return await res.json();
            }
          } catch {
            // Dev server endpoint unreachable (e.g. static tests or offline preview) - fallback below
          }
        }

        if (!isTestMode) {
          const { handleBrowserDemoIpc } = await import('./browserDemoEngine');
          return handleBrowserDemoIpc(cmd, args || {});
        }

        if (cmd === 'get_accounts') return [];
        if (cmd === 'get_categories') return [];
        if (cmd === 'get_transaction_count') return 0;
        if (cmd === 'get_dashboard_aggregates') return { totalSpend: 0, totalIncome: 0, accountTotals: {} };
        if (cmd === 'get_top_merchants') return [];
        if (cmd === 'get_spend_chart_data') return [];
        if (cmd === 'get_income_chart_data') return [];
        if (cmd === 'get_consolidated_recurring_merchants') return [];
        if (cmd === 'get_category_trailing_averages') return [];
        if (cmd === 'get_unique_merchants') return [];
        if (cmd === 'get_transaction_bounds') return [null, null];
        if (cmd === 'get_uncategorized_count') return 0;
        if (cmd === 'get_settings') return [];
        if (cmd === 'get_setting') return null;
        return [];
      },
      transformCallback: (_cb: any) => {
        return Math.floor(Math.random() * 1000000);
      }
    };

    // Poll mcp_ui_command when running in a mobile/web browser over LAN so AI UI control works on phone too
    if (!isLandingBuild && !isTestMode) {
      let lastMobileCmdId: number | null = null;
      let mobileCmdInitialized = false;
      setInterval(async () => {
        try {
          const res = await fetch('/api/tauri-ipc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd: 'get_setting', args: { key: 'mcp_ui_command' } }),
          });
          if (!res.ok) return;
          const val = await res.json();
          const cmd = typeof val === 'string' ? JSON.parse(val) : val;
          if (!mobileCmdInitialized) {
            mobileCmdInitialized = true;
            if (cmd && typeof cmd.id === 'number') {
              lastMobileCmdId = cmd.id;
            }
            return;
          }
          if (cmd && typeof cmd.id === 'number' && cmd.id !== lastMobileCmdId) {
            lastMobileCmdId = cmd.id;
            window.dispatchEvent(new Event('db-update'));
            window.dispatchEvent(new CustomEvent('mcp-ui-command', { detail: cmd }));
          }
        } catch {
          // Ignore network errors when server is not running
        }
      }, 1200);
    }
  }
}

