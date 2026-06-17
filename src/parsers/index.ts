import Papa from 'papaparse';
import type { ParsedTransaction, Source, CsvMapping } from '../types';
import { parseChase } from './chase';
import { parseBoaCredit } from './boa-credit';
import { parseBoaChecking } from './boa-checking';
import { parseTruistChecking } from './truist-checking';

export interface ParseResult {
  source: Source;
  transactions: ParsedTransaction[];
  warnings: string[];
}

export function detectSource(rawText: string): Source | null {
  const head = rawText.slice(0, 2000);
  if (head.includes('Transaction Date,Post Date,Description,Category,Type,Amount')) {
    return 'chase';
  }
  if (head.includes('CardHolder Name') && head.includes('Expense Category')) {
    return 'boa-credit';
  }
  if (
    head.includes('Beginning balance as of') &&
    head.includes('Date,Description,Amount,Running Bal.')
  ) {
    return 'boa-checking';
  }
  if (
    head.includes('Posted Date,Transaction Date,Transaction Type') &&
    head.includes('Full description,Merchant name,Category name,Sub-category name')
  ) {
    return 'truist-checking';
  }
  return null;
}

export function parseCsv(
  filename: string,
  rawText: string
): ParseResult | { error: string } {
  const source = detectSource(rawText);
  if (!source) {
    return { error: `Could not detect CSV format for ${filename}` };
  }
  switch (source) {
    case 'chase':
      return { source, ...parseChase(filename, rawText) };
    case 'boa-credit':
      return { source, ...parseBoaCredit(filename, rawText) };
    case 'boa-checking':
      return { source, ...parseBoaChecking(filename, rawText) };
    case 'truist-checking':
      return { source, ...parseTruistChecking(filename, rawText) };
  }
}

export function papaParse<T = string[]>(text: string): T[] {
  const result = Papa.parse<T>(text, {
    skipEmptyLines: true,
  });
  return result.data;
}

export function toIsoDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  // MM/DD/YYYY or M/D/YYYY
  const m1 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const [, mo, d, y] = m1;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  const m2 = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return trimmed;
  // YYYY/MM/DD
  const m3 = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m3) {
    const [, y, mo, d] = m3;
    return `${y}-${mo}-${d}`;
  }
  return trimmed;
}

export function parseMoney(s: string): number {
  if (s == null) return 0;
  const cleaned = String(s).replace(/[",$]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function extractCsvHeaders(rawText: string): string[] {
  const parsed = Papa.parse<string[]>(rawText, { preview: 1, skipEmptyLines: true });
  if (parsed.data && parsed.data.length > 0) {
    return parsed.data[0].map(h => (h || '').trim());
  }
  return [];
}

export function parseCustomCsv(
  filename: string,
  rawText: string,
  mapping: CsvMapping
): { transactions: ParsedTransaction[]; warnings: string[] } {
  const warnings: string[] = [];

  const parsed = Papa.parse<any>(rawText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    warnings.push(`Custom CSV parse errors: ${parsed.errors.length}`);
  }

  const transactions: ParsedTransaction[] = [];
  for (const row of parsed.data) {
    const dateStr = row[mapping.dateColumn];
    const description = (row[mapping.descriptionColumn] || '').trim();

    let amount = 0;
    if (mapping.amountColumn) {
      amount = parseMoney(row[mapping.amountColumn]);
    } else {
      const debit = mapping.debitColumn ? parseMoney(row[mapping.debitColumn]) : 0;
      const credit = mapping.creditColumn ? parseMoney(row[mapping.creditColumn]) : 0;
      if (debit !== 0) {
        amount = -Math.abs(debit);
      } else if (credit !== 0) {
        amount = Math.abs(credit);
      }
    }

    if (!dateStr || !description) continue;

    let balance: number | undefined = undefined;
    if (mapping.balanceColumn && row[mapping.balanceColumn] != null) {
      balance = parseMoney(row[mapping.balanceColumn]);
    }

    let last4 = undefined;
    const last4Match = filename.match(/(\d{4})/);
    if (last4Match) {
      last4 = last4Match[1];
    }

    transactions.push({
      date: toIsoDate(dateStr.trim()),
      description,
      amount,
      rawCategory: undefined,
      source: 'custom',
      accountName: mapping.accountName,
      accountType: mapping.accountType,
      institution: mapping.institution,
      last4,
      balance,
    });
  }

  return { transactions, warnings };
}
