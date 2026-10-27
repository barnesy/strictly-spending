import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '../api';
import type { Scenario, Goal, DestinationAccount, IncomeStream } from '../api/scenarios';
import {
  calculateMonthlyFromPaycheck,
  calculatePaycheckFromMonthly,
} from '../domain/incomeStreams';
import { getStreamPaycheckSchedule } from '../domain/forecastSpending';

export type { DestinationAccount, IncomeStream };

function persistDestinationsOverrideToDb(destinations: DestinationAccount[]) {
  try {
    void api
      .putSetting(
        'forecast_destinations_override',
        destinations.map((d) => ({
          id: d.id,
          accountId: d.accountId,
          name: d.name,
          monthlyAllocation: d.monthlyAllocation,
          sourceAllocations: d.sourceAllocations,
          isOverridden: d.isOverridden,
          enabled: d.enabled,
        }))
      )
      .catch(() => {});
  } catch {
    // ignore in non-browser/test environments
  }
}

export interface ForecastWindfall {
  id: string;
  name: string;
  monthIndex: number;
  amount: number;
}

export interface RealBaselineData {
  income: number;
  recurring: number;
  variable: number;
  startingCash: number;
  startingInvestments: number;
  startingSavings: number;
  isLoaded: boolean;
  incomeStreams?: IncomeStream[];
  destinations?: DestinationAccount[];
  homePropertyValue?: number;
  mortgageBalance?: number;
  homeEquity?: number;
}

interface ForecastState {
  baseIncome: number;
  taxRate: number;
  recurringBudget: number;
  savingsBudget: number;
  startingBalance: number;
  variableBudget: number;
  extraLoanPayment: number;
  divertExtraToSavings: boolean;
  loanStrategy: 'avalanche' | 'snowball' | 'custom';
  months: number;
  investmentGrowthRate: number;
  goals: Goal[];
  destinations: DestinationAccount[];
  incomeStreams: IncomeStream[];
  windfalls: ForecastWindfall[];
  incomeGaps: number[];
  useExactPaycheckCalendar: boolean;

  // Home Equity & Real Estate
  includeHomeEquity: boolean;
  homePropertyValue: number;
  homeAppreciationRate: number;
  realMortgageBalance: number;
  isHomeValueOverridden: boolean;
  
  // Real data baselines & override state
  realBaseline: RealBaselineData;
  isIncomeOverridden: boolean;
  isRecurringOverridden: boolean;
  isVariableOverridden: boolean;
  isStartingBalanceOverridden: boolean;

  // Actions
  setBaseIncome: (val: number) => void;
  setTaxRate: (val: number) => void;
  setRecurringBudget: (val: number) => void;
  setSavingsBudget: (val: number) => void;
  setStartingBalance: (val: number) => void;
  setVariableBudget: (val: number) => void;
  setExtraLoanPayment: (val: number) => void;
  setDivertExtraToSavings: (val: boolean) => void;
  setLoanStrategy: (val: 'avalanche' | 'snowball' | 'custom') => void;
  setMonths: (val: number) => void;
  setInvestmentGrowthRate: (val: number) => void;
  setGoals: (val: Goal[]) => void;
  setUseExactPaycheckCalendar: (val: boolean) => void;
  
  // Income stream actions
  setIncomeStreams: (val: IncomeStream[]) => void;
  updateIncomeStream: (id: string, updates: Partial<IncomeStream>) => void;
  addIncomeStream: (stream: IncomeStream) => void;
  removeIncomeStream: (id: string) => void;

  // Windfalls & Income Gaps actions
  addWindfall: (windfall: Omit<ForecastWindfall, 'id'>) => void;
  removeWindfall: (id: string) => void;
  toggleIncomeGap: (monthIndex: number) => void;
  clearIncomeGaps: () => void;

  // Destination actions
  setDestinations: (val: DestinationAccount[]) => void;
  updateDestination: (id: string, updates: Partial<DestinationAccount>) => void;
  addDestination: (dest: DestinationAccount) => void;
  removeDestination: (id: string) => void;

  // Home equity actions
  setIncludeHomeEquity: (val: boolean) => void;
  setHomePropertyValue: (val: number) => void;
  setHomeAppreciationRate: (val: number) => void;

  // Baseline synchronization & reset
  setBaselineData: (
    baseline: Partial<RealBaselineData>,
    initialDestinations?: DestinationAccount[],
    initialIncomeStreams?: IncomeStream[]
  ) => void;
  resetToRealData: () => void;
  resetFieldToReal: (field: 'income' | 'recurring' | 'variable' | 'startingBalance' | 'homeValue') => void;

  // Bulk load
  loadScenario: (scenario: Scenario) => void;
}

export function computeTotalNetIncome(streams: IncomeStream[], fallbackTaxRate: number): number {
  if (!streams || streams.length === 0) return 0;
  return streams
    .filter((s) => s.enabled)
    .reduce((sum, s) => {
      const gross = s.monthlyAmount || 0;
      if (s.isTaxed) {
        // Actual deposits are already post-tax take-home pay
        return sum + gross;
      }
      // Pre-tax streams: deduct tax rate (default to 25% self-employed/1099 reserve if fallback is 0)
      const rate = s.taxRate !== undefined ? s.taxRate : (fallbackTaxRate > 0 ? fallbackTaxRate : 25);
      return sum + gross * (1 - rate / 100);
    }, 0);
}

/**
 * Computes the base monthly net income for a standard (non-bonus) calendar month:
 * - Bi-weekly streams use 2 paychecks/mo
 * - Weekly streams use 4 paychecks/mo
 * - Semi-monthly and monthly streams use their normal monthlyAmount
 */
export function computeBaseCalendarNetIncome(streams: IncomeStream[], fallbackTaxRate: number): number {
  if (!streams || streams.length === 0) return 0;
  return streams
    .filter((s) => s.enabled)
    .reduce((sum, s) => {
      const rate = s.taxRate !== undefined ? s.taxRate : (fallbackTaxRate > 0 ? fallbackTaxRate : 25);
      const taxMult = s.isTaxed ? 1 : 1 - rate / 100;
      if (s.frequency === 'biweekly') {
        const perPaycheck = s.paycheckAmount ?? ((s.monthlyAmount || 0) * 12) / 26;
        return sum + perPaycheck * 2 * taxMult;
      }
      if (s.frequency === 'weekly') {
        const perPaycheck = s.paycheckAmount ?? ((s.monthlyAmount || 0) * 12) / 52;
        return sum + perPaycheck * 4 * taxMult;
      }
      return sum + (s.monthlyAmount || 0) * taxMult;
    }, 0);
}

/**
 * Computes automatic bonus-paycheck windfalls for 3-paycheck (bi-weekly) and 5-paycheck (weekly)
 * months across the projection horizon [1..months], skipping any month in `incomeGaps`.
 */
export function computeBonusPaycheckWindfalls(
  streams: IncomeStream[],
  fallbackTaxRate: number,
  months: number,
  incomeGaps: number[] = [],
  startDate: Date = new Date()
): Array<{ month_index: number; amount: number; streamName: string; monthKey: string }> {
  const result: Array<{ month_index: number; amount: number; streamName: string; monthKey: string }> = [];
  if (!streams || streams.length === 0 || months <= 0) return result;

  const activeBonusStreams = streams.filter(
    (s) => s.enabled && (s.frequency === 'biweekly' || s.frequency === 'weekly')
  );
  if (activeBonusStreams.length === 0) return result;

  const gapSet = new Set(incomeGaps);
  const startYear = startDate.getFullYear();
  const startMonthIdx = startDate.getMonth();

  for (let mIdx = 1; mIdx <= months; mIdx++) {
    if (gapSet.has(mIdx)) continue;
    const d = new Date(startYear, startMonthIdx + (mIdx - 1), 1);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    for (const stream of activeBonusStreams) {
      const schedule = getStreamPaycheckSchedule(stream, mKey, fallbackTaxRate);
      const normalPaychecks = stream.frequency === 'biweekly' ? 2 : 4;
      if (schedule.paychecksInMonth > normalPaychecks && schedule.netPerPaycheck > 0) {
        const extraPaychecks = schedule.paychecksInMonth - normalPaychecks;
        const bonusAmt = Math.round(extraPaychecks * schedule.netPerPaycheck * 100) / 100;
        result.push({
          month_index: mIdx,
          amount: bonusAmt,
          streamName: stream.name,
          monthKey: mKey,
        });
      }
    }
  }
  return result;
}

export function computeTotalGrossIncome(streams: IncomeStream[]): number {
  if (!streams || streams.length === 0) return 0;
  return streams
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + (s.monthlyAmount || 0), 0);
}

export function computeTotalStreamInvested(streams: IncomeStream[]): number {
  if (!streams || streams.length === 0) return 0;
  return streams
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + Math.max(0, Math.min(s.monthlyAmount || 0, s.investedAmount || 0)), 0);
}

function computeSavingsFromDestinations(destinations: DestinationAccount[]): number {
  return destinations
    .filter((d) => d.enabled)
    .reduce((sum, d) => sum + (d.monthlyAllocation || 0), 0);
}

function computeWeightedGrowthRate(destinations: DestinationAccount[], fallback: number): number {
  const active = destinations.filter((d) => d.enabled && (d.monthlyAllocation || 0) > 0);
  const totalAllocation = active.reduce((sum, d) => sum + d.monthlyAllocation, 0);
  if (totalAllocation === 0) return fallback;
  const weighted = active.reduce((sum, d) => sum + d.monthlyAllocation * d.annualGrowthRate, 0) / totalAllocation;
  return Math.round(weighted * 10) / 10;
}

function isNonCheckingInvestmentStream(s: IncomeStream): boolean {
  const combined = `${s.name || ''} ${s.accountName || ''}`;
  return /investment\s+sell|investment\s+buy|roth\s*ira|401\s*\(?k\)?|brokerage|rsu\b|espp\b/i.test(combined);
}

function isLegacyDefaultGoal(g: Goal): boolean {
  return g.id === '1' && g.name === 'Japan Trip' && g.amount === 5000 && g.monthlyContribution === 500;
}

export const useForecastStore = create<ForecastState>()(
  persist(
    (set, get) => ({
  baseIncome: 6000,
  taxRate: 0,
  recurringBudget: 2500,
  savingsBudget: 0,
  startingBalance: 15000,
  variableBudget: 2500,
  extraLoanPayment: 0,
  divertExtraToSavings: false,
  loanStrategy: 'avalanche',
  investmentGrowthRate: 7.0,
  months: 36,
  goals: [],
  destinations: [],
  incomeStreams: [],
  windfalls: [],
  incomeGaps: [],
  useExactPaycheckCalendar: true,

  // Home Equity & Real Estate
  includeHomeEquity: true,
  homePropertyValue: 0,
  homeAppreciationRate: 2.0,
  realMortgageBalance: 0,
  isHomeValueOverridden: false,

  realBaseline: {
    income: 6000,
    recurring: 2500,
    variable: 2500,
    startingCash: 15000,
    startingInvestments: 0,
    startingSavings: 0,
    isLoaded: false,
    incomeStreams: [],
    homePropertyValue: 0,
    mortgageBalance: 0,
    homeEquity: 0,
  },
  isIncomeOverridden: false,
  isRecurringOverridden: false,
  isVariableOverridden: false,
  isStartingBalanceOverridden: false,

  setIncludeHomeEquity: (val) => set({ includeHomeEquity: val }),
  setHomePropertyValue: (val) => set((state) => ({
    homePropertyValue: val,
    isHomeValueOverridden: state.realBaseline.isLoaded && state.realBaseline.homePropertyValue !== undefined
      ? val !== state.realBaseline.homePropertyValue
      : false,
  })),
  setHomeAppreciationRate: (val) => set({ homeAppreciationRate: val }),

  setBaseIncome: (val) => set((state) => ({
    baseIncome: val,
    isIncomeOverridden: state.realBaseline.isLoaded ? val !== state.realBaseline.income : false,
  })),

  setTaxRate: (val) => {
    const streams = get().incomeStreams;
    if (streams.length > 0 && streams.some((s) => !s.isTaxed)) {
      const net = Math.round(computeTotalNetIncome(streams, val));
      set({ taxRate: val, baseIncome: net });
    } else {
      set({ taxRate: val });
    }
  },

  setRecurringBudget: (val) => set((state) => ({
    recurringBudget: val,
    isRecurringOverridden: state.realBaseline.isLoaded ? val !== state.realBaseline.recurring : false,
  })),

  setSavingsBudget: (val) => set({ savingsBudget: val }),

  setStartingBalance: (val) => set((state) => ({
    startingBalance: val,
    isStartingBalanceOverridden: state.realBaseline.isLoaded ? val !== state.realBaseline.startingCash : false,
  })),

  setVariableBudget: (val) => set((state) => ({
    variableBudget: val,
    isVariableOverridden: state.realBaseline.isLoaded ? val !== state.realBaseline.variable : false,
  })),

  setExtraLoanPayment: (val) => set({ extraLoanPayment: val }),
  setDivertExtraToSavings: (val) => set({ divertExtraToSavings: val }),
  setLoanStrategy: (val) => set({ loanStrategy: val }),
  setInvestmentGrowthRate: (val) => set({ investmentGrowthRate: val }),
  setMonths: (val) => set({ months: val }),
  setGoals: (val) => set({ goals: val }),
  setUseExactPaycheckCalendar: (val) => set({ useExactPaycheckCalendar: val }),

  addWindfall: (windfall) =>
    set((state) => ({
      windfalls: [
        ...state.windfalls,
        { ...windfall, id: `windfall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
      ].sort((a, b) => a.monthIndex - b.monthIndex),
    })),

  removeWindfall: (id) =>
    set((state) => ({
      windfalls: state.windfalls.filter((w) => w.id !== id),
    })),

  toggleIncomeGap: (monthIndex) =>
    set((state) => {
      const exists = state.incomeGaps.includes(monthIndex);
      return {
        incomeGaps: exists
          ? state.incomeGaps.filter((m) => m !== monthIndex)
          : [...state.incomeGaps, monthIndex].sort((a, b) => a - b),
      };
    }),

  clearIncomeGaps: () => set({ incomeGaps: [] }),

  setIncomeStreams: (streams) => {
    const net = Math.round(computeTotalNetIncome(streams, get().taxRate));
    set((state) => ({
      incomeStreams: streams,
      baseIncome: net,
      isIncomeOverridden: state.realBaseline.isLoaded ? net !== state.realBaseline.income : false,
    }));
  },

  updateIncomeStream: (id, updates) => {
    const current = get().incomeStreams;
    const prevStreamInvested = computeTotalStreamInvested(current);

    const next = current.map((s) => {
      if (s.id !== id) return s;

      const merged = { ...s, ...updates, isOverridden: true };
      if (updates.isTaxed === false && merged.taxRate === undefined) {
        merged.taxRate = 25;
      }

      // If user selected a specific payment from recent payments
      if (updates.selectedPaymentId !== undefined && updates.selectedPaymentId !== 'custom') {
        const payment = s.recentPayments?.find((p) => String(p.id) === String(updates.selectedPaymentId));
        if (payment) {
          merged.paycheckAmount = payment.amount;
          merged.monthlyAmount = calculateMonthlyFromPaycheck(payment.amount, merged.frequency);
        }
      } else if (updates.paycheckAmount !== undefined && updates.monthlyAmount === undefined) {
        // User changed paycheck amount directly
        merged.monthlyAmount = calculateMonthlyFromPaycheck(updates.paycheckAmount, merged.frequency);
        merged.selectedPaymentId = 'custom';
      } else if (updates.monthlyAmount !== undefined && updates.paycheckAmount === undefined) {
        // User changed monthly amount directly
        merged.paycheckAmount = calculatePaycheckFromMonthly(updates.monthlyAmount, merged.frequency);
        merged.selectedPaymentId = 'custom';
      } else if (updates.frequency !== undefined && updates.monthlyAmount === undefined) {
        // User changed frequency
        merged.monthlyAmount = calculateMonthlyFromPaycheck(merged.paycheckAmount ?? merged.monthlyAmount, updates.frequency);
      }

      if (merged.investedAmount !== undefined) {
        merged.investedAmount = Math.max(0, Math.min(merged.monthlyAmount || 0, Math.round(merged.investedAmount)));
      }

      return merged;
    });

    const newStreamInvested = computeTotalStreamInvested(next);
    const investDelta = newStreamInvested - prevStreamInvested;

    let nextDestinations = get().destinations;
    let destinationsUpdated = false;

    if (Math.abs(investDelta) >= 1 || updates.investedAmount !== undefined) {
      const isInvestDest = (d: DestinationAccount) =>
        d.accountType === 'investment' ||
        Boolean(d.isRothIra) ||
        /invest|brokerage|401k|ira|vanguard|fidelity|schwab/i.test(d.name);

      const targetDest =
        nextDestinations.find((d) => d.enabled && isInvestDest(d)) ||
        nextDestinations.find((d) => isInvestDest(d)) ||
        nextDestinations.find((d) => d.enabled);

      if (targetDest) {
        nextDestinations = nextDestinations.map((d) => {
          if (d.id !== targetDest.id) return d;
          const updatedAlloc = Math.max(
            newStreamInvested,
            Math.max(0, Math.round((d.monthlyAllocation || 0) + investDelta))
          );
          return {
            ...d,
            enabled: updatedAlloc > 0 ? true : d.enabled,
            monthlyAllocation: updatedAlloc,
            isOverridden: true,
          };
        });
        destinationsUpdated = true;
      } else if (newStreamInvested > 0) {
        nextDestinations = [
          ...nextDestinations,
          {
            id: 'dest-stream-invest',
            name: 'Investment Portfolio',
            accountType: 'investment',
            currentBalance: 0,
            monthlyAllocation: Math.round(newStreamInvested),
            annualGrowthRate: 7,
            enabled: true,
            flowType: 'move',
            isOverridden: true,
          },
        ];
        destinationsUpdated = true;
      }
    }

    const net = Math.round(computeTotalNetIncome(next, get().taxRate));
    set((state) => ({
      incomeStreams: next,
      baseIncome: net,
      isIncomeOverridden: state.realBaseline.isLoaded ? net !== state.realBaseline.income : false,
      ...(destinationsUpdated
        ? {
            destinations: nextDestinations,
            savingsBudget: computeSavingsFromDestinations(nextDestinations),
            investmentGrowthRate: computeWeightedGrowthRate(nextDestinations, state.investmentGrowthRate),
          }
        : {}),
    }));
  },

  addIncomeStream: (stream) => {
    const next = [...get().incomeStreams, { ...stream, isOverridden: true }];
    const net = Math.round(computeTotalNetIncome(next, get().taxRate));
    set({
      incomeStreams: next,
      baseIncome: net,
      isIncomeOverridden: true,
    });
  },

  removeIncomeStream: (id) => {
    const next = get().incomeStreams.filter((s) => s.id !== id);
    const net = Math.round(computeTotalNetIncome(next, get().taxRate));
    set({
      incomeStreams: next,
      baseIncome: net,
      isIncomeOverridden: true,
    });
  },

  setDestinations: (destinations) => {
    const savings = computeSavingsFromDestinations(destinations);
    const growth = computeWeightedGrowthRate(destinations, get().investmentGrowthRate);
    persistDestinationsOverrideToDb(destinations);
    set({
      destinations,
      savingsBudget: savings,
      investmentGrowthRate: growth,
    });
  },

  updateDestination: (id, updates) => {
    const current = get().destinations;
    const next = current.map((d) => {
      if (d.id === id) {
        return { ...d, ...updates, isOverridden: true };
      }
      return d;
    });
    const savings = computeSavingsFromDestinations(next);
    const growth = computeWeightedGrowthRate(next, get().investmentGrowthRate);
    persistDestinationsOverrideToDb(next);
    set({
      destinations: next,
      savingsBudget: savings,
      investmentGrowthRate: growth,
    });
  },

  addDestination: (dest) => {
    const next = [...get().destinations, { ...dest, isOverridden: true }];
    const savings = computeSavingsFromDestinations(next);
    const growth = computeWeightedGrowthRate(next, get().investmentGrowthRate);
    persistDestinationsOverrideToDb(next);
    set({
      destinations: next,
      savingsBudget: savings,
      investmentGrowthRate: growth,
    });
  },

  removeDestination: (id) => {
    const next = get().destinations.filter((d) => d.id !== id);
    const savings = computeSavingsFromDestinations(next);
    const growth = computeWeightedGrowthRate(next, get().investmentGrowthRate);
    persistDestinationsOverrideToDb(next);
    set({
      destinations: next,
      savingsBudget: savings,
      investmentGrowthRate: growth,
    });
  },

  setBaselineData: (baseline, initialDestinations, initialIncomeStreams) => {
    const state = get();
    const newBaseline: RealBaselineData = {
      income: baseline.income ?? state.realBaseline.income,
      recurring: baseline.recurring ?? state.realBaseline.recurring,
      variable: baseline.variable ?? state.realBaseline.variable,
      startingCash: baseline.startingCash ?? state.realBaseline.startingCash,
      startingInvestments: baseline.startingInvestments ?? state.realBaseline.startingInvestments,
      startingSavings: baseline.startingSavings ?? state.realBaseline.startingSavings,
      incomeStreams: initialIncomeStreams ?? state.realBaseline.incomeStreams,
      destinations: initialDestinations ?? state.realBaseline.destinations,
      homePropertyValue: baseline.homePropertyValue ?? state.realBaseline.homePropertyValue,
      mortgageBalance: baseline.mortgageBalance ?? state.realBaseline.mortgageBalance,
      homeEquity: baseline.homeEquity ?? state.realBaseline.homeEquity,
      isLoaded: true,
    };

    const nextState: Partial<ForecastState> = {
      realBaseline: newBaseline,
    };

    // 1. Synchronize or merge income streams
    if (initialIncomeStreams && initialIncomeStreams.length > 0) {
      const hasOnlyPlaceholder =
        state.incomeStreams.length === 0 ||
        (state.incomeStreams.length === 1 &&
          (state.incomeStreams[0].id === 'stream-default' || state.incomeStreams[0].id === 'stream-scenario'));

      if (hasOnlyPlaceholder && initialIncomeStreams.some((s) => s.id !== 'stream-default')) {
        nextState.incomeStreams = initialIncomeStreams;
        nextState.baseIncome = Math.round(computeTotalNetIncome(initialIncomeStreams, state.taxRate));
      } else {
        const streamByAccAndName = new Map<string, IncomeStream>();
        const streamById = new Map<string, IncomeStream>();
        for (const s of state.incomeStreams) {
          if (s.accountId !== undefined) {
            streamByAccAndName.set(`${s.accountId}-${s.name}`, s);
          }
          streamById.set(s.id, s);
        }

        const mergedStreams: IncomeStream[] = [];
        const seenStreamKeys = new Set<string>();

        for (const incoming of initialIncomeStreams) {
          const key = incoming.accountId !== undefined ? `${incoming.accountId}-${incoming.name}` : incoming.id;
          seenStreamKeys.add(key);

          const existing =
            (incoming.accountId !== undefined ? streamByAccAndName.get(`${incoming.accountId}-${incoming.name}`) : undefined) ||
            streamById.get(incoming.id);

          if (existing) {
            const upgradeToSemiMonthly =
              incoming.frequency === 'semimonthly' &&
              existing.frequency !== 'semimonthly' &&
              existing.selectedPaymentId !== 'custom';
            const paymentMatchesExisting =
              existing.selectedPaymentId === 'custom' ||
              Boolean(
                incoming.recentPayments?.some(
                  (p) =>
                    String(p.id) === String(existing.selectedPaymentId) &&
                    Math.abs(p.amount - (existing.paycheckAmount || 0)) < 1
                )
              );
            const useIncomingSchedule = !existing.isOverridden || upgradeToSemiMonthly || !paymentMatchesExisting;
            mergedStreams.push({
              ...existing,
              accountId: incoming.accountId ?? existing.accountId,
              accountName: incoming.accountName || existing.accountName,
              realMonthlyAmount: incoming.realMonthlyAmount,
              recentPayments: incoming.recentPayments,
              monthlyAmount: useIncomingSchedule ? incoming.monthlyAmount : existing.monthlyAmount,
              paycheckAmount: useIncomingSchedule ? incoming.paycheckAmount : existing.paycheckAmount,
              frequency: useIncomingSchedule ? incoming.frequency : existing.frequency,
              selectedPaymentId: useIncomingSchedule ? incoming.selectedPaymentId : existing.selectedPaymentId,
              enabled: incoming.isFormerEmployer ? false : existing.isOverridden ? existing.enabled : incoming.enabled,
              isFormerEmployer: incoming.isFormerEmployer ?? existing.isFormerEmployer,
              lastPaymentDate: incoming.lastPaymentDate ?? existing.lastPaymentDate,
            });
          } else {
            // Brand new detected stream from new transactions/accounts!
            mergedStreams.push(incoming);
          }
        }

        // Retain manual user-created streams (excluding any stale non-checking investment sell or placeholder streams)
        for (const s of state.incomeStreams) {
          const key = s.accountId !== undefined ? `${s.accountId}-${s.name}` : s.id;
          if (
            !seenStreamKeys.has(key) &&
            !s.id.startsWith('stream-') &&
            !isNonCheckingInvestmentStream(s)
          ) {
            mergedStreams.push(s);
          }
        }

        nextState.incomeStreams = mergedStreams;
        nextState.baseIncome = Math.round(computeTotalNetIncome(mergedStreams, state.taxRate));
      }
    } else if (!state.isIncomeOverridden && baseline.income !== undefined) {
      nextState.baseIncome = baseline.income;
    }

    // Strip legacy default Japan Trip goal if present
    if (state.goals.some(isLegacyDefaultGoal)) {
      nextState.goals = state.goals.filter((g) => !isLegacyDefaultGoal(g));
    }

    if (!state.isRecurringOverridden && baseline.recurring !== undefined) {
      nextState.recurringBudget = baseline.recurring;
    }
    if (!state.isVariableOverridden && baseline.variable !== undefined) {
      nextState.variableBudget = baseline.variable;
    }
    if (!state.isStartingBalanceOverridden && baseline.startingCash !== undefined) {
      nextState.startingBalance = baseline.startingCash;
    }
    if (!state.isHomeValueOverridden && baseline.homePropertyValue !== undefined) {
      nextState.homePropertyValue = baseline.homePropertyValue;
    }
    if (baseline.mortgageBalance !== undefined) {
      nextState.realMortgageBalance = baseline.mortgageBalance;
    }

    // 2. Synchronize or merge destination accounts (savings & investment accounts)
    if (initialDestinations && initialDestinations.length > 0) {
      if (state.destinations.length === 0) {
        nextState.destinations = initialDestinations;
      } else {
        const existingByAccId = new Map<number, DestinationAccount>();
        const existingById = new Map<string, DestinationAccount>();
        const anyExistingOverridden = state.destinations.some((d) => d.isOverridden);
        for (const d of state.destinations) {
          if (d.accountId !== undefined) {
            existingByAccId.set(d.accountId, d);
          }
          existingById.set(d.id, d);
        }

        const merged: DestinationAccount[] = [];
        const seenAccountIds = new Set<number>();
        const seenIds = new Set<string>();

        // Process incoming real accounts
        for (const incoming of initialDestinations) {
          if (incoming.accountId !== undefined) seenAccountIds.add(incoming.accountId);
          seenIds.add(incoming.id);

          const existing = (incoming.accountId !== undefined ? existingByAccId.get(incoming.accountId) : undefined)
            || existingById.get(incoming.id);

          if (existing) {
            const shouldAdoptIncoming =
              incoming.isOverridden ||
              (!existing.isOverridden && !anyExistingOverridden && incoming.sourceAllocations !== undefined && existing.sourceAllocations === undefined);
            merged.push({
              ...existing,
              name: incoming.name || existing.name,
              accountType: incoming.accountType || existing.accountType,
              isRothIra: incoming.isRothIra ?? existing.isRothIra,
              realBalance: incoming.realBalance,
              currentBalance: existing.isOverridden ? existing.currentBalance : (incoming.realBalance ?? incoming.currentBalance),
              monthlyAllocation: shouldAdoptIncoming ? incoming.monthlyAllocation : existing.monthlyAllocation,
              sourceAllocations: shouldAdoptIncoming ? incoming.sourceAllocations : existing.sourceAllocations,
              isOverridden: existing.isOverridden || incoming.isOverridden,
            });
          } else {
            // Newly imported account from settings!
            merged.push(incoming);
          }
        }

        // Retain manual / custom destinations
        for (const d of state.destinations) {
          const wasRealAccount = d.accountId !== undefined && seenAccountIds.has(d.accountId);
          const wasRealId = seenIds.has(d.id);
          if (!wasRealAccount && !wasRealId && (d.accountId === undefined || !d.id.startsWith('account-'))) {
            merged.push(d);
          }
        }

        // Deduplicate sourceAllocations across multiple savings destinations so a second savings destination
        // never double-counts the same checking account transfer
        const claimedSourceKeys = new Set<string>();
        const sortedForDedup = [...merged].sort((a, b) => (b.isOverridden ? 1 : 0) - (a.isOverridden ? 1 : 0));
        const cleanedById = new Map<string, DestinationAccount>();
        for (const d of sortedForDedup) {
          if (d.accountType === 'savings' && d.sourceAllocations) {
            const nextAlloc: Record<string, number> = {};
            for (const [k, v] of Object.entries(d.sourceAllocations)) {
              if (!claimedSourceKeys.has(k)) {
                claimedSourceKeys.add(k);
                nextAlloc[k] = v;
              }
            }
            const hasKeys = Object.keys(nextAlloc).length > 0;
            const totalAlloc = Object.values(nextAlloc).reduce((sum, val) => sum + (val || 0), 0);
            cleanedById.set(d.id, {
              ...d,
              sourceAllocations: hasKeys ? nextAlloc : (d.isOverridden ? {} : undefined),
              monthlyAllocation: hasKeys || d.isOverridden ? totalAlloc : 0,
            });
          } else {
            cleanedById.set(d.id, d);
          }
        }

        nextState.destinations = merged.map((d) => cleanedById.get(d.id) || d);
      }

      nextState.savingsBudget = computeSavingsFromDestinations(nextState.destinations || state.destinations);
      nextState.investmentGrowthRate = computeWeightedGrowthRate(
        nextState.destinations || state.destinations,
        state.investmentGrowthRate
      );
    }

    set(nextState);
  },

  resetToRealData: () => {
    const { realBaseline } = get();
    if (!realBaseline.isLoaded) {
      set({ windfalls: [], incomeGaps: [], extraLoanPayment: 0, divertExtraToSavings: false });
      return;
    }

    // Reset destinations using realBaseline.destinations if present
    const baseDestinations = (realBaseline.destinations && realBaseline.destinations.length > 0)
      ? realBaseline.destinations.map((d) => ({
          ...d,
          currentBalance: d.realBalance ?? d.currentBalance,
          isOverridden: false,
        }))
      : get().destinations.map((d) => ({
          ...d,
          currentBalance: d.realBalance ?? d.currentBalance,
          isOverridden: false,
        }));
    persistDestinationsOverrideToDb([]);

    const resetStreams = (realBaseline.incomeStreams || [])
      .filter((s) => !isNonCheckingInvestmentStream(s))
      .map((s) => ({
        ...s,
        monthlyAmount: s.realMonthlyAmount ?? s.monthlyAmount,
        paycheckAmount: s.recentPayments && s.recentPayments.length > 0 ? s.recentPayments[0].amount : s.paycheckAmount,
        selectedPaymentId: s.recentPayments && s.recentPayments.length > 0 ? s.recentPayments[0].id : s.selectedPaymentId,
        isOverridden: false,
      }));

    const savings = computeSavingsFromDestinations(baseDestinations);
    const growth = computeWeightedGrowthRate(baseDestinations, 7.0);
    const cleanGoals = get().goals.filter((g) => !isLegacyDefaultGoal(g));

    set({
      baseIncome: realBaseline.income,
      incomeStreams: resetStreams,
      windfalls: [],
      incomeGaps: [],
      recurringBudget: realBaseline.recurring,
      variableBudget: realBaseline.variable,
      startingBalance: realBaseline.startingCash,
      extraLoanPayment: 0,
      divertExtraToSavings: false,
      goals: cleanGoals,
      homePropertyValue: realBaseline.homePropertyValue ?? 0,
      isHomeValueOverridden: false,
      isIncomeOverridden: false,
      isRecurringOverridden: false,
      isVariableOverridden: false,
      isStartingBalanceOverridden: false,
      destinations: baseDestinations,
      savingsBudget: savings,
      investmentGrowthRate: growth,
    });
  },

  resetFieldToReal: (field) => {
    const { realBaseline } = get();
    if (!realBaseline.isLoaded) return;

    if (field === 'income') {
      const resetStreams = (realBaseline.incomeStreams || []).map((s) => ({
        ...s,
        monthlyAmount: s.realMonthlyAmount ?? s.monthlyAmount,
        paycheckAmount: s.recentPayments && s.recentPayments.length > 0 ? s.recentPayments[0].amount : s.paycheckAmount,
        selectedPaymentId: s.recentPayments && s.recentPayments.length > 0 ? s.recentPayments[0].id : s.selectedPaymentId,
        isOverridden: false,
      }));
      set({
        baseIncome: realBaseline.income,
        incomeStreams: resetStreams,
        isIncomeOverridden: false,
      });
    } else if (field === 'recurring') {
      set({ recurringBudget: realBaseline.recurring, isRecurringOverridden: false });
    } else if (field === 'variable') {
      set({ variableBudget: realBaseline.variable, isVariableOverridden: false });
    } else if (field === 'startingBalance') {
      set({ startingBalance: realBaseline.startingCash, isStartingBalanceOverridden: false });
    } else if (field === 'homeValue') {
      set({
        homePropertyValue: realBaseline.homePropertyValue ?? 0,
        isHomeValueOverridden: false,
      });
    }
  },

  loadScenario: (scenario) => {
    const loadedDestinations = (scenario.destinations as DestinationAccount[]) || [];
    const loadedIncomeStreams = (scenario.incomeStreams as IncomeStream[]) || [];

    const existingDestinations = get().destinations.length > 0
      ? get().destinations
      : (get().realBaseline.destinations || []);

    const destinations = loadedDestinations.length > 0
      ? loadedDestinations
      : existingDestinations;

    const savings = loadedDestinations.length > 0
      ? computeSavingsFromDestinations(loadedDestinations)
      : (scenario.savingsBudget ?? (destinations.length > 0 ? computeSavingsFromDestinations(destinations) : 0));

    const growth = loadedDestinations.length > 0
      ? computeWeightedGrowthRate(loadedDestinations, scenario.investmentGrowthRate ?? 7.0)
      : (scenario.investmentGrowthRate ?? (destinations.length > 0 ? computeWeightedGrowthRate(destinations, 7.0) : 7.0));

    let streams = loadedIncomeStreams;
    if (streams.length === 0) {
      const currentStreams = get().incomeStreams;
      const baselineStreams = get().realBaseline.incomeStreams || [];
      const candidateStreams =
        currentStreams.length > 0 && currentStreams[0].id !== 'stream-scenario'
          ? currentStreams
          : baselineStreams;

      if (candidateStreams.length > 0) {
        const currentTotal = candidateStreams.reduce((sum, s) => sum + s.monthlyAmount, 0);
        if (currentTotal > 0 && scenario.baseIncome && Math.abs(currentTotal - scenario.baseIncome) > 1) {
          const scale = scenario.baseIncome / currentTotal;
          streams = candidateStreams.map((s) => ({
            ...s,
            monthlyAmount: Math.round(s.monthlyAmount * scale * 100) / 100,
            paycheckAmount: s.paycheckAmount ? Math.round(s.paycheckAmount * scale * 100) / 100 : undefined,
            isOverridden: true,
          }));
        } else {
          streams = candidateStreams;
        }
      } else {
        streams = [
          {
            id: 'stream-scenario',
            name: 'Base Net Income',
            monthlyAmount: scenario.baseIncome ?? 0,
            isTaxed: true,
            enabled: true,
          },
        ];
      }
    }

    set({
      baseIncome: scenario.baseIncome ?? 0,
      incomeStreams: streams,
      taxRate: scenario.taxRate ?? 0,
      recurringBudget: scenario.recurringBudget ?? 0,
      savingsBudget: savings,
      startingBalance: scenario.startingBalance ?? 0,
      variableBudget: scenario.variableBudget ?? 0,
      extraLoanPayment: scenario.extraLoanPayment ?? 0,
      divertExtraToSavings: scenario.divertExtraToSavings ?? false,
      loanStrategy: (scenario.loanStrategy as 'avalanche' | 'snowball' | 'custom') || 'avalanche',
      investmentGrowthRate: growth,
      goals: scenario.goals || [],
      destinations,
      includeHomeEquity: scenario.includeHomeEquity ?? true,
      homePropertyValue: scenario.homePropertyValue ?? get().homePropertyValue,
      homeAppreciationRate: scenario.homeAppreciationRate ?? get().homeAppreciationRate,
      isHomeValueOverridden: scenario.homePropertyValue !== undefined,
      isIncomeOverridden: true,
      isRecurringOverridden: true,
      isVariableOverridden: true,
      isStartingBalanceOverridden: true,
    });
  },
}),
    {
      name: 'strictly-spending-forecast-store',
      version: 4,
      migrate: (persistedState: any, version: number) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState;
        }
        const migrated = { ...persistedState };
        if (version < 2) {
          // Clear stale extraLoanPayment (e.g. 3900) and hardcoded default Japan Trip goal
          migrated.extraLoanPayment = 0;
          if (Array.isArray(migrated.goals)) {
            migrated.goals = migrated.goals.filter((g: Goal) => !isLegacyDefaultGoal(g));
          }
          if (Array.isArray(migrated.incomeStreams)) {
            migrated.incomeStreams = migrated.incomeStreams.filter(
              (s: IncomeStream) => !isNonCheckingInvestmentStream(s)
            );
          }
        }
        if (version < 3) {
          migrated.isIncomeOverridden = false;
          if (Array.isArray(migrated.incomeStreams)) {
            migrated.incomeStreams = migrated.incomeStreams
              .filter((s: IncomeStream) => !isNonCheckingInvestmentStream(s) && s.id !== 'stream-scenario')
              .map((s: IncomeStream) =>
                s.id?.startsWith('stream-') && s.selectedPaymentId !== 'custom'
                  ? { ...s, isOverridden: false }
                  : s
              );
          }
        }
        if (version < 4) {
          if (Array.isArray(migrated.destinations)) {
            const claimedKeys = new Set<string>();
            const sorted = [...migrated.destinations].sort(
              (a: DestinationAccount, b: DestinationAccount) => (b.isOverridden ? 1 : 0) - (a.isOverridden ? 1 : 0)
            );
            const byId = new Map<string, DestinationAccount>();
            for (const d of sorted) {
              if (d.accountType === 'savings' && d.sourceAllocations) {
                const nextAlloc: Record<string, number> = {};
                for (const [k, v] of Object.entries(d.sourceAllocations)) {
                  if (!claimedKeys.has(k)) {
                    claimedKeys.add(k);
                    nextAlloc[k] = Number(v) || 0;
                  }
                }
                const hasKeys = Object.keys(nextAlloc).length > 0;
                const totalAlloc = Object.values(nextAlloc).reduce((sum, val) => sum + (val || 0), 0);
                byId.set(d.id, {
                  ...d,
                  sourceAllocations: hasKeys ? nextAlloc : (d.isOverridden ? {} : undefined),
                  monthlyAllocation: hasKeys || d.isOverridden ? totalAlloc : 0,
                });
              } else {
                byId.set(d.id, d);
              }
            }
            migrated.destinations = migrated.destinations.map((d: DestinationAccount) => byId.get(d.id) || d);
          }
        }
        return migrated;
      },
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage;
        }
        if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
          return (globalThis as any).localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        incomeStreams: state.incomeStreams,
        destinations: state.destinations,
        windfalls: state.windfalls,
        incomeGaps: state.incomeGaps,
        useExactPaycheckCalendar: state.useExactPaycheckCalendar,
        isIncomeOverridden: state.isIncomeOverridden,
        baseIncome: state.baseIncome,
        taxRate: state.taxRate,
        recurringBudget: state.recurringBudget,
        isRecurringOverridden: state.isRecurringOverridden,
        variableBudget: state.variableBudget,
        isVariableOverridden: state.isVariableOverridden,
        startingBalance: state.startingBalance,
        isStartingBalanceOverridden: state.isStartingBalanceOverridden,
        extraLoanPayment: state.extraLoanPayment,
        divertExtraToSavings: state.divertExtraToSavings,
        loanStrategy: state.loanStrategy,
        months: state.months,
        investmentGrowthRate: state.investmentGrowthRate,
        goals: state.goals,
        includeHomeEquity: state.includeHomeEquity,
        homePropertyValue: state.homePropertyValue,
        homeAppreciationRate: state.homeAppreciationRate,
        isHomeValueOverridden: state.isHomeValueOverridden,
      }),
    }
  )
);
