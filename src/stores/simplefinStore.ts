import { create } from 'zustand';
import {
  simplefinGetConfig,
  simplefinSaveConfig,
  simplefinClaimSetupToken,
  simplefinGetAccounts,
  simplefinMapAccount,
  simplefinSyncTransactions,
  simplefinRemoveConnection,
  type SimpleFinConfig,
  type SimpleFinAccountRecord,
  type SimpleFinSyncResponse,
} from '../api/simplefin';
import { useFilters } from './store';

interface SimpleFinState {
  config: SimpleFinConfig;
  accounts: SimpleFinAccountRecord[];
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  successMessage: string | null;
  warnings: string[];
  lastSyncStats: { added: number; accountsSynced: number } | null;

  // Actions
  fetchConfig: () => Promise<void>;
  saveConfig: (config: SimpleFinConfig) => Promise<void>;
  claimToken: (tokenInput: string) => Promise<SimpleFinConfig>;
  fetchAccounts: () => Promise<void>;
  mapAccount: (accountId: string, strictlyAccountId: number | null) => Promise<void>;
  syncTransactions: (startDate?: string) => Promise<SimpleFinSyncResponse>;
  disconnect: () => Promise<void>;
  clearMessages: () => void;
}

export const useSimpleFinStore = create<SimpleFinState>((set, get) => ({
  config: {
    access_url: '',
    claimed_at: null,
    last_synced_at: null,
  },
  accounts: [],
  isLoading: false,
  isSyncing: false,
  error: null,
  successMessage: null,
  warnings: [],
  lastSyncStats: null,

  clearMessages: () => set({ error: null, successMessage: null, warnings: [] }),

  fetchConfig: async () => {
    try {
      const config = await simplefinGetConfig();
      const safeConfig = config ?? { access_url: '', claimed_at: null, last_synced_at: null };
      if (safeConfig.access_url && safeConfig.access_url.trim().length > 0 && useFilters.getState().demoMode) {
        useFilters.getState().setDemoMode(false);
      }
      set({
        config: safeConfig,
        error: null,
      });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  saveConfig: async (config: SimpleFinConfig) => {
    set({ isLoading: true, error: null, successMessage: null });
    try {
      await simplefinSaveConfig(config);
      if (config.access_url && config.access_url.trim().length > 0) {
        useFilters.getState().setDemoMode(false);
      }
      set({ config, isLoading: false, successMessage: 'SimpleFIN configuration saved.' });
    } catch (err: unknown) {
      set({ isLoading: false, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  claimToken: async (tokenInput: string) => {
    set({ isLoading: true, error: null, successMessage: null });
    try {
      const config = await simplefinClaimSetupToken(tokenInput);
      const safeConfig = config ?? { access_url: '', claimed_at: null, last_synced_at: null };
      useFilters.getState().setDemoMode(false);
      set({
        config: safeConfig,
        isLoading: false,
        successMessage: 'SimpleFIN connected successfully! Fetching bank accounts...',
      });
      // Automatically attempt to fetch accounts right after connecting
      await get().fetchAccounts();
      return safeConfig;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isLoading: false, error: msg });
      throw err;
    }
  },

  fetchAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const accounts = await simplefinGetAccounts();
      const list = Array.isArray(accounts) ? accounts : [];
      if (list.length > 0 && useFilters.getState().demoMode) {
        useFilters.getState().setDemoMode(false);
      }
      set({ accounts: list, isLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isLoading: false, error: msg });
    }
  },

  mapAccount: async (accountId: string, strictlyAccountId: number | null) => {
    set({ error: null });
    try {
      await simplefinMapAccount(accountId, strictlyAccountId);
      // Update local state
      set((state) => ({
        accounts: state.accounts.map((acc) =>
          acc.account_id === accountId ? { ...acc, strictly_account_id: strictlyAccountId } : acc
        ),
        successMessage: 'Account mapping updated.',
      }));
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  syncTransactions: async (startDate?: string) => {
    set({ isSyncing: true, error: null, successMessage: null });
    try {
      const resp = await simplefinSyncTransactions(startDate);
      useFilters.getState().setDemoMode(false);
      set((state) => ({
        isSyncing: false,
        config: {
          ...state.config,
          last_synced_at: resp.last_synced_at,
        },
        accounts: resp.accounts ?? state.accounts,
        warnings: resp.warnings || [],
        lastSyncStats: { added: resp.added, accountsSynced: resp.accounts_synced },
        successMessage: resp.sync_start_date
          ? `Sync complete: retrieved latest charges starting from ${resp.sync_start_date} (14-day safety window). Added ${resp.added} transaction(s) across ${resp.accounts_synced} account(s).`
          : `Sync complete: added ${resp.added} transaction(s) across ${resp.accounts_synced} account(s).`,
      }));
      return resp;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isSyncing: false, error: msg });
      throw err;
    }
  },

  disconnect: async () => {
    set({ isLoading: true, error: null, successMessage: null, warnings: [] });
    try {
      await simplefinRemoveConnection();
      set({
        config: { access_url: '', claimed_at: null, last_synced_at: null },
        accounts: [],
        isLoading: false,
        warnings: [],
        successMessage: 'SimpleFIN connection removed.',
      });
    } catch (err: unknown) {
      set({ isLoading: false, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },
}));
