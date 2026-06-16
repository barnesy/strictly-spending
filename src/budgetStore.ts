import { create } from 'zustand';

interface BudgetState {
  excludedMerchants: Set<string>;
  excludedBudgetCategories: Set<string>;
  toggleMerchant: (key: string) => void;
  setMerchantsExcluded: (keys: string[], excluded: boolean) => void;
  toggleBudgetCategory: (category: string) => void;
  reset: () => void;
  isExcluded: (key: string) => boolean;
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  excludedMerchants: new Set(),
  excludedBudgetCategories: new Set(),
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
      excludedMerchants: new Set(),
      excludedBudgetCategories: new Set(),
    }),
  isExcluded: (key) => get().excludedMerchants.has(key),
}));
