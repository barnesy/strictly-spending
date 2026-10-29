import { api } from './api';

export type StorageEngineKind = 'tauri-native' | 'pc-sqlite-server' | 'browser-localstorage';

export interface StorageEngineStatus {
  engine: StorageEngineKind;
  serverOrigin: string | null;
  remoteServerUrl: string | null;
  isStandalonePwa: boolean;
  currentOrigin: string;
  lastVerifiedAt: string | null;
}

const REMOTE_SQLITE_URL_KEY = 'strictly_remote_sqlite_url';

let activeEngine: StorageEngineKind = 'browser-localstorage';
let activeServerOrigin: string | null = null;
let lastVerifiedAt: string | null = null;

export function normalizeServerUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const parsed = new URL(withProto);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function getRemoteSqliteServerUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeServerUrl(localStorage.getItem(REMOTE_SQLITE_URL_KEY));
  } catch {
    return null;
  }
}

export function setRemoteSqliteServerUrl(url: string | null): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeServerUrl(url);
  try {
    if (normalized) {
      localStorage.setItem(REMOTE_SQLITE_URL_KEY, normalized);
    } else {
      localStorage.removeItem(REMOTE_SQLITE_URL_KEY);
    }
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event('storage-engine-status-change'));
}

function updateEngineState(engine: StorageEngineKind, serverOrigin: string | null): void {
  const changed = activeEngine !== engine || activeServerOrigin !== serverOrigin;
  activeEngine = engine;
  activeServerOrigin = serverOrigin;
  lastVerifiedAt = new Date().toISOString();
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage-engine-status-change'));
  }
}

export function getStorageEngineStatus(): StorageEngineStatus {
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  return {
    engine: activeEngine,
    serverOrigin: activeServerOrigin,
    remoteServerUrl: getRemoteSqliteServerUrl(),
    isStandalonePwa: isStandalone,
    currentOrigin: typeof window !== 'undefined' ? window.location.origin : '',
    lastVerifiedAt,
  };
}

export async function testPcSqliteConnection(serverUrl?: string | null): Promise<{
  ok: boolean;
  serverOrigin?: string;
  dbPath?: string;
  localUrls?: string[];
  error?: string;
  mixedContentBlocked?: boolean;
}> {
  const normalized = serverUrl ? normalizeServerUrl(serverUrl) : null;
  const endpoint = normalized ? `${normalized}/api/tauri-ipc` : '/api/tauri-ipc';
  const originLabel = normalized || (typeof window !== 'undefined' ? window.location.origin : '');

  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    normalized &&
    normalized.startsWith('http://')
  ) {
    // Try anyway in case browser allows private network, otherwise report mixedContentBlocked
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'get_mcp_server_info', args: {} }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const info = await res.json();
        updateEngineState('pc-sqlite-server', originLabel);
        return {
          ok: true,
          serverOrigin: originLabel,
          dbPath: info?.dbPath,
          localUrls: info?.localUrls,
        };
      }
    } catch {
      return {
        ok: false,
        serverOrigin: originLabel,
        mixedContentBlocked: true,
        error: `Your browser blocked connecting from an HTTPS page (${window.location.origin}) to an HTTP LAN server (${normalized}). Open ${normalized}/?pwa=1 directly in Safari/Chrome and add that to your Home Screen to use PC SQLite directly.`,
      };
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'get_mcp_server_info', args: {} }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, serverOrigin: originLabel, error: `HTTP ${res.status}` };
    }
    const info = await res.json();
    if (info && info.dbPath) {
      updateEngineState('pc-sqlite-server', originLabel);
      return {
        ok: true,
        serverOrigin: originLabel,
        dbPath: info.dbPath,
        localUrls: info.localUrls,
      };
    }
    return { ok: false, serverOrigin: originLabel, error: 'Endpoint did not return SQLite database info' };
  } catch (err) {
    return {
      ok: false,
      serverOrigin: originLabel,
      error: (err as Error)?.message || 'Unreachable',
    };
  }
}

export async function syncFromPcSqliteToBrowserStorage(serverUrl?: string | null): Promise<{
  accounts: number;
  transactions: number;
  rules: number;
  budgets: number;
  loans: number;
}> {
  const normalized = normalizeServerUrl(serverUrl) || getRemoteSqliteServerUrl();
  const endpoint = normalized ? `${normalized}/api/tauri-ipc` : '/api/tauri-ipc';

  const callRemote = async (cmd: string, args: Record<string, unknown> = {}) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, args }),
    });
    if (!res.ok) {
      throw new Error(`Failed ${cmd} (HTTP ${res.status})`);
    }
    return res.json();
  };

  const [
    accounts,
    categories,
    rules,
    transactions,
    budgets,
    loans,
    scenarios,
    settings,
    simplefinAccounts,
    merchantOverrides,
    csvMappings,
    imports,
  ] = await Promise.all([
    callRemote('get_accounts'),
    callRemote('get_categories'),
    callRemote('get_rules'),
    callRemote('get_transactions'),
    callRemote('get_budgets'),
    callRemote('get_loans'),
    callRemote('get_scenarios').catch(() => []),
    callRemote('get_settings').catch(() => []),
    callRemote('simplefin_get_accounts').catch(() => []),
    callRemote('get_merchant_overrides').catch(() => []),
    callRemote('get_csv_mappings').catch(() => []),
    callRemote('get_import_history').catch(() => []),
  ]);

  const { replaceBrowserDemoStateFromRemote } = await import('./browserDemoEngine');
  replaceBrowserDemoStateFromRemote({
    accounts: Array.isArray(accounts) ? accounts : [],
    categories: Array.isArray(categories) ? categories : [],
    rules: Array.isArray(rules) ? rules : [],
    transactions: Array.isArray(transactions) ? transactions : [],
    budgets: Array.isArray(budgets) ? budgets : [],
    loans: Array.isArray(loans) ? loans : [],
    scenarios: Array.isArray(scenarios) ? scenarios : [],
    settings: Array.isArray(settings) ? settings : [],
    simplefinAccounts: Array.isArray(simplefinAccounts) ? simplefinAccounts : [],
    merchantOverrides: Array.isArray(merchantOverrides) ? merchantOverrides : [],
    csvMappings: Array.isArray(csvMappings) ? csvMappings : [],
    imports: Array.isArray(imports) ? imports : [],
  });

  return {
    accounts: Array.isArray(accounts) ? accounts.filter((a: any) => a.source !== 'demo').length : 0,
    transactions: Array.isArray(transactions) ? transactions.filter((t: any) => t.source !== 'demo').length : 0,
    rules: Array.isArray(rules) ? rules.length : 0,
    budgets: Array.isArray(budgets) ? budgets.length : 0,
    loans: Array.isArray(loans) ? loans.length : 0,
  };
}

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

  // Check if a ?server=... query parameter was passed to auto-configure remote PC SQLite server
  try {
    const params = new URLSearchParams(window.location.search);
    const serverParam = params.get('server') || params.get('sqliteServer');
    if (serverParam) {
      setRemoteSqliteServerUrl(serverParam);
    }
  } catch {
    // ignore URL parse errors
  }

  // Connect Tauri IPC invoke to Vite dev server SQLite endpoint when running in a standard web browser
  if ((window as any).__TAURI_INTERNALS__) {
    updateEngineState('tauri-native', 'tauri://localhost');
  } else {
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

        const remoteUrl = getRemoteSqliteServerUrl();
        if (remoteUrl && !isTestMode) {
          try {
            const res = await fetch(`${remoteUrl}/api/tauri-ipc`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cmd, args: args || {} }),
            });
            if (res.ok) {
              updateEngineState('pc-sqlite-server', remoteUrl);
              return await res.json();
            }
          } catch {
            // Remote server unreachable - try same-origin or fallback below
          }
        }

        if (!isLandingBuild) {
          try {
            const res = await fetch('/api/tauri-ipc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cmd, args: args || {} }),
            });
            if (res.ok) {
              updateEngineState('pc-sqlite-server', window.location.origin);
              return await res.json();
            }
          } catch {
            // Dev server endpoint unreachable (e.g. static tests or offline preview) - fallback below
          }
        }

        if (!isTestMode) {
          updateEngineState('browser-localstorage', null);
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
    if (!isTestMode) {
      let lastMobileCmdId: number | null = null;
      let mobileCmdInitialized = false;
      setInterval(async () => {
        const remoteUrl = getRemoteSqliteServerUrl();
        if (isLandingBuild && !remoteUrl) return;
        const endpoint = remoteUrl ? `${remoteUrl}/api/tauri-ipc` : '/api/tauri-ipc';
        try {
          const res = await fetch(endpoint, {
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
