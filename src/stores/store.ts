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

export type ProfileType = 'all' | 'personal' | 'business';

export function isBusinessAccount(a: { name: string; type?: string }): boolean {
  const n = (a.name || '').toLowerCase();
  return (
    n.includes('business') ||
    n.includes('corp') ||
    n.includes('llc') ||
    n.includes('webtime')
  );
}

export type TransactionType = 'all' | 'spend' | 'income';

export type DashboardViewMode = 'chart' | 'timeline' | 'table';

export interface FiltersState {
  preset: DateRangePreset;
  customStart?: string;
  customEnd?: string;
  enabledAccountIds: number[];
  disabledCategories: string[];
  spendOnly: boolean;
  transactionType: TransactionType;
  groupBy: GroupBy;
  recurrenceFilter: RecurrenceFilter;
  drill: DrillState | null;
  searchQuery: string;
  profile?: ProfileType;
  /** When true, every view hides real data and shows ONLY `source === 'demo'`
   *  records. Real data stays in IndexedDB — this is purely a presentation
   *  filter for screenshots / share-screen moments. */
  demoMode: boolean;
  showRunway: boolean;
  forecastHorizon: number;
  dashboardViewMode: DashboardViewMode;
  earliestTransactionDate?: string;
  latestTransactionDate?: string;
  minPrice?: number;
  maxPrice?: number;
  // version is used as a knob to wipe stale persisted state
  version: number;
  seenAccountIds: number[];
  lastViewedArtifactsAt?: string;
}

const initialState: FiltersState = {
  preset: 'ytd',
  enabledAccountIds: [],
  seenAccountIds: [],
  disabledCategories: [],
  spendOnly: true,
  transactionType: 'spend',
  groupBy: 'category',
  recurrenceFilter: 'all',
  drill: null,
  searchQuery: '',
  profile: 'all',
  demoMode: false,
  showRunway: false,
  forecastHorizon: 0,
  dashboardViewMode: 'chart',
  earliestTransactionDate: undefined,
  latestTransactionDate: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  version: 1,
  lastViewedArtifactsAt: undefined,
};

export interface FiltersActions {
  setPreset: (p: DateRangePreset) => void;
  setCustomRange: (start?: string, end?: string) => void;
  setEnabledAccounts: (ids: number[]) => void;
  setSeenAccounts: (ids: number[]) => void;
  toggleAccount: (id: number) => void;
  setProfile: (
    p: ProfileType,
    allAccounts?: { id?: number; name: string; type?: string }[]
  ) => void;
  setDisabledCategories: (cats: string[]) => void;
  toggleCategory: (cat: string) => void;
  setSpendOnly: (v: boolean) => void;
  setTransactionType: (t: TransactionType) => void;
  setGroupBy: (g: GroupBy) => void;
  setRecurrenceFilter: (r: RecurrenceFilter) => void;
  drillToMonth: (monthKey: string) => void;
  drillBack: () => void;
  shiftRange: (direction: -1 | 1) => void;
  setSearchQuery: (q: string) => void;
  setDemoMode: (v: boolean) => void;
  setShowRunway: (v: boolean) => void;
  setForecastHorizon: (months: number) => void;
  setDashboardViewMode: (v: DashboardViewMode) => void;
  setTransactionDataBounds: (earliest?: string, latest?: string) => void;
  setMinPrice: (price?: number) => void;
  setMaxPrice: (price?: number) => void;
  setLastViewedArtifactsAt: (date: string) => void;
  reset: () => void;
}

export type FiltersStore = FiltersState & FiltersActions;

export const useFilters = create<FiltersStore>()(
  persist(
    (set, _get) => ({
      ...initialState,
      setPreset: (p) =>
        set((s) => ({
          preset: p,
          customEnd: p === 'custom' && !s.customEnd ? formatLocalDate(new Date()) : s.customEnd,
        })),
      setCustomRange: (customStart, customEnd) =>
        set({
          customStart,
          customEnd: customEnd !== undefined && customEnd !== '' ? customEnd : formatLocalDate(new Date()),
          preset: 'custom',
        }),
      setEnabledAccounts: (ids) => set({ enabledAccountIds: ids }),
      setSeenAccounts: (ids) => set({ seenAccountIds: ids }),
      toggleAccount: (id) =>
        set((s) => ({
          enabledAccountIds: s.enabledAccountIds.includes(id)
            ? s.enabledAccountIds.filter((x) => x !== id)
            : [...s.enabledAccountIds, id],
        })),
      setProfile: (profile, allAccounts) =>
        set(() => {
          if (!allAccounts || allAccounts.length === 0) {
            return { profile };
          }
          let enabledAccountIds: number[];
          if (profile === 'business') {
            enabledAccountIds = allAccounts
              .filter((a) => isBusinessAccount(a))
              .map((a) => a.id!)
              .filter((id): id is number => typeof id === 'number');
          } else if (profile === 'personal') {
            enabledAccountIds = allAccounts
              .filter((a) => !isBusinessAccount(a))
              .map((a) => a.id!)
              .filter((id): id is number => typeof id === 'number');
          } else {
            enabledAccountIds = allAccounts
              .map((a) => a.id!)
              .filter((id): id is number => typeof id === 'number');
          }
          return { profile, enabledAccountIds };
        }),
      setDisabledCategories: (cats) => set({ disabledCategories: cats }),
      toggleCategory: (cat) =>
        set((s) => ({
          disabledCategories: s.disabledCategories.includes(cat)
            ? s.disabledCategories.filter((x) => x !== cat)
            : [...s.disabledCategories, cat],
        })),
      setSpendOnly: (v) => set({ spendOnly: v, transactionType: v ? 'spend' : 'all' }),
      setTransactionType: (t) => set({ transactionType: t, spendOnly: t === 'spend' }),
      setGroupBy: (g) => set({ groupBy: g }),
      setRecurrenceFilter: (r) => set({ recurrenceFilter: r }),
      drillToMonth: (monthKey) =>
        set((s) => {
          const [y, m] = monthKey.split('-').map(Number);
          const start = formatLocalDate(new Date(y, m - 1, 1));
          const end = formatLocalDate(new Date(y, m, 0));
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
            customStart: formatLocalDate(newStart),
            customEnd: formatLocalDate(newEnd),
            drill: null,
          };
        }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setDemoMode: (v) => set({ demoMode: v }),
      setShowRunway: (v) => set({ showRunway: v }),
      setForecastHorizon: (months) => set({ forecastHorizon: months }),
      setDashboardViewMode: (dashboardViewMode) => set({ dashboardViewMode }),
      setTransactionDataBounds: (earliest, latest) =>
        set({ earliestTransactionDate: earliest, latestTransactionDate: latest }),
      setMinPrice: (price) => set({ minPrice: price }),
      setMaxPrice: (maxPrice) => set({ maxPrice }),
      setLastViewedArtifactsAt: (date) => set({ lastViewedArtifactsAt: date }),
      reset: () =>
        set((s) => ({
          ...initialState,
          demoMode: s.demoMode,
          dashboardViewMode: s.dashboardViewMode,
          version: s.version,
          earliestTransactionDate: s.earliestTransactionDate,
          latestTransactionDate: s.latestTransactionDate,
        })),
    }),
    { name: 'spending-viz:filters' }
  )
);

export function resolveDateRange(state: FiltersState): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  const isValidDate = (d: Date) =>
    d instanceof Date &&
    !isNaN(d.getTime()) &&
    d.getFullYear() >= 2000 &&
    d.getFullYear() <= 2100;
  
  let result: { start: Date; end: Date };
  switch (state.preset) {
    case 'ytd':
      result = { start: new Date(now.getFullYear(), 0, 1), end };
      break;
    case 'last30':
      result = {
        start: new Date(now.getTime() - 30 * 86400_000),
        end,
      };
      break;
    case 'last90':
      result = {
        start: new Date(now.getTime() - 90 * 86400_000),
        end,
      };
      break;
    case 'thisMonth':
      result = {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end,
      };
      break;
    case 'lastMonth':
      result = {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      };
      break;
    case 'allTime': {
      const parsedStart = state.earliestTransactionDate ? parseLocalDate(state.earliestTransactionDate) : null;
      const parsedEnd = state.latestTransactionDate ? parseLocalDate(state.latestTransactionDate) : null;
      result = {
        start: parsedStart && isValidDate(parsedStart) ? parsedStart : new Date(2000, 0, 1),
        end: parsedEnd && isValidDate(parsedEnd) ? endOfLocalDay(parsedEnd) : end,
      };
      break;
    }
    case 'custom': {
      const parsedStart = state.customStart ? parseLocalDate(state.customStart) : null;
      const parsedEnd = state.customEnd ? parseLocalDate(state.customEnd) : null;
      result = {
        start: parsedStart && isValidDate(parsedStart) ? parsedStart : new Date(now.getFullYear(), 0, 1),
        end: parsedEnd && isValidDate(parsedEnd) ? endOfLocalDay(parsedEnd) : end,
      };
      break;
    }
    default:
      result = { start: new Date(now.getFullYear(), 0, 1), end };
  }

  if (!isValidDate(result.start)) {
    result.start = new Date(now.getFullYear(), 0, 1);
  }
  if (!isValidDate(result.end)) {
    result.end = end;
  }
  return result;
}

/** Parse "YYYY-MM-DD" as a LOCAL-time date (not UTC), to avoid the
 *  off-by-one display bug when crossing midnight UTC. */
function parseLocalDate(iso: string): Date {
  if (!iso) return new Date(NaN);
  const parts = iso.split('-');
  if (parts.length !== 3) return new Date(NaN);
  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date(NaN);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfLocalDay(d: Date): Date {
  if (!(d instanceof Date) || isNaN(d.getTime())) return new Date(NaN);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function formatLocalDate(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

