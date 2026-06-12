import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DateRangePreset =
  | 'ytd'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'lastMonth'
  | 'allTime'
  | 'custom';

export type GroupBy = 'category' | 'account' | 'recurring' | 'none';

export type RecurrenceFilter = 'all' | 'recurring' | 'onetime';

export interface DrillState {
  // What we were on before drilling — lets the user click "Back" to restore.
  preset: DateRangePreset;
  customStart?: string;
  customEnd?: string;
}

export interface FiltersState {
  preset: DateRangePreset;
  customStart?: string;
  customEnd?: string;
  enabledAccountIds: number[];
  disabledCategories: string[];
  spendOnly: boolean;
  groupBy: GroupBy;
  recurrenceFilter: RecurrenceFilter;
  drill: DrillState | null;
  searchQuery: string;
  /** When true, every view hides real data and shows ONLY `source === 'demo'`
   *  records. Real data stays in IndexedDB — this is purely a presentation
   *  filter for screenshots / share-screen moments. */
  demoMode: boolean;
  earliestTransactionDate?: string;
  latestTransactionDate?: string;
  // version is used as a knob to wipe stale persisted state
  version: number;
}

const initialState: FiltersState = {
  preset: 'ytd',
  enabledAccountIds: [],
  disabledCategories: [],
  spendOnly: true,
  groupBy: 'category',
  recurrenceFilter: 'all',
  drill: null,
  searchQuery: '',
  demoMode: false,
  earliestTransactionDate: undefined,
  latestTransactionDate: undefined,
  version: 1,
};

export interface FiltersActions {
  setPreset: (p: DateRangePreset) => void;
  setCustomRange: (start?: string, end?: string) => void;
  setEnabledAccounts: (ids: number[]) => void;
  toggleAccount: (id: number) => void;
  setDisabledCategories: (cats: string[]) => void;
  toggleCategory: (cat: string) => void;
  setSpendOnly: (v: boolean) => void;
  setGroupBy: (g: GroupBy) => void;
  setRecurrenceFilter: (r: RecurrenceFilter) => void;
  drillToMonth: (monthKey: string) => void;
  drillBack: () => void;
  shiftRange: (direction: -1 | 1) => void;
  setSearchQuery: (q: string) => void;
  setDemoMode: (v: boolean) => void;
  setTransactionDataBounds: (earliest?: string, latest?: string) => void;
  reset: () => void;
}

export type FiltersStore = FiltersState & FiltersActions;

export const useFilters = create<FiltersStore>()(
  persist(
    (set) => ({
      ...initialState,
      setPreset: (p) => set({ preset: p }),
      setCustomRange: (customStart, customEnd) =>
        set({ customStart, customEnd, preset: 'custom' }),
      setEnabledAccounts: (ids) => set({ enabledAccountIds: ids }),
      toggleAccount: (id) =>
        set((s) => ({
          enabledAccountIds: s.enabledAccountIds.includes(id)
            ? s.enabledAccountIds.filter((x) => x !== id)
            : [...s.enabledAccountIds, id],
        })),
      setDisabledCategories: (cats) => set({ disabledCategories: cats }),
      toggleCategory: (cat) =>
        set((s) => ({
          disabledCategories: s.disabledCategories.includes(cat)
            ? s.disabledCategories.filter((x) => x !== cat)
            : [...s.disabledCategories, cat],
        })),
      setSpendOnly: (v) => set({ spendOnly: v }),
      setGroupBy: (g) => set({ groupBy: g }),
      setRecurrenceFilter: (r) => set({ recurrenceFilter: r }),
      drillToMonth: (monthKey) =>
        set((s) => {
          const [y, m] = monthKey.split('-').map(Number);
          const start = new Date(y, m - 1, 1).toISOString().slice(0, 10);
          const end = new Date(y, m, 0).toISOString().slice(0, 10);
          // If already drilled, keep the original drill anchor; otherwise capture it.
          const drill: DrillState = s.drill ?? {
            preset: s.preset,
            customStart: s.customStart,
            customEnd: s.customEnd,
          };
          return {
            preset: 'custom',
            customStart: start,
            customEnd: end,
            drill,
          };
        }),
      drillBack: () =>
        set((s) => {
          if (!s.drill) return {};
          return {
            preset: s.drill.preset,
            customStart: s.drill.customStart,
            customEnd: s.drill.customEnd,
            drill: null,
          };
        }),
      shiftRange: (direction) =>
        set((s) => {
          // Compute current effective range
          const range = resolveDateRange(s);
          const lenMs = range.end.getTime() - range.start.getTime();
          // Shift by the length of the current window (so "Last 30D" → next/prev 30 days).
          const newStart = new Date(range.start.getTime() + direction * lenMs);
          const newEnd = new Date(range.end.getTime() + direction * lenMs);
          return {
            preset: 'custom',
            customStart: newStart.toISOString().slice(0, 10),
            customEnd: newEnd.toISOString().slice(0, 10),
            drill: null,
          };
        }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setDemoMode: (v) => set({ demoMode: v }),
      setTransactionDataBounds: (earliest, latest) =>
        set({ earliestTransactionDate: earliest, latestTransactionDate: latest }),
      reset: () => set(initialState),
    }),
    { name: 'spending-viz:filters' }
  )
);

export function resolveDateRange(state: FiltersState): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  switch (state.preset) {
    case 'ytd':
      return { start: new Date(now.getFullYear(), 0, 1), end };
    case 'last30':
      return {
        start: new Date(now.getTime() - 30 * 86400_000),
        end,
      };
    case 'last90':
      return {
        start: new Date(now.getTime() - 90 * 86400_000),
        end,
      };
    case 'thisMonth':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end,
      };
    case 'lastMonth':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      };
    case 'allTime':
      return {
        start: state.earliestTransactionDate
          ? parseLocalDate(state.earliestTransactionDate)
          : new Date(2000, 0, 1),
        end: state.latestTransactionDate
          ? endOfLocalDay(parseLocalDate(state.latestTransactionDate))
          : end,
      };
    case 'custom':
      return {
        start: state.customStart
          ? parseLocalDate(state.customStart)
          : new Date(now.getFullYear(), 0, 1),
        end: state.customEnd
          ? endOfLocalDay(parseLocalDate(state.customEnd))
          : end,
      };
  }
}

/** Parse "YYYY-MM-DD" as a LOCAL-time date (not UTC), to avoid the
 *  off-by-one display bug when crossing midnight UTC. */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
