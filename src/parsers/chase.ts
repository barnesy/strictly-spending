import Papa from 'papaparse';
import type { ParsedTransaction } from '../types';
import { toIsoDate, parseMoney } from './index';

interface ChaseRow {
  'Transaction Date': string;
  'Post Date': string;
  Description: string;
  Category: string;
  Type: string;
  Amount: string;
  Memo: string;
}

const CHASE_LAST4_RE = /Chase(\d{4})_/i;

export function parseChase(
  filename: string,
  rawText: string
): { transactions: ParsedTransaction[]; warnings: string[] } {
  const warnings: string[] = [];
  const last4Match = filename.match(CHASE_LAST4_RE);
  const last4 = last4Match ? last4Match[1] : undefined;

  const parsed = Papa.parse<ChaseRow>(rawText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    warnings.push(`Chase parse errors: ${parsed.errors.length}`);
  }

  const transactions: ParsedTransaction[] = [];
  for (const row of parsed.data) {
    const date = row['Transaction Date'];
    const description = (row.Description || '').trim();
    const amountStr = row.Amount;
    if (!date || !description || amountStr == null || amountStr === '') continue;

    transactions.push({
      date: toIsoDate(date),
      description,
      amount: parseMoney(amountStr),
      rawCategory: (row.Category || '').trim() || undefined,
      source: 'chase',
      accountName: last4 ? `Chase ${last4}` : 'Chase Credit Card',
      accountType: 'credit',
      institution: 'Chase',
      last4,
    });
  }

  return { transactions, warnings };
}
