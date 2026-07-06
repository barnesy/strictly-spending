import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BudgetState {
  excludedMerchants: Set<string>;
  excludedBudgetCategories: Set<string>;
  toggleMerchant: (key: string) => void;
  setMerchantsExcluded: (keys: string[], excluded: boolean) => void;
  toggleBudgetCategory: (category: string) => void;
  reset: () => void;
  isExcluded: (key: string) => boolean;
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      excludedMerchants: new Set<string>(),
      excludedBudgetCategories: new Set<string>(),
      toggleMerchant: (key) =>
        set((s) => {
          const next = new Set(s.excludedMerchants);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return { excludedMerchants: next };
        }),
      setMerchantsExcluded: (keys, excluded) =>
        set((s) => {
          const next = new Set(s.excludedMerchants);
          for (const k of keys) {
            if (excluded) next.add(k);
            else next.delete(k);
          }
          return { excludedMerchants: next };
        }),
      toggleBudgetCategory: (category) =>
        set((s) => {
          const next = new Set(s.excludedBudgetCategories);
          if (next.has(category)) next.delete(category);
          else next.add(category);
          return { excludedBudgetCategories: next };
        }),
      reset: () =>
        set({
          excludedMerchants: new Set<string>(),
          excludedBudgetCategories: new Set<string>(),
        }),
      isExcluded: (key) => get().excludedMerchants.has(key),
    }),
    {
      name: 'spending-viz:budget-toggles',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            const parsed = JSON.parse(str);
            if (parsed && parsed.state) {
              parsed.state.excludedMerchants = new Set(parsed.state.excludedMerchants || []);
              parsed.state.excludedBudgetCategories = new Set(parsed.state.excludedBudgetCategories || []);
            }
            return parsed;
          } catch {
            return null;
          }
        },
        setItem: (name, newValue) => {
          const toStore = {
            ...newValue,
            state: {
              ...newValue.state,
              excludedMerchants: Array.from(newValue.state.excludedMerchants || []),
              excludedBudgetCategories: Array.from(newValue.state.excludedBudgetCategories || []),
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
