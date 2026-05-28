import Papa from 'papaparse';
import type { ParsedTransaction } from '../types';
import { toIsoDate, parseMoney } from './index';

interface BoaCreditRow {
  'CardHolder Name': string;
  'Account/Card Number - last 4 digits': string;
  'Posting Date': string;
  'Trans. Date': string;
  'Reference ID': string;
  Description: string;
  Amount: string;
  MCC: string;
  'Merchant Category': string;
  'Transaction Type': string;
  'Expense Category': string;
}

export function parseBoaCredit(
  _filename: string,
  rawText: string
): { transactions: ParsedTransaction[]; warnings: string[] } {
  const warnings: string[] = [];

  const headerIdx = rawText.indexOf('CardHolder Name,');
  if (headerIdx === -1) {
    warnings.push('BOA credit: header row not found');
    return { transactions: [], warnings };
  }
  const body = rawText.slice(headerIdx);

  const parsed = Papa.parse<BoaCreditRow>(body, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    warnings.push(`BOA credit parse errors: ${parsed.errors.length}`);
  }

  const transactions: ParsedTransaction[] = [];
  for (const row of parsed.data) {
    const cardholder = (row['CardHolder Name'] || '').trim();
    const last4 = (row['Account/Card Number - last 4 digits'] || '').trim();
    const date = row['Trans. Date'] || row['Posting Date'];
    const description = (row.Description || '').trim();
    const amountStr = row.Amount;
    if (!cardholder || !date || !description || amountStr == null) continue;

    // BOA convention: debits (charges) positive, credits (payments) negative.
    // App convention: spend negative, money-in positive. Negate.
    const amount = -parseMoney(amountStr);

    const accountName = last4
      ? `BOA Card ${last4} (${cardholder})`
      : `BOA Card (${cardholder})`;

    transactions.push({
      date: toIsoDate(date),
      description,
      amount,
      rawCategory: (row['Expense Category'] || '').trim() || undefined,
      source: 'boa-credit',
      accountName,
      accountType: 'credit',
      institution: 'Bank of America',
      last4: last4 || undefined,
    });
  }

  return { transactions, warnings };
}
