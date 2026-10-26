import { invoke } from '@tauri-apps/api/core';

export interface AppSetting {
  key: string;
  value: any;
}

export interface McpServerInfo {
  executablePath: string;
  dbPath: string;
  configJson: string;
  localUrls?: string[];
}

export const settingsApi = {
  getSettings: () => invoke<AppSetting[]>('get_settings'),
  getSetting: async <T>(key: string): Promise<T | undefined> => {
    const val = await invoke<T | null>('get_setting', { key });
    return val === null ? undefined : val;
  },
  putSetting: (key: string, value: any) => invoke<void>('put_setting', { item: { key, value } }),
  deleteSetting: (key: string) => invoke<void>('delete_setting', { key }),
  isSafeMode: () => invoke<boolean>('is_safe_mode'),
  getMcpServerInfo: () => invoke<McpServerInfo>('get_mcp_server_info'),
};

