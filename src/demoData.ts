/**
 * Demo data generator.
 *
 * Produces ~250 synthetic transactions across 3 fictional accounts spanning
 * Jan through the current month of the current year. The dataset is shaped
 * to make every dashboard feature show something interesting:
 *   - Recurring detection picks up rent, auto loan, insurance, utilities,
 *     subscriptions, gym (Monthly cadence, 5 hits each)
 *   - Budgets card sees variable categories (groceries, restaurants, gas,
 *     shopping, etc.) with realistic trailing-3-mo averages
 *   - One-time hits (vacation hotel, big appliance) populate the One-Time view
 *
 * Deterministic — same dataset every time, so screenshots can be reproduced.
 * Idempotent — seeding twice does nothing on the second call.
 * Non-destructive — doesn't touch any user-imported account or transaction.
 */

import { db } from './db';
import type { Account, Transaction } from './types';
import { extractMerchantKey } from './categorize';
import { refreshRecurrenceAll } from './recurrence';

const ACCOUNTS = {
  checking: 'Demo: Checking',
  credit: 'Demo: Credit Card',
  joint: 'Demo: Joint Card',
} as const;

// Mulberry32: tiny deterministic PRNG so jitter is reproducible.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoTxn {
  date: string;
  description: string;
  amount: number; // negative = spend, positive = income/return
  category: string;
  account: keyof typeof ACCOUNTS;
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function clampDay(y: number, m: number, d: number): number {
  // Avoid 'Feb 30' etc. by clamping to last day of month.
  const last = new Date(y, m + 1, 0).getDate();
  return Math.min(d, last);
}

export function buildDemoTransactions(
  year: number,
  throughMonth: number // inclusive (0-based)
): DemoTxn[] {
  const out: DemoTxn[] = [];
  const months: number[] = [];
  for (let m = 0; m <= throughMonth; m++) months.push(m);

  const rand = mulberry32(20260524);
  const jitter = (min: number, max: number) =>
    Math.round((min + rand() * (max - min)) * 100) / 100;
  const pickDay = (base: number, range: number) =>
    clampDay(year, 0, base + Math.floor(rand() * range) - Math.floor(range / 2));

  // -------- Recurring monthly --------

  // Housing — rent on the 1st
  for (const m of months) {
    out.push({
      date: isoDate(year, m, 1),
      description: 'DEMO PROPERTY MGMT RENT',
      amount: -1950,
      category: 'Housing',
      account: 'checking',
    });
  }

  // Auto loan — 15th
  for (const m of months) {
    out.push({
      date: isoDate(year, m, 15),
      description: 'DEMO AUTO FINANCE ACH PMT',
      amount: -389,
      category: 'Auto Loan',
      account: 'checking',
    });
  }

  // Insurance — 20th
  for (const m of months) {
    out.push({
      date: isoDate(year, m, 20),
      description: 'DEMO INSURANCE CO PREM',
      amount: -145,
      category: 'Insurance',
      account: 'checking',
    });
  }

  // Utilities — electric (25th) + internet (5th)
  for (const m of months) {
    out.push({
      date: isoDate(year, m, clampDay(year, m, 25)),
      description: 'DEMO POWER COMPANY',
      amount: -jitter(110, 165),
      category: 'Utilities',
      account: 'checking',
    });
    out.push({
      date: isoDate(year, m, 5),
      description: 'DEMO INTERNET INC',
      amount: -80,
      category: 'Utilities',
      account: 'checking',
    });
  }

  // Subscriptions
  const subs = [
    { day: 10, label: 'NETFLIX.COM', amount: -17.99 },
    { day: 15, label: 'SPOTIFY USA', amount: -12.99 },
    { day: 18, label: 'APPLE MUSIC SUBSCRIPTION', amount: -10.99 },
    { day: 5, label: 'APPLE.COM/BILL', amount: -4.99 },
    { day: 20, label: 'CLAUDE.AI SUBSCRIPTION', amount: -20.0 },
  ];
  for (const m of months) {
    for (const s of subs) {
      out.push({
        date: isoDate(year, m, clampDay(year, m, s.day)),
        description: s.label,
        amount: m === throughMonth && s.label === 'NETFLIX.COM' ? -22.99 : s.amount,
        category: 'Subscriptions',
        account: 'credit',
      });
    }
    // Claude.ai duplicate charge in the current/last month
    if (m === throughMonth) {
      out.push({
        date: isoDate(year, m, 22),
        description: 'CLAUDE.AI SUBSCRIPTION',
        amount: -20.00,
        category: 'Subscriptions',
        account: 'credit',
      });
    }
  }

  // Gym — monthly Health
  for (const m of months) {
    out.push({
      date: isoDate(year, m, 1),
      description: 'DEMO FITNESS CLUB',
      amount: -39.99,
      category: 'Health',
      account: 'checking',
    });
  }

  // Bi-weekly payroll (Income) — every 14 days starting Jan 3
  const start = new Date(year, 0, 3);
  const today = new Date(year, throughMonth + 1, 0);
  let cursor = new Date(start);
  while (cursor <= today) {
    out.push({
      date: isoDate(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate()
      ),
      description: 'DEMO EMPLOYER PAYROLL',
      amount: 4200,
      category: 'Income',
      account: 'checking',
    });
    cursor.setDate(cursor.getDate() + 14);
  }

  // -------- Variable spend --------

  // Groceries: 5-7 visits/month at $50-95 → ~$420/mo
  const groceryMerchants = ['DEMO MARKET', 'DEMO GROCER', 'DEMO FRESH FOODS'];
  for (const m of months) {
    const visits = 5 + Math.floor(rand() * 3);
    for (let v = 0; v < visits; v++) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description:
          groceryMerchants[Math.floor(rand() * groceryMerchants.length)],
        amount: -jitter(40, 95),
        category: 'Groceries',
        account: rand() < 0.7 ? 'credit' : 'joint',
      });
    }
    // Add outlier and pacing spike transactions in the last month
    if (m === throughMonth) {
      out.push({
        date: isoDate(year, m, 12),
        description: 'DEMO FRESH FOODS BULK STOCK',
        amount: -180.00,
        category: 'Groceries',
        account: 'credit',
      });
      out.push({
        date: isoDate(year, m, 18),
        description: 'DEMO MARKET GIANT TRIP',
        amount: -290.00,
        category: 'Groceries',
        account: 'joint',
      });
      out.push({
        date: isoDate(year, m, 25),
        description: 'DEMO GROCER SPLURGE',
        amount: -220.00,
        category: 'Groceries',
        account: 'credit',
      });
    }
  }

  // Restaurants & Coffee
  const restaurants = [
    'DEMO PIZZA CO',
    'DEMO TAQUERIA',
    'DEMO RAMEN HOUSE',
    'DEMO BURGER BAR',
    'CHICK-FIL-A DEMO',
  ];
  const coffee = ['DEMO COFFEE ROASTERS', 'DEMO ESPRESSO BAR'];
  for (const m of months) {
    const r = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < r; i++) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description: restaurants[Math.floor(rand() * restaurants.length)],
        amount: -jitter(15, 65),
        category: 'Restaurants & Coffee',
        account: 'credit',
      });
    }
    const c = 6 + Math.floor(rand() * 6);
    for (let i = 0; i < c; i++) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description: coffee[Math.floor(rand() * coffee.length)],
        amount: -jitter(4, 12),
        category: 'Restaurants & Coffee',
        account: 'credit',
      });
    }
  }

  // Transportation — gas + rideshare
  for (const m of months) {
    const gasVisits = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < gasVisits; i++) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description: 'DEMO GAS STATION',
        amount: -jitter(28, 52),
        category: 'Transportation',
        account: 'credit',
      });
    }
    const rides = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < rides; i++) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description: 'DEMO RIDESHARE',
        amount: -jitter(8, 35),
        category: 'Transportation',
        account: 'credit',
      });
    }
  }

  // Health — pharmacy
  for (const m of months) {
    const visits = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < visits; i++) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description: 'DEMO PHARMACY',
        amount: -jitter(12, 65),
        category: 'Health',
        account: 'credit',
      });
    }
  }

  // Personal Care
  for (const m of months) {
    if (rand() < 0.8) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description: 'DEMO SALON',
        amount: -jitter(35, 85),
        category: 'Personal Care',
        account: 'credit',
      });
    }
  }

  // Shopping — online retailer + occasional household
  const shops = [
    'DEMO ONLINE RETAILER',
    'DEMO DEPT STORE',
    'DEMO HOME GOODS',
    'DEMO BOOKSHOP',
  ];
  for (const m of months) {
    const orders = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < orders; i++) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description: shops[Math.floor(rand() * shops.length)],
        amount: -jitter(18, 145),
        category: 'Shopping',
        account: rand() < 0.6 ? 'credit' : 'joint',
      });
    }
  }

  // Entertainment — occasional
  for (const m of months) {
    if (rand() < 0.7) {
      out.push({
        date: isoDate(year, m, pickDay(15, 28)),
        description: 'DEMO MOVIE THEATER',
        amount: -jitter(14, 38),
        category: 'Entertainment',
        account: 'credit',
      });
    }
  }

  // One-time outlays — vacation hotel in Mar, appliance in Apr
  if (throughMonth >= 2) {
    out.push({
      date: isoDate(year, 2, 14),
      description: 'DEMO BEACH RESORT 4-NIGHT STAY',
      amount: -850,
      category: 'Travel',
      account: 'credit',
    });
  }
  if (throughMonth >= 3) {
    out.push({
      date: isoDate(year, 3, 8),
      description: 'DEMO APPLIANCE WAREHOUSE',
      amount: -950,
      category: 'Shopping',
      account: 'joint',
    });
  }

  // A couple of credit card payments → Transfers
  for (const m of months) {
    out.push({
      date: isoDate(year, m, 28),
      description: 'DEMO BANK CREDIT CARD PAYMENT',
      amount: -1200,
      category: 'Transfers',
      account: 'checking',
    });
  }

  return out;
}

export async function hasDemoData(): Promise<boolean> {
  const c = await db.transactions.where('source').equals('demo').count();
  return c > 0;
}

interface SeedResult {
  added: number;
  alreadyPresent: boolean;
}

export async function seedDemoData(): Promise<SeedResult> {
  if (await hasDemoData()) {
    return { added: 0, alreadyPresent: true };
  }
  const now = new Date();
  const year = now.getFullYear();
  const throughMonth = now.getMonth(); // current month, 0-based

  // 1. Ensure demo accounts exist (idempotent — match by name).
  const accountIds: Record<keyof typeof ACCOUNTS, number> = {} as never;
  for (const key of Object.keys(ACCOUNTS) as (keyof typeof ACCOUNTS)[]) {
    const name = ACCOUNTS[key];
    const existing = await db.accounts.where('name').equals(name).first();
    if (existing) {
      accountIds[key] = existing.id!;
      const balance = key === 'checking' ? 12000 : key === 'credit' ? -1500 : -800;
      await db.accounts.update(existing.id!, { currentBalance: balance });
    } else {
      const balance = key === 'checking' ? 12000 : key === 'credit' ? -1500 : -800;
      const id = await db.accounts.add({
        name,
        type: key === 'checking' ? 'checking' : 'credit',
        institution: 'Demo Bank',
        source: 'demo',
        enabled: true,
        currentBalance: balance,
      } as Account);
      accountIds[key] = id as number;
    }
  }

  // 1.5. Seed merchant overrides to force recurring classification for demo services
  await db.merchantOverrides.put({ merchantKey: 'netflix', recurrence: 'monthly' });
  await db.merchantOverrides.put({ merchantKey: 'claudeai', recurrence: 'monthly' });
  await db.merchantOverrides.put({ merchantKey: 'spotify', recurrence: 'monthly' });
  await db.merchantOverrides.put({ merchantKey: 'applemusic', recurrence: 'monthly' });

  // 2. Build transactions for the current year through this month
  const demoTxns = buildDemoTransactions(year, throughMonth);

  // 3. Insert (assign dedupKeys with sequence counters so identical
  //    same-day-same-amount-same-desc rows are kept distinct)
  const seqCounter = new Map<string, number>();
  const rows: Omit<Transaction, 'id'>[] = demoTxns.map((d) => {
    const accountName = ACCOUNTS[d.account];
    const merchantKey = extractMerchantKey(d.description);
    const bucket = `${accountName}|${d.date}|${d.amount.toFixed(2)}|${d.description.trim().toLowerCase()}`;
    const seq = seqCounter.get(bucket) ?? 0;
    seqCounter.set(bucket, seq + 1);
    return {
      accountId: accountIds[d.account],
      date: d.date,
      description: d.description,
      amount: d.amount,
      category: d.category,
      source: 'demo',
      merchantKey,
      userOverridden: true, // demo data shouldn't be re-categorized by rules
      dedupKey: `${bucket}|${seq}`,
      recurrence: 'onetime',
    };
  });

  await db.transactions.bulkAdd(rows as Transaction[]);
  await refreshRecurrenceAll();
  return { added: rows.length, alreadyPresent: false };
}

interface ClearResult {
  removedTransactions: number;
  removedAccounts: number;
}

export async function clearDemoData(): Promise<ClearResult> {
  const txnIds = await db.transactions
    .where('source')
    .equals('demo')
    .primaryKeys();
  await db.transactions.bulkDelete(txnIds as number[]);

  const accts = await db.accounts.where('source').equals('demo').toArray();
  await db.accounts.bulkDelete(accts.map((a) => a.id!));

  // Clear demo overrides
  await db.merchantOverrides.bulkDelete(['netflix', 'claudeai', 'spotify', 'applemusic']);

  return {
    removedTransactions: txnIds.length,
    removedAccounts: accts.length,
  };
}

export async function clearImportedData(): Promise<ClearResult> {
  const txnIds = await db.transactions
    .where('source')
    .notEqual('demo')
    .primaryKeys();
  await db.transactions.bulkDelete(txnIds as number[]);

  const accts = await db.accounts.where('source').notEqual('demo').toArray();
  await db.accounts.bulkDelete(accts.map((a) => a.id!));

  await db.imports.clear();
  await refreshRecurrenceAll();

  return {
    removedTransactions: txnIds.length,
    removedAccounts: accts.length,
  };
}

