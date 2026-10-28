import { invoke } from '@tauri-apps/api/core';

export interface SimpleFinConfig {
  access_url: string;
  claimed_at?: string | null;
  last_synced_at?: string | null;
}

export interface SimpleFinAccountRecord {
  id: number;
  account_id: string;
  org_name?: string | null;
  name: string;
  currency?: string | null;
  balance?: number | null;
  available_balance?: number | null;
  balance_date?: number | null;
  strictly_account_id?: number | null;
  latest_transaction_date?: string | null;
}

export interface SimpleFinSyncResponse {
  added: number;
  accounts_synced: number;
  last_synced_at: string;
  sync_start_date?: string;
  warnings: string[];
  accounts?: SimpleFinAccountRecord[];
}

export async function simplefinGetConfig(): Promise<SimpleFinConfig> {
  return invoke<SimpleFinConfig>('simplefin_get_config');
}

export async function simplefinSaveConfig(config: SimpleFinConfig): Promise<void> {
  return invoke('simplefin_save_config', { config });
}

export async function simplefinClaimSetupToken(tokenInput: string): Promise<SimpleFinConfig> {
  return invoke<SimpleFinConfig>('simplefin_claim_setup_token', { tokenInput });
}

export async function simplefinGetAccounts(forceRefresh?: boolean): Promise<SimpleFinAccountRecord[]> {
  return invoke<SimpleFinAccountRecord[]>('simplefin_get_accounts', { forceRefresh });
}

export async function simplefinMapAccount(
  accountId: string,
  strictlyAccountId: number | null
): Promise<void> {
  return invoke('simplefin_map_account', { accountId, strictlyAccountId });
}

export async function simplefinSyncTransactions(
  startDate?: string
): Promise<SimpleFinSyncResponse> {
  return invoke<SimpleFinSyncResponse>('simplefin_sync_transactions', { startDate });
}

export async function simplefinRemoveConnection(): Promise<void> {
  return invoke('simplefin_remove_connection');
}

export const simplefinApi = {
  simplefinGetConfig,
  simplefinSaveConfig,
  simplefinClaimSetupToken,
  simplefinGetAccounts,
  simplefinMapAccount,
  simplefinSyncTransactions,
  simplefinRemoveConnection,
};
