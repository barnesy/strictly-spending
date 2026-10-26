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
  if (
    head.includes('Transaction Date,Post Date,Description,Category,Type,Amount') ||
    head.includes('Details,Posting Date,Description,Amount,Type,Balance')
  ) {
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
  if (
    head.includes('Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit') ||
    head.includes('Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance') ||
    head.includes('Trans. Date,Post Date,Description,Amount,Category') ||
    head.includes('Date,Description,Card Member,Account #,Amount') ||
    head.includes('Date,Description,Amount,Extended Details,Appears On Your Statement As') ||
    head.includes('Status,Date,Description,Debit,Credit') ||
    head.includes('Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD)')
  ) {
    return 'custom';
  }
  return null;
}

function parseBuiltInPresetCsv(
  filename: string,
  rawText: string
): { transactions: ParsedTransaction[]; warnings: string[] } | null {
  const head = rawText.slice(0, 2000);
  const last4Match = filename.match(/(\d{4})/);
  const fileLast4 = last4Match ? last4Match[1] : undefined;

  const parsed = Papa.parse<Record<string, string>>(rawText, {
    header: true,
    skipEmptyLines: true,
  });
  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];

  // 1. Capital One Credit: Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
  if (head.includes('Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit')) {
    for (const row of parsed.data) {
      const dateStr = row['Transaction Date'] || row['Posted Date'];
      const description = (row['Description'] || '').trim();
      if (!dateStr || !description) continue;
      const debit = parseMoney(row['Debit']);
      const credit = parseMoney(row['Credit']);
      const amount = debit !== 0 ? -Math.abs(debit) : credit !== 0 ? Math.abs(credit) : 0;
      const cardNo = (row['Card No.'] || '').trim() || fileLast4;
      const accountName = cardNo ? `Capital One ${cardNo}` : 'Capital One Credit';
      transactions.push({
        date: toIsoDate(dateStr),
        description,
        amount,
        rawCategory: (row['Category'] || '').trim() || undefined,
        source: 'custom',
        accountName,
        accountType: 'credit',
        institution: 'Capital One',
        last4: cardNo,
      });
    }
    return { transactions, warnings };
  }

  // 2. Capital One Checking/Savings: Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance
  if (head.includes('Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance')) {
    for (const row of parsed.data) {
      const dateStr = row['Transaction Date'];
      const description = (row['Transaction Description'] || '').trim();
      if (!dateStr || !description) continue;
      const rawAmt = parseMoney(row['Transaction Amount']);
      const txnType = (row['Transaction Type'] || '').toLowerCase();
      const amount = txnType === 'debit' ? -Math.abs(rawAmt) : txnType === 'credit' ? Math.abs(rawAmt) : rawAmt;
      const acctNum = (row['Account Number'] || '').trim().slice(-4) || fileLast4;
      const accountName = acctNum ? `Capital One Checking ${acctNum}` : 'Capital One Checking';
      transactions.push({
        date: toIsoDate(dateStr),
        description,
        amount,
        rawCategory: undefined,
        source: 'custom',
        accountName,
        accountType: 'checking',
        institution: 'Capital One',
        last4: acctNum,
        balance: row['Balance'] != null ? parseMoney(row['Balance']) : undefined,
      });
    }
    return { transactions, warnings };
  }

  // 3. Discover: Trans. Date,Post Date,Description,Amount,Category (charges positive, payments negative in Discover CSV)
  if (head.includes('Trans. Date,Post Date,Description,Amount,Category')) {
    for (const row of parsed.data) {
      const dateStr = row['Trans. Date'] || row['Post Date'];
      const description = (row['Description'] || '').trim();
      if (!dateStr || !description) continue;
      const rawAmt = parseMoney(row['Amount']);
      const amount = -rawAmt;
      const accountName = fileLast4 ? `Discover ${fileLast4}` : 'Discover Card';
      transactions.push({
        date: toIsoDate(dateStr),
        description,
        amount,
        rawCategory: (row['Category'] || '').trim() || undefined,
        source: 'custom',
        accountName,
        accountType: 'credit',
        institution: 'Discover',
        last4: fileLast4,
      });
    }
    return { transactions, warnings };
  }

  // 4. American Express: Date,Description,Card Member,Account #,Amount OR Date,Description,Amount,Extended Details... (charges positive, payments negative)
  if (
    head.includes('Date,Description,Card Member,Account #,Amount') ||
    head.includes('Date,Description,Amount,Extended Details,Appears On Your Statement As')
  ) {
    for (const row of parsed.data) {
      const dateStr = row['Date'];
      const description = (row['Description'] || '').trim();
      if (!dateStr || !description) continue;
      const rawAmt = parseMoney(row['Amount']);
      const amount = -rawAmt;
      const acctRaw = (row['Account #'] || '').replace(/\D+/g, '').slice(-4) || fileLast4;
      const accountName = acctRaw ? `Amex ${acctRaw}` : 'American Express';
      transactions.push({
        date: toIsoDate(dateStr),
        description,
        amount,
        rawCategory: (row['Category'] || '').trim() || undefined,
        source: 'custom',
        accountName,
        accountType: 'credit',
        institution: 'American Express',
        last4: acctRaw,
      });
    }
    return { transactions, warnings };
  }

  // 5. Citi: Status,Date,Description,Debit,Credit
  if (head.includes('Status,Date,Description,Debit,Credit')) {
    for (const row of parsed.data) {
      const dateStr = row['Date'];
      const description = (row['Description'] || '').trim();
      if (!dateStr || !description) continue;
      const debit = parseMoney(row['Debit']);
      const credit = parseMoney(row['Credit']);
      const amount = debit !== 0 ? -Math.abs(debit) : credit !== 0 ? Math.abs(credit) : 0;
      const accountName = fileLast4 ? `Citi ${fileLast4}` : 'Citi Card';
      transactions.push({
        date: toIsoDate(dateStr),
        description,
        amount,
        rawCategory: undefined,
        source: 'custom',
        accountName,
        accountType: 'credit',
        institution: 'Citi',
        last4: fileLast4,
      });
    }
    return { transactions, warnings };
  }

  // 6. Apple Card: Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD)
  if (head.includes('Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD)')) {
    for (const row of parsed.data) {
      const dateStr = row['Transaction Date'] || row['Clearing Date'];
      const description = (row['Merchant'] || row['Description'] || '').trim();
      if (!dateStr || !description) continue;
      const rawAmt = parseMoney(row['Amount (USD)']);
      const txnType = (row['Type'] || '').toLowerCase();
      const amount = txnType === 'payment' || txnType === 'credit' ? Math.abs(rawAmt) : -Math.abs(rawAmt);
      transactions.push({
        date: toIsoDate(dateStr),
        description,
        amount,
        rawCategory: (row['Category'] || '').trim() || undefined,
        source: 'custom',
        accountName: 'Apple Card',
        accountType: 'credit',
        institution: 'Apple Card',
        last4: fileLast4,
      });
    }
    return { transactions, warnings };
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
    case 'chase': {
      const head = rawText.slice(0, 2000);
      if (head.includes('Details,Posting Date,Description,Amount,Type,Balance')) {
        const parsed = Papa.parse<Record<string, string>>(rawText, {
          header: true,
          skipEmptyLines: true,
        });
        const last4Match = filename.match(/(\d{4})/);
        const last4 = last4Match ? last4Match[1] : undefined;
        const accountName = last4 ? `Chase Checking ${last4}` : 'Chase Checking';
        const transactions: ParsedTransaction[] = [];
        for (const row of parsed.data) {
          const dateStr = row['Posting Date'];
          const description = (row['Description'] || '').trim();
          if (!dateStr || !description) continue;
          transactions.push({
            date: toIsoDate(dateStr),
            description,
            amount: parseMoney(row['Amount']),
            rawCategory: undefined,
            source: 'chase',
            accountName,
            accountType: 'checking',
            institution: 'Chase',
            last4,
            balance: row['Balance'] != null ? parseMoney(row['Balance']) : undefined,
          });
        }
        return { source: 'chase', transactions, warnings: [] };
      }
      return { source, ...parseChase(filename, rawText) };
    }
    case 'boa-credit':
      return { source, ...parseBoaCredit(filename, rawText) };
    case 'boa-checking':
      return { source, ...parseBoaChecking(filename, rawText) };
    case 'truist-checking':
      return { source, ...parseTruistChecking(filename, rawText) };
    case 'custom': {
      const preset = parseBuiltInPresetCsv(filename, rawText);
      if (preset) {
        return { source: 'custom', ...preset };
      }
      return { error: `Could not detect CSV format for ${filename}` };
    }
    default:
      return { error: `Could not detect CSV format for ${filename}` };
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

  const parsed = Papa.parse<Record<string, string>>(rawText, {
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

    let accountName = mapping.accountName;
    let accountType = mapping.accountType;
    let institution = mapping.institution;
    let fileAccountName: string | undefined = undefined;

    if (mapping.accountColumn && row[mapping.accountColumn]) {
      const rawFileAccount = row[mapping.accountColumn].trim();
      if (rawFileAccount) {
        fileAccountName = rawFileAccount;
        accountName = rawFileAccount;
        if (mapping.accountMappings && mapping.accountMappings[rawFileAccount]) {
          const target = mapping.accountMappings[rawFileAccount];
          accountName = target.accountName;
          accountType = target.accountType;
          institution = target.institution;
        }
      }
    }

    transactions.push({
      date: toIsoDate(dateStr.trim()),
      description,
      amount,
      rawCategory: undefined,
      source: 'custom',
      accountName,
      accountType,
      institution,
      last4,
      balance,
      fileAccountName,
    });
  }

  return { transactions, warnings };
}
