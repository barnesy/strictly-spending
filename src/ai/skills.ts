import { useFilters } from '../store';
import { useBudgetStore } from '../budgetStore';
import { api } from '../api';

export async function calculateGlobalRunwayData() {
  const accounts = await api.getAccounts();
  const budgets = await api.getBudgets();
  const categories = await api.getCategories();

  const filters = useFilters.getState();
  const demoMode = filters.demoMode;
  const enabledSet = new Set(filters.enabledAccountIds);

  const cash = accounts
    .filter((a) => enabledSet.has(a.id!) && (a.type === 'checking' || a.type === 'savings'))
    .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
  const debt = accounts
    .filter((a) => enabledSet.has(a.id!) && a.type === 'credit')
    .reduce((sum, a) => sum + (a.currentBalance || 0), 0);

  const netCash = Math.max(0, cash + debt);

  const budgetStore = useBudgetStore.getState();
  const excludedBudgetCategories = budgetStore.excludedBudgetCategories;
  const excludedMerchants = budgetStore.excludedMerchants;

  const consolidatedMerchants = await api.getConsolidatedRecurringMerchants(demoMode);

  const recurringCategoryNames = new Set(
    categories.filter((c) => c.defaultRecurrence === 'recurring').map((c) => c.name)
  );
  const recurringProjected = consolidatedMerchants
    .filter((m) => !excludedBudgetCategories.has(m.category) && !excludedMerchants.has(m.merchantKey))
    .reduce((sum, m) => sum + m.monthlyAverage, 0);

  const activeBudgets = budgets
    ? budgets
        .filter((b) => !filters.disabledCategories.includes(b.category) && !excludedBudgetCategories.has(b.category) && !recurringCategoryNames.has(b.category))
        .reduce((sum, b) => sum + b.monthlyAmount, 0)
    : 0;

  const totalMonthlyOutflow = activeBudgets + recurringProjected;
  const runwayMonths = totalMonthlyOutflow > 0 ? netCash / totalMonthlyOutflow : 0;

  const data = {
    cashBalance: cash,
    creditDebt: debt,
    netCash,
    monthlyOutflow: totalMonthlyOutflow,
    runwayMonths,
  };

  if (typeof window !== 'undefined') {
    (window as any).cashBalance = cash;
    (window as any).creditDebt = debt;
    (window as any).netCash = netCash;
    (window as any).monthlyOutflow = totalMonthlyOutflow;
    (window as any).runwayMonths = runwayMonths;
  }

  return data;
}

if (typeof window !== 'undefined') {
  (window as any).calculateGlobalRunwayData = calculateGlobalRunwayData;
}