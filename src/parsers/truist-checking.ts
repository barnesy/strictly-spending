import Papa from 'papaparse';
import type { ParsedTransaction } from '../types';
import { toIsoDate, parseMoney } from './index';

interface TruistRow {
  'Posted Date': string;
  'Transaction Date': string;
  'Transaction Type': string;
  'Check/Serial #': string;
  'Full description': string;
  'Merchant name': string;
  'Category name': string;
  'Sub-category name': string;
  Amount: string;
  'Daily Posted Balance': string;
}

// Truist filenames look like: acct_5463_01_01_2026_to_03_31_2026.csv
const TRUIST_LAST4_RE = /acct[_-]?(\d{4})/i;

/**
 * Truist signs debits with parentheses, e.g. "($19.64)" = money out,
 * credits without, e.g. "$2575.97" = money in.
 * App convention: negative = spend.
 */
function parseTruistAmount(raw: string): number {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (s === '' || s === '-') return 0;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

export function parseTruistChecking(
  filename: string,
  rawText: string
): { transactions: ParsedTransaction[]; warnings: string[] } {
  const warnings: string[] = [];

  // Strip a BOM if present (some banks ship UTF-8 BOM)
  const cleanText = rawText.replace(/^﻿/, '');

  const parsed = Papa.parse<TruistRow>(cleanText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    warnings.push(`Truist parse errors: ${parsed.errors.length}`);
  }

  const last4Match = filename.match(TRUIST_LAST4_RE);
  const last4 = last4Match ? last4Match[1] : undefined;
  const accountName = last4
    ? `Truist Checking ${last4}`
    : 'Truist Checking';

  const transactions: ParsedTransaction[] = [];
  for (const row of parsed.data) {
    const date = (row['Transaction Date'] || row['Posted Date'] || '').trim();
    const description = (row['Full description'] || '').trim();
    const amountStr = row.Amount;
    if (!date || !description || amountStr == null || amountStr === '') continue;

    const amount = parseTruistAmount(amountStr);
    // Skip zero-amount housekeeping rows (e.g. ACH MISCELLANEOUS DEBIT 0.00)
    if (amount === 0) continue;

    // Prefer the more specific sub-category for rawCategory routing; fall
    // back to top-level category, then merchant name. The normalization
    // table in categorize.ts will map these into our unified taxonomy.
    const sub = (row['Sub-category name'] || '').trim();
    const cat = (row['Category name'] || '').trim();
    const rawCategory = sub || cat || undefined;

    transactions.push({
      date: toIsoDate(date),
      description,
      amount,
      rawCategory,
      source: 'truist-checking',
      accountName,
      accountType: 'checking',
      institution: 'Truist',
      last4,
      balance: parseMoney(row['Daily Posted Balance']),
    });
  }

  return { transactions, warnings };
}
