import { api } from '../api';
import { usd, monthLabel } from '../lib';
import { useFilters } from '../stores/store';
import { useForecastStore, computeTotalNetIncome } from '../stores/forecastStore';
import { useBudgetStore } from '../stores/budgetStore';
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
    aiPrompt: 'Show my Damage Report: recent charges and their impact on my month and full year',
  };
}

export const PHONE_PUSH_TOPIC_KEY = 'strictly_phone_push_ntfy_topic';

export function getPhonePushTopic(): string {
  try {
    return (localStorage.getItem(PHONE_PUSH_TOPIC_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setPhonePushTopic(topic: string): void {
  try {
    const cleaned = topic.trim();
    if (cleaned) {
      localStorage.setItem(PHONE_PUSH_TOPIC_KEY, cleaned);
    } else {
      localStorage.removeItem(PHONE_PUSH_TOPIC_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function generatePhonePushTopic(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `strictly-spend-${hex}`;
}

export function getDeepLinkOpenSpendImpactUrl(overrideBaseUrl?: string): string {
  if (overrideBaseUrl && overrideBaseUrl.trim()) {
    const base = overrideBaseUrl.trim().replace(/\/+$/, '');
    return `${base}/?openSpendImpact=1`;
  }
  if (typeof window !== 'undefined') {
    const { origin, pathname, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'https://barnesy.github.io/strictly-spending/?openSpendImpact=1';
    }
    return `${origin}${pathname}?openSpendImpact=1`;
  }
  return 'https://barnesy.github.io/strictly-spending/?openSpendImpact=1';
}

export async function sendPhonePushNotification(
  summary: SyncSpendImpactSummary,
  customTopic?: string,
  clickUrl?: string
): Promise<boolean> {
  const topic = (customTopic ?? getPhonePushTopic()).trim();
  if (!topic) return false;

  const topStr =
    summary.topCharges.length > 0
      ? summary.topCharges.map((c) => `${c.merchant} (${usd.format(c.amount)})`).join(', ')
      : `${summary.addedCount} new transaction(s)`;

  const title =
    summary.recentSpendDollars > 0
      ? `${usd.format(summary.recentSpendDollars)} New Spend · ${summary.currentMonthLabel} at ${usd.format(summary.monthSpendToDate)}`
      : `${summary.addedCount} New Bank Transaction${summary.addedCount === 1 ? '' : 's'} Synced`;

  const body = [
    `Recent: ${topStr}`,
    `Month (${summary.currentMonthLabel}): ${usd.format(summary.monthSpendToDate)} spent (${summary.monthCashRemainder >= 0 ? `+${usd.format(summary.monthCashRemainder)} cash left` : `${usd.format(Math.abs(summary.monthCashRemainder))} over income`}) · Est. EOM ${usd.format(summary.projectedMonthEndSpend)}`,
    `Full-Year Pace: ${usd.format(summary.projectedAnnualSpend)}/yr (10-yr invested cost: ${usd.format(summary.tenYearInvestedOpportunity)})`,
    `Tap to open Strictly Spending and analyze with Ask AI.`,
  ].join('\n');

  const targetUrl = getDeepLinkOpenSpendImpactUrl(clickUrl);

  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Title: title,
        Click: targetUrl,
        Tags: 'money_with_wings,chart_with_upwards_trend',
        Priority: 'default',
      },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function maybeSendNativeSyncNotification(
  summary: SyncSpendImpactSummary,
  force = false
): boolean {
  if (typeof window === 'undefined') return false;

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

  // Also dispatch to ntfy.sh phone push if the user configured a phone topic
  if (getPhonePushTopic()) {
    void sendPhonePushNotification(summary);
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
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

  const targetUrl = getDeepLinkOpenSpendImpactUrl();

  // Prefer ServiceWorker registration on mobile PWAs (Android Chrome / iOS Home Screen)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg && 'showNotification' in reg) {
          return reg.showNotification(title, {
            body,
            tag: 'strictly-daily-sync-impact',
            icon: './icon-192.png',
            badge: './icon-192.png',
            data: { url: targetUrl, prompt: summary.aiPrompt },
          });
        }
        return undefined;
      })
      .catch(() => {
        // Fallback below if ServiceWorker notification fails
      });
  }

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
    return true;
  }
}

export interface CategoryBudgetBreachAlert {
  category: string;
  monthLabel: string;
  actualSpend: number;
  budgetAmount: number;
  overBy: number;
  pctUsed: number;
  aiPrompt: string;
}

const NOTIFIED_BUDGET_BREACHES_KEY = 'strictly_notified_budget_breaches';

function readNotifiedBreaches(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(NOTIFIED_BUDGET_BREACHES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writeNotifiedBreaches(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(NOTIFIED_BUDGET_BREACHES_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export async function checkAndNotifyBudgetAlerts(
  forceCategory?: string
): Promise<CategoryBudgetBreachAlert[]> {
  const alertCategories = useBudgetStore.getState().alertCategories;
  if (!alertCategories || alertCategories.size === 0) return [];

  const demoMode = useFilters.getState().demoMode;
  const now = new Date();
  const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStart = `${curMonthKey}-01`;
  const monthEnd = `${curMonthKey}-31`;

  const [txns, budgets, trailingAverages] = await Promise.all([
    api.getTransactions(monthStart, monthEnd),
    api.getBudgets().catch(() => []),
    api.getCategoryTrailingAverages(demoMode, undefined).catch(() => []),
  ]);

  const actualByCat = new Map<string, number>();
  for (const t of txns) {
    if (demoMode ? t.source !== 'demo' : t.source === 'demo') continue;
    if (t.amount >= 0) continue;
    const cat = t.category || 'Uncategorized';
    actualByCat.set(cat, (actualByCat.get(cat) || 0) + Math.abs(t.amount));
  }

  const budgetByCat = new Map(budgets.map((b) => [b.category, b] as const));
  const avgByCat = new Map(trailingAverages.map((a) => [a.category, a.average] as const));

  const notifiedMap = readNotifiedBreaches();
  const triggered: CategoryBudgetBreachAlert[] = [];

  for (const category of alertCategories) {
    if (forceCategory && category !== forceCategory) continue;
    const b = budgetByCat.get(category);
    const targetBudget =
      b && b.userSet
        ? b.monthlyAmount
        : Math.round((avgByCat.get(category) ?? b?.monthlyAmount ?? 0) * 100) / 100;
    if (targetBudget <= 0) continue;

    const actual = Math.round((actualByCat.get(category) || 0) * 100) / 100;
    if (actual <= targetBudget) continue;

    const dedupeKey = `${curMonthKey}:::${category}:::${Math.round(targetBudget)}`;
    if (!forceCategory && notifiedMap[dedupeKey]) continue;

    notifiedMap[dedupeKey] = true;
    const overBy = Math.round((actual - targetBudget) * 100) / 100;
    const pctUsed = Math.round((actual / targetBudget) * 100);
    const alertItem: CategoryBudgetBreachAlert = {
      category,
      monthLabel: monthLabel(curMonthKey),
      actualSpend: actual,
      budgetAmount: targetBudget,
      overBy,
      pctUsed,
      aiPrompt: `How much did I spend on ${category} this month and how do I get back under my ${usd.format(targetBudget)} budget?`,
    };
    triggered.push(alertItem);
  }

  if (triggered.length > 0) {
    writeNotifiedBreaches(notifiedMap);
    for (const item of triggered) {
      dispatchBudgetBreachNotifications(item);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('budget-breach-alert', { detail: triggered[0] }));
    }
  }

  return triggered;
}

function dispatchBudgetBreachNotifications(item: CategoryBudgetBreachAlert): void {
  const title = `🚨 ${item.category} Crossed Budget (${usd.format(item.actualSpend)} / ${usd.format(item.budgetAmount)})`;
  const body = `${item.monthLabel}: You are ${usd.format(item.overBy)} over your ${usd.format(item.budgetAmount)}/mo ${item.category} budget (${item.pctUsed}% used).`;
  const targetUrl = getDeepLinkOpenSpendImpactUrl();

  const topic = getPhonePushTopic();
  if (topic) {
    void fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Title: `${item.category} Crossed Budget (${usd.format(item.actualSpend)} / ${usd.format(item.budgetAmount)})`,
        Click: targetUrl,
        Tags: 'rotating_light,money_with_wings',
        Priority: 'high',
      },
      body: `${body}\nTap to open Strictly Spending and review with Ask AI.`,
    }).catch(() => {});
  }

  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg && 'showNotification' in reg) {
          return reg.showNotification(title, {
            body,
            tag: `strictly-budget-breach-${item.category}`,
            icon: './icon-192.png',
            badge: './icon-192.png',
            data: { url: targetUrl, prompt: item.aiPrompt },
          });
        }
        return undefined;
      })
      .catch(() => {});
  }

  try {
    const notif = new Notification(title, {
      body,
      tag: `strictly-budget-breach-${item.category}`,
    });
    notif.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent('open-ai-with-prompt', { detail: { prompt: item.aiPrompt } })
      );
      notif.close();
    };
  } catch {
    // ignore on platforms that require ServiceWorker notifications
  }
}


