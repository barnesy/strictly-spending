import Papa from 'papaparse';
import type { ParsedTransaction, Source } from '../types';
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

export function toIsoDate(mmddyyyy: string): string {
  const m = mmddyyyy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return mmddyyyy;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function parseMoney(s: string): number {
  if (s == null) return 0;
  const cleaned = String(s).replace(/[",$]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
