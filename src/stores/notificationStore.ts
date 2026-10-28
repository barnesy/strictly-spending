import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api';

const NOTIFICATIONS_DB_KEY = 'app_notifications';
const MAX_NOTIFICATIONS = 50;

export type NotificationKind = 'sync_impact' | 'budget_breach';

export interface AppNotificationItem {
  id: string;
  type: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  aiPrompt?: string;
  navigateTo?: string;
  meta?: {
    category?: string;
    actualSpend?: number;
    budgetAmount?: number;
    overBy?: number;
    pctUsed?: number;
    recentSpendDollars?: number;
    monthSpendToDate?: number;
    projectedAnnualSpend?: number;
    monthCashRemainder?: number;
  };
}

function persistNotificationsToDb(items: AppNotificationItem[]): void {
  if (typeof api?.putSetting !== 'function') return;
  void api.putSetting(NOTIFICATIONS_DB_KEY, items.slice(0, MAX_NOTIFICATIONS)).catch(() => {});
}

interface NotificationState {
  notifications: AppNotificationItem[];
  addNotification: (
    item: Omit<AppNotificationItem, 'id' | 'createdAt' | 'read'> & { id?: string }
  ) => AppNotificationItem;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  syncFromDatabase: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      addNotification: (item) => {
        const nowIso = new Date().toISOString();
        const newEntry: AppNotificationItem = {
          ...item,
          id: item.id || `${item.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: nowIso,
          read: false,
        };
        set((state) => {
          const filtered = state.notifications.filter((n) => n.id !== newEntry.id);
          const next = [newEntry, ...filtered].slice(0, MAX_NOTIFICATIONS);
          persistNotificationsToDb(next);
          return { notifications: next };
        });
        return newEntry;
      },

      markAsRead: (id) =>
        set((state) => {
          const next = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
          persistNotificationsToDb(next);
          return { notifications: next };
        }),

      markAllAsRead: () =>
        set((state) => {
          const next = state.notifications.map((n) => (n.read ? n : { ...n, read: true }));
          persistNotificationsToDb(next);
          return { notifications: next };
        }),

      removeNotification: (id) =>
        set((state) => {
          const next = state.notifications.filter((n) => n.id !== id);
          persistNotificationsToDb(next);
          return { notifications: next };
        }),

      clearAll: () => {
        persistNotificationsToDb([]);
        set({ notifications: [] });
      },

      syncFromDatabase: async () => {
        if (typeof api?.getSettings !== 'function') return;
        try {
          const settings = await api.getSettings();
          const entry = settings.find((s) => s.key === NOTIFICATIONS_DB_KEY);
          if (entry && Array.isArray(entry.value)) {
            const dbItems = entry.value as AppNotificationItem[];
            if (dbItems.length > 0 && get().notifications.length === 0) {
              set({ notifications: dbItems.slice(0, MAX_NOTIFICATIONS) });
            }
          }
        } catch {
          // ignore
        }
      },
    }),
    {
      name: 'spending-viz:notifications',
    }
  )
);

if (typeof window !== 'undefined') {
  setTimeout(() => {
    void useNotificationStore.getState().syncFromDatabase();
  }, 500);
}
