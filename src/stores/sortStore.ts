// Session-only state for the Sort view: undo history + skipped merchants.
//
// No persist middleware — once the tab closes the stack disappears, but the
// DB-level categorizations stay (they were committed at decision time).
// Persisting an undo stack across reloads would invite weird mismatches
// when the data changes underneath it.

import { create } from 'zustand';

export interface SortDecision {
  merchantKey: string;
  /** Every txn id touched by this decision. */
  txnIds: number[];
  previousCategory: string;
  newCategory: string;
  /** Rule created alongside the decision, if "Save as rule" was checked. */
  ruleId?: number;
  decidedAt: number;
}

interface SortState {
  /** Chronological — most recent at end. Undo pops from the end. */
  history: SortDecision[];
  /** merchantKeys the user deferred via "Skip". */
  skipped: Set<string>;

  push: (d: SortDecision) => void;
  popLastDecision: () => SortDecision | undefined;
  skipMerchant: (key: string) => void;
  unskip: (key: string) => void;
  reset: () => void;
}

export const useSortStore = create<SortState>((set, get) => ({
  history: [],
  skipped: new Set<string>(),

  push: (d) =>
    set((s) => ({ history: [...s.history, d] })),

  popLastDecision: () => {
    const { history } = get();
    if (history.length === 0) return undefined;
    const last = history[history.length - 1];
    set({ history: history.slice(0, -1) });
    return last;
  },

  skipMerchant: (key) =>
    set((s) => {
      const next = new Set(s.skipped);
      next.add(key);
      return { skipped: next };
    }),

  unskip: (key) =>
    set((s) => {
      const next = new Set(s.skipped);
      next.delete(key);
      return { skipped: next };
    }),

  reset: () => set({ history: [], skipped: new Set<string>() }),
}));

/** Session-summary helpers for the empty-state celebration. */
export function sessionStats(history: SortDecision[]) {
  const merchants = history.length;
  const txnCount = history.reduce((s, d) => s + d.txnIds.length, 0);
  const rulesCreated = history.filter((d) => d.ruleId !== undefined).length;
  return { merchants, txnCount, rulesCreated };
}
