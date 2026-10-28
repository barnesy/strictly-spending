import { api } from '../api';
import { usd, monthLabel } from '../lib';
import { useFilters } from '../stores/store';
import { useForecastStore, computeTotalNetIncome } from '../stores/forecastStore';
import { loadForecastBaselineData } from './incomeStreams';

function cleanMerchantLabel(raw: string): string {
  const cleaned = raw
    .replace(/\b(POS|DEBIT|CARD|PURCHASE|ACH|CHECKCARD|SQ \*|TST\*)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || raw || 'Charge';
}

export interface SyncSpendImpactSummary {
  addedCount: number;
  recentWindowLabel: string;
  recentSpendDollars: number;
  recentIncomeDollars: number;
  topCharges: { merchant: string; amount: number; date: string; category: string }[];
  currentMonthLabel: string;
  monthSpendToDate: number;
  monthBudgetTarget: number;
  monthIncomeExpected: number;
  monthCashRemainder: number;
  monthSharePct: number;
  projectedMonthEndSpend: number;
  projectedAnnualSpend: number;
  annualizedRecentHabitCost: number;
  tenYearInvestedOpportunity: number;
  aiPrompt: string;
}

const LAST_NOTIFIED_DATE_KEY = 'strictly_last_sync_notified_date';

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestSyncNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function buildSyncSpendImpactSummary(
  addedCount = 0
): Promise<SyncSpendImpactSummary | null> {
  const demoMode = useFilters.getState().demoMode;
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonthIdx = now.getMonth();
  const curMonthKey = `${curYear}-${String(curMonthIdx + 1).padStart(2, '0')}`;
  const monthStart = `${curMonthKey}-01`;
  const monthEnd = `${curMonthKey}-31`;
  const daysInMonth = new Date(curYear, curMonthIdx + 1, 0).getDate();
  const dayOfMonth = Math.max(1, now.getDate());

  const [allRecentTxns, categories, budgets, forecastBaseline] = await Promise.all([
    api.getTransactions('1970-01-01', '2100-01-01'),
    api.getCategories().catch(() => []),
    api.getBudgets().catch(() => []),
    loadForecastBaselineData().catch(() => null),
  ]);

  const transferCatNames = new Set(
    categories.filter((c) => c.type === 'transfer').map((c) => c.name.toLowerCase())
  );
  transferCatNames.add('transfer');
  transferCatNames.add('credit card payment');

  const validTxns = allRecentTxns.filter((t) => {
    if (demoMode ? t.source !== 'demo' : t.source === 'demo') return false;
    return !transferCatNames.has((t.category || '').toLowerCase());
  });

  if (validTxns.length === 0) return null;

  const sortedByDateDesc = [...validTxns].sort((a, b) =>
    b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0)
  );

  // Determine the latest batch of transactions (either the added count or latest 48h of charges)
  const latestDate = sortedByDateDesc[0]?.date || monthStart;
  const latestDateMs = new Date(`${latestDate}T12:00:00`).getTime();
  const twoDaysAgoMs = latestDateMs - 2 * 86_400_000;

  let batchTxns = sortedByDateDesc.filter((t) => {
    const ms = new Date(`${t.date}T12:00:00`).getTime();
    return ms >= twoDaysAgoMs;
  });

  if (addedCount > 0 && sortedByDateDesc.length >= addedCount) {
    batchTxns = sortedByDateDesc.slice(0, Math.max(addedCount, Math.min(batchTxns.length, 8)));
  } else if (batchTxns.length === 0) {
    batchTxns = sortedByDateDesc.slice(0, 5);
  }

  const batchDebits = batchTxns.filter((t) => t.amount < 0);
  const batchCredits = batchTxns.filter((t) => t.amount > 0);
  const recentSpendDollars = batchDebits.reduce((s, t) => s + Math.abs(t.amount), 0);
  const recentIncomeDollars = batchCredits.reduce((s, t) => s + t.amount, 0);

  const topCharges = [...batchDebits]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 3)
    .map((t) => ({
      merchant: cleanMerchantLabel(t.merchantKey || t.description || 'Charge'),
      amount: Math.abs(t.amount),
      date: t.date,
      category: t.category || 'Uncategorized',
    }));

  // Current month totals
  const curMonthTxns = validTxns.filter((t) => t.date >= monthStart && t.date <= monthEnd);
  const monthSpendToDate = curMonthTxns
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const monthIncomeToDate = curMonthTxns
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);

  const fState = useForecastStore.getState();
  const activeStreams =
    fState.incomeStreams.length > 0
      ? fState.incomeStreams
      : forecastBaseline?.incomeStreams || [];
  const monthIncomeExpected =
    activeStreams.length > 0
      ? computeTotalNetIncome(activeStreams, fState.taxRate)
      : forecastBaseline?.baseline.income || fState.baseIncome || monthIncomeToDate || 5000;

  const totalBudgetFromStore =
    (fState.recurringBudget || forecastBaseline?.baseline.recurring || 0) +
    (fState.variableBudget || forecastBaseline?.baseline.variable || 0);
  let totalBudgetFromRows = 0;
  for (const b of budgets) {
    totalBudgetFromRows += b.amount || 0;
  }
  const monthBudgetTarget =
    totalBudgetFromStore > 0
      ? totalBudgetFromStore
      : totalBudgetFromRows > 0
        ? totalBudgetFromRows
        : Math.max(monthSpendToDate, monthIncomeExpected * 0.75);

  const monthCashRemainder = monthIncomeExpected - monthSpendToDate;
  const monthSharePct =
    monthBudgetTarget > 0 ? Math.round((recentSpendDollars / monthBudgetTarget) * 1000) / 10 : 0;

  // Projected month-end and full-year spend based on current pace
  const dailyPace = monthSpendToDate / dayOfMonth;
  const projectedMonthEndSpend = Math.max(monthSpendToDate, Math.round(dailyPace * daysInMonth));
  const projectedAnnualSpend = projectedMonthEndSpend * 12;

  // If this recent batch of spend repeated weekly/biweekly over a year + 10-yr S&P 500 @ 8.5%
  const annualizedRecentHabitCost = Math.round(recentSpendDollars * 52);
  const rMo = 0.085 / 12;
  const monthlyEquivalent = annualizedRecentHabitCost / 12;
  const tenYearInvestedOpportunity = Math.round(
    monthlyEquivalent * ((Math.pow(1 + rMo, 120) - 1) / rMo)
  );

  const effectiveCount = addedCount > 0 ? addedCount : batchDebits.length;

  return {
    addedCount: effectiveCount,
    recentWindowLabel: addedCount > 0 ? `${addedCount} new synced transaction${addedCount === 1 ? '' : 's'}` : `Latest activity (${latestDate})`,
    recentSpendDollars,
    recentIncomeDollars,
    topCharges,
    currentMonthLabel: monthLabel(curMonthKey),
    monthSpendToDate,
    monthBudgetTarget,
    monthIncomeExpected,
    monthCashRemainder,
    monthSharePct,
    projectedMonthEndSpend,
    projectedAnnualSpend,
    annualizedRecentHabitCost,
    tenYearInvestedOpportunity,
    aiPrompt: 'Has anything big hit my accounts recently and how does it impact my month and year?',
  };
}

export function maybeSendNativeSyncNotification(
  summary: SyncSpendImpactSummary,
  force = false
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const todayKey = new Date().toISOString().slice(0, 10);
  if (!force) {
    try {
      const lastDate = localStorage.getItem(LAST_NOTIFIED_DATE_KEY);
      if (lastDate === todayKey) {
        return false;
      }
      localStorage.setItem(LAST_NOTIFIED_DATE_KEY, todayKey);
    } catch {
      // ignore storage errors
    }
  }

  const topStr =
    summary.topCharges.length > 0
      ? summary.topCharges.map((c) => `${c.merchant} (${usd.format(c.amount)})`).join(', ')
      : `${summary.addedCount} new transaction(s)`;

  const title =
    summary.recentSpendDollars > 0
      ? `🔔 ${usd.format(summary.recentSpendDollars)} New Spend · ${summary.currentMonthLabel} at ${usd.format(summary.monthSpendToDate)}`
      : `🔔 ${summary.addedCount} New Bank Transaction${summary.addedCount === 1 ? '' : 's'} Synced`;

  const body = [
    `Recent: ${topStr}`,
    `Month: ${usd.format(summary.monthSpendToDate)} spent (${summary.monthCashRemainder >= 0 ? `+${usd.format(summary.monthCashRemainder)} left` : `${usd.format(summary.monthCashRemainder)} over`})`,
    `Year Pace: ${usd.format(summary.projectedAnnualSpend)}/yr`,
  ].join(' · ');

  try {
    const notif = new Notification(title, {
      body,
      tag: 'strictly-daily-sync-impact',
    });
    notif.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent('open-ai-with-prompt', { detail: { prompt: summary.aiPrompt } })
      );
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}
