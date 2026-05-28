import Papa from 'papaparse';
import type { ParsedTransaction } from '../types';
import { toIsoDate, parseMoney } from './index';

interface BoaCheckingRow {
  Date: string;
  Description: string;
  Amount: string;
  'Running Bal.': string;
}

export function parseBoaChecking(
  _filename: string,
  rawText: string
): { transactions: ParsedTransaction[]; warnings: string[] } {
  const warnings: string[] = [];

  const headerIdx = rawText.indexOf('Date,Description,Amount,Running Bal.');
  if (headerIdx === -1) {
    warnings.push('BOA checking: header row not found');
    return { transactions: [], warnings };
  }
  const body = rawText.slice(headerIdx);

  const parsed = Papa.parse<BoaCheckingRow>(body, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    warnings.push(`BOA checking parse errors: ${parsed.errors.length}`);
  }

  const transactions: ParsedTransaction[] = [];
  for (const row of parsed.data) {
    const date = row.Date;
    const description = (row.Description || '').trim();
    const amountStr = row.Amount;
    if (!date || !description || amountStr == null || amountStr === '') continue;

    // Skip the summary balance rows that show up as data rows
    if (/Beginning balance|Ending balance/i.test(description)) continue;

    transactions.push({
      date: toIsoDate(date),
      description,
      amount: parseMoney(amountStr),
      source: 'boa-checking',
      accountName: 'BOA Checking',
      accountType: 'checking',
      institution: 'Bank of America',
    });
  }

  return { transactions, warnings };
}
