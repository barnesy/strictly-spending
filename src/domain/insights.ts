import type { Transaction, MerchantOverride, RecurrenceKind } from '../types';
import { detectRecurrence } from './recurrence';
import { formatCleanMerchantName } from './forecastSpending';

export interface PriceSpike {
  merchantKey: string;
  merchantName: string;
  oldPrice: number;
  newPrice: number;
  percentageChange: number;
  annualImpact: number;
  date: string;
}

export interface DuplicateCharge {
  merchantKey: string;
  merchantName: string;
  amount: number;
  dates: string[];
}

export interface OverlappingSubscription {
  groupName: string;
  merchants: string[];
  totalEstMonthly: number;
}

export interface ActiveSubscriptionItem {
  merchantKey: string;
  name: string;
  estMonthlyCost: number;
  annualCost: number;
  cat: string;
  frequency: RecurrenceKind;
  lastDate: string;
  lastAmount: number;
  chargeCount: number;
  isGrayCharge: boolean;
  hasPriceHike: boolean;
}

export interface SubscriptionAlerts {
  priceSpikes: PriceSpike[];
  duplicateCharges: DuplicateCharge[];
  overlappingSubscriptions: OverlappingSubscription[];
  activeSubscriptions: ActiveSubscriptionItem[];
}

export interface CategorySpike {
  category: string;
  currentPeriodSpend: number;
  baselineMonthlySpend: number;
  percentageChange: number;
  durationMonths: number;
}

export interface TransactionOutlier {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: number;
  multiplier: number; // e.g. 2.5 times average
}

export interface SpendingAnomalies {
  categorySpikes: CategorySpike[];
  outliers: TransactionOutlier[];
}

const SUB_GROUPS = [
  { name: 'Music & Audio', keys: ['spotify', 'applemusic', 'pandora', 'tidal', 'deezer', 'youtubemusic', 'audible', 'siriusxm'] },
  { name: 'Video Streaming', keys: ['netflix', 'hulu', 'disney', 'hbo', 'max', 'youtubepremium', 'youtubetv', 'primevideo', 'paramount', 'peacock', 'appletv', 'crunchyroll', 'fubo', 'sling', 'starz'] },
  { name: 'Cloud & Productivity', keys: ['dropbox', 'icloud', 'googleone', 'googledrive', 'microsoft365', 'onedrive', 'adobe', 'notion', '1password', 'canva'] },
  { name: 'AI & Developer Tools', keys: ['chatgpt', 'openai', 'copilot', 'midjourney', 'claude', 'anthropic', 'cursor', 'perplexity', 'github'] },
  { name: 'Delivery & Memberships', keys: ['dashpass', 'uberone', 'instacart', 'walmartplus', 'amazonprime', 'costco', 'samsclub', 'bjs'] },
  { name: 'Fitness & Wellness', keys: ['peloton', 'planetfitness', 'equinox', 'ymca', 'lafitness', 'orangetheory', 'strava', 'whoop', 'oura', 'headspace', 'calm'] },
];

const RECURRING_LIKE_CATEGORIES = new Set([
  'subscriptions',
  'subscription',
  'streaming',
  'utilities',
  'insurance',
  'internet',
  'phone',
  'software',
  'memberships',
]);

export function detectSubscriptionAlerts(
  allTxns: Transaction[],
  overrides: MerchantOverride[]
): SubscriptionAlerts {
  const priceSpikes: PriceSpike[] = [];
  const duplicateCharges: DuplicateCharge[] = [];
  const overlappingSubscriptions: OverlappingSubscription[] = [];

  // Group transactions by canonical clean merchant name so slight bank description changes stay grouped
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of allTxns) {
    if (t.amount >= 0) continue;
    const rawKey = (t.merchantKey || t.description || '').trim();
    if (!rawKey) continue;
    const cleanKey = formatCleanMerchantName(rawKey) || rawKey;
    const list = byMerchant.get(cleanKey);
    if (list) list.push(t);
    else byMerchant.set(cleanKey, [t]);
  }

  const overrideMap = new Map<string, MerchantOverride>();
  for (const o of overrides) {
    overrideMap.set(o.merchantKey, o);
    const cleaned = formatCleanMerchantName(o.merchantKey);
    if (cleaned) overrideMap.set(cleaned, o);
  }

  const activeSubs: ActiveSubscriptionItem[] = [];

  for (const [merchantKey, txns] of byMerchant) {
    const spendTxns = txns
      .filter((t) => t.amount < 0)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    if (spendTxns.length === 0) continue;

    const auto = detectRecurrence(spendTxns);
    const rawKeys = new Set(spendTxns.map((t) => t.merchantKey).filter(Boolean));
    let override = overrideMap.get(merchantKey);
    if (!override) {
      for (const rk of rawKeys) {
        const found = overrideMap.get(rk);
        if (found) {
          override = found;
          break;
        }
      }
    }

    let finalKind: RecurrenceKind = override ? override.recurrence : auto.kind;

    // Also include merchants explicitly flagged recurring or in a subscription/utility category with >= 2 charges
    const hasExplicitRecurringFlag = spendTxns.some((t) => t.recurrence === 'recurring');
    const latestCatLower = (spendTxns[spendTxns.length - 1].category || '').toLowerCase();
    const isSubCategory = RECURRING_LIKE_CATEGORIES.has(latestCatLower);

    if (finalKind === 'none' && spendTxns.length >= 2 && (hasExplicitRecurringFlag || isSubCategory)) {
      finalKind = 'monthly';
    }

    if (finalKind === 'none') continue;

    const latestTx = spendTxns[spendTxns.length - 1];
    const latestAmt = Math.abs(latestTx.amount);

    // Calculate est monthly cost
    const meanAmount =
      auto.meanAmount > 0
        ? auto.meanAmount
        : spendTxns.reduce((s, t) => s + Math.abs(t.amount), 0) / spendTxns.length;

    let estMonthlyCost = auto.estMonthlyCost;
    if (estMonthlyCost <= 0 || (override && finalKind !== auto.kind)) {
      switch (finalKind) {
        case 'monthly': estMonthlyCost = latestAmt || meanAmount; break;
        case 'biweekly': estMonthlyCost = (latestAmt || meanAmount) * (30 / 14); break;
        case 'weekly': estMonthlyCost = (latestAmt || meanAmount) * (30 / 7); break;
        case 'annual': estMonthlyCost = (latestAmt || meanAmount) / 12; break;
        default: estMonthlyCost = latestAmt || meanAmount; break;
      }
    }

    // 1. Detect Price Spikes ("Bill Creep")
    let hasPriceHike = false;
    if (spendTxns.length >= 2) {
      const prevTx = spendTxns[spendTxns.length - 2];
      const prevAmt = Math.abs(prevTx.amount);
      // Also compute median of prior charges (up to 4 prior charges) to avoid false positives from one-off promos
      const priorAmounts = spendTxns
        .slice(Math.max(0, spendTxns.length - 5), spendTxns.length - 1)
        .map((t) => Math.abs(t.amount))
        .sort((a, b) => a - b);
      const baselineAmt =
        priorAmounts.length > 0
          ? priorAmounts[Math.floor(priorAmounts.length / 2)]
          : prevAmt;

      const refOldPrice = baselineAmt > 0 ? baselineAmt : prevAmt;
      const diff = latestAmt - refOldPrice;
      const pctChange = refOldPrice > 0 ? (diff / refOldPrice) * 100 : 0;

      // Flag when price rose by at least $0.75 and >= 2.5%
      if (diff >= 0.75 && pctChange >= 2.5) {
        hasPriceHike = true;
        const multiplier =
          finalKind === 'annual' ? 1 : finalKind === 'weekly' ? 52 : finalKind === 'biweekly' ? 26 : 12;
        priceSpikes.push({
          merchantKey,
          merchantName: merchantKey,
          oldPrice: refOldPrice,
          newPrice: latestAmt,
          percentageChange: pctChange,
          annualImpact: diff * multiplier,
          date: latestTx.date,
        });
      }
    }

    if (estMonthlyCost > 0) {
      const cat = latestTx.category || 'Uncategorized';
      const isLoanOrHousing = /mortgage|rent|loan|tax/i.test(`${cat} ${merchantKey}`);
      if (!isLoanOrHousing) {
        activeSubs.push({
          merchantKey,
          name: merchantKey,
          estMonthlyCost,
          annualCost: estMonthlyCost * 12,
          cat,
          frequency: finalKind,
          lastDate: latestTx.date,
          lastAmount: latestAmt,
          chargeCount: spendTxns.length,
          isGrayCharge: estMonthlyCost <= 22 && spendTxns.length >= 2,
          hasPriceHike,
        });
      }
    }

    // 2. Detect Double Billing (Same amount charged within 18 days)
    if (spendTxns.length >= 2) {
      for (let i = 1; i < spendTxns.length; i++) {
        const t1 = spendTxns[i - 1];
        const t2 = spendTxns[i];
        const d1 = new Date(t1.date);
        const d2 = new Date(t2.date);
        const diffDays = Math.round(Math.abs(d2.getTime() - d1.getTime()) / 86_400_000);

        if (diffDays > 0 && diffDays <= 18 && Math.abs(t1.amount - t2.amount) < 0.01 && finalKind !== 'weekly' && finalKind !== 'biweekly') {
          const alreadyLogged = duplicateCharges.some(
            (c) => c.merchantKey === merchantKey && c.dates.includes(t2.date)
          );
          if (!alreadyLogged) {
            duplicateCharges.push({
              merchantKey,
              merchantName: merchantKey,
              amount: Math.abs(t2.amount),
              dates: [t1.date, t2.date],
            });
          }
        }
      }
    }
  }

  activeSubs.sort((a, b) => b.estMonthlyCost - a.estMonthlyCost);
  priceSpikes.sort((a, b) => b.annualImpact - a.annualImpact);

  // 3. Detect Overlapping Subscriptions in the same grouping
  const groupedSubs = new Map<string, ActiveSubscriptionItem[]>();
  for (const sub of activeSubs) {
    const normKey = sub.merchantKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedGroup = SUB_GROUPS.find((group) =>
      group.keys.some((k) => normKey.includes(k) || k.includes(normKey))
    );

    if (matchedGroup) {
      const list = groupedSubs.get(matchedGroup.name) || [];
      list.push(sub);
      groupedSubs.set(matchedGroup.name, list);
    }
  }

  for (const [groupName, list] of groupedSubs) {
    if (list.length > 1) {
      overlappingSubscriptions.push({
        groupName,
        merchants: list.map((item) => item.name),
        totalEstMonthly: list.reduce((sum, item) => sum + item.estMonthlyCost, 0),
      });
    }
  }

  return {
    priceSpikes,
    duplicateCharges,
    overlappingSubscriptions,
    activeSubscriptions: activeSubs,
  };
}

export function detectSpendingAnomalies(
  allTxns: Transaction[],
  categoriesList: string[],
  startDateStr: string,
  endDateStr: string,
  monthlyBudgets: { category: string; monthlyAmount: number }[]
): SpendingAnomalies {
  const categorySpikes: CategorySpike[] = [];
  const outliers: TransactionOutlier[] = [];

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  const filterCats = new Set(categoriesList.map(c => c.toLowerCase()));
  const isAll = categoriesList.includes('all') || categoriesList.length === 0;

  // Calculate range days
  const currentDiffTime = Math.abs(end.getTime() - start.getTime());
  const currentDays = Math.max(1, Math.ceil(currentDiffTime / (1000 * 60 * 60 * 24)) + 1);
  const durationMonths = currentDays / 30;

  // Set historical baseline period: 90 days before startDateStr
  const baselineStart = new Date(start);
  baselineStart.setDate(start.getDate() - 90);
  const baselineEnd = new Date(start);
  baselineEnd.setDate(start.getDate() - 1);

  // Group spend transactions by category
  const currentRangeSpends = new Map<string, Transaction[]>();
  const historicalBaselineSpends = new Map<string, Transaction[]>();
  const allSpends = new Map<string, Transaction[]>();

  for (const t of allTxns) {
    if (t.amount >= 0) continue; // spend only
    const catLower = t.category.toLowerCase();
    if (!isAll && !filterCats.has(catLower)) continue;

    // All spends for statistics
    const listAll = allSpends.get(t.category) || [];
    listAll.push(t);
    allSpends.set(t.category, listAll);

    if (t.date >= startDateStr && t.date <= endDateStr) {
      const listCurrent = currentRangeSpends.get(t.category) || [];
      listCurrent.push(t);
      currentRangeSpends.set(t.category, listCurrent);
    } else if (t.date >= baselineStart.toISOString().slice(0, 10) && t.date <= baselineEnd.toISOString().slice(0, 10)) {
      const listHist = historicalBaselineSpends.get(t.category) || [];
      listHist.push(t);
      historicalBaselineSpends.set(t.category, listHist);
    }
  }

  // Iterate over each category to find Category Spikes and Outliers
  const activeCategories = Array.from(new Set([...currentRangeSpends.keys()]));

  for (const cat of activeCategories) {
    const currentTxns = currentRangeSpends.get(cat) || [];
    const currentSpendTotal = currentTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    if (currentSpendTotal === 0) continue;

    const currentMonthlyPace = currentSpendTotal * (30 / currentDays);

    // Get historical average spend
    const histTxns = historicalBaselineSpends.get(cat) || [];
    let baselineMonthlySpend = 0;

    if (histTxns.length > 0) {
      const histSpendTotal = histTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      baselineMonthlySpend = histSpendTotal * (30 / 90); // scaled to monthly figure
    } else {
      // Fallback to category budget
      const matchedBudget = monthlyBudgets.find((b) => b.category.toLowerCase() === cat.toLowerCase());
      baselineMonthlySpend = matchedBudget ? matchedBudget.monthlyAmount : 0;
    }

    if (baselineMonthlySpend > 0 && currentMonthlyPace > baselineMonthlySpend * 1.2 && currentSpendTotal > 50) {
      categorySpikes.push({
        category: cat,
        currentPeriodSpend: currentSpendTotal,
        baselineMonthlySpend,
        percentageChange: ((currentMonthlyPace - baselineMonthlySpend) / baselineMonthlySpend) * 100,
        durationMonths
      });
    }

    // Outlier Detection
    const categoryAllTxns = allSpends.get(cat) || [];
    if (categoryAllTxns.length >= 3) {
      // Calculate mean and standard deviation
      const amounts = categoryAllTxns.map((t) => Math.abs(t.amount));
      const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
      const variance = amounts.reduce((sum, val) => sum + (val - mean) ** 2, 0) / amounts.length;
      const stddev = Math.sqrt(variance);

      // We enforce a minimum standard deviation to avoid tiny variations (like $2) flagging outliers in flat categories
      const effectiveStddev = Math.max(15, stddev);

      for (const t of currentTxns) {
        const amt = Math.abs(t.amount);
        if (amt > mean + 2.0 * effectiveStddev && amt > 75) {
          outliers.push({
            id: t.id!,
            date: t.date,
            description: t.description,
            category: t.category,
            amount: amt,
            multiplier: amt / mean,
          });
        }
      }
    } else if (categoryAllTxns.length > 0) {
      // Sparse data fallback: check if transaction is > 2.5x the average of other transactions
      const amounts = categoryAllTxns.map((t) => Math.abs(t.amount));
      const average = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;

      for (const t of currentTxns) {
        const amt = Math.abs(t.amount);
        if (amt > average * 2.5 && amt > 75) {
          outliers.push({
            id: t.id!,
            date: t.date,
            description: t.description,
            category: t.category,
            amount: amt,
            multiplier: amt / average,
          });
        }
      }
    }
  }

  // Sort outliers by multiplier descending (most anomalous first)
  outliers.sort((a, b) => b.multiplier - a.multiplier);

  return {
    categorySpikes,
    outliers,
  };
}
