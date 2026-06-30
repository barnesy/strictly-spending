import { invoke } from '@tauri-apps/api/core';

export interface AppSetting {
  key: string;
  value: any;
}

export const settingsApi = {
  getSettings: () => invoke<AppSetting[]>('get_settings'),
  getSetting: async <T>(key: string): Promise<T | undefined> => {
    const settings = await invoke<AppSetting[]>('get_settings');
    const setting = settings.find(s => s.key === key);
    return setting ? setting.value as T : undefined;
  },
  putSetting: (key: string, value: any) => invoke<void>('put_setting', { item: { key, value } }),
  deleteSetting: (key: string) => invoke<void>('delete_setting', { key }),
};
