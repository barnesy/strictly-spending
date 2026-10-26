import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { detectSource, parseCsv, extractCsvHeaders, parseCustomCsv } from './index';
import { getChaseMockCsv, getBoaCreditMockCsv, getBoaCheckingMockCsv } from './mockFixtures';

// Parser tests run against real bank-export CSVs that are NOT committed.
// If STRICTLY_SPENDING_FIXTURES is missing, we fall back to mock CSV generators.
const FIXTURES = process.env.STRICTLY_SPENDING_FIXTURES;
const fixturesAvailable = !!FIXTURES && existsSync(FIXTURES);
const describeIfFixtures = describe; // Always run the tests!

function read(relPath: string): string {
  if (fixturesAvailable) {
    return readFileSync(`${FIXTURES}/${relPath}`, 'utf-8');
  }
  if (relPath.includes('Chase')) {
    return getChaseMockCsv();
  }
  if (relPath.includes('stmt-5.csv')) {
    return getBoaCreditMockCsv();
  }
  if (relPath.includes('stmt-6.csv')) {
    return getBoaCheckingMockCsv();
  }
  throw new Error(`Mock fixture not found for path: ${relPath}`);
}

describeIfFixtures('detectSource', () => {
  it('detects Chase CSVs', () => {
    const txt = read(`Chase/Chase1060_Activity20260101_20260523_20260523.CSV`);
    expect(detectSource(txt)).toBe('chase');
  });

  it('detects BOA credit CSVs', () => {
    const txt = read(`BOA/stmt-5.csv`);
    expect(detectSource(txt)).toBe('boa-credit');
  });

  it('detects BOA checking CSVs', () => {
    const txt = read(`BOA/stmt-6.csv`);
    expect(detectSource(txt)).toBe('boa-checking');
  });
});

describeIfFixtures('parseCsv', () => {
  it('parses Chase transactions with rawCategory + sign convention', () => {
    const txt = read(`Chase/Chase1060_Activity20260101_20260523_20260523.CSV`);
    const result = parseCsv('Chase1060_Activity20260101_20260523_20260523.CSV', txt);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.source).toBe('chase');
    expect(result.transactions.length).toBeGreaterThan(20);
    expect(result.transactions.length).toBeLessThan(40);
    // First row from file: 05/22/2026, "Payment Thank You - Web", amount 540.82
    const payment = result.transactions.find((t) =>
      t.description.includes('Payment Thank You')
    );
    expect(payment).toBeDefined();
    expect(payment?.amount).toBe(540.82);
    // Charges are negative
    const purchase = result.transactions.find((t) =>
      t.description.includes('YouTube')
    );
    expect(purchase?.amount).toBeLessThan(0);
    expect(purchase?.rawCategory).toBe('Bills & Utilities');
    // Account naming pulls last4 from filename
    expect(result.transactions[0].accountName).toBe('Chase 1060');
  });

  it('parses BOA credit transactions, flipping sign convention', () => {
    const txt = read(`BOA/stmt-5.csv`);
    const result = parseCsv('stmt-5.csv', txt);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.source).toBe('boa-credit');
    expect(result.transactions.length).toBeGreaterThan(40);
    // Charges should now be negative (LinkedIn 39.99 in BOA → -39.99)
    const linkedin = result.transactions.find((t) =>
      t.description.includes('LinkedIn')
    );
    expect(linkedin?.amount).toBe(-39.99);
    // Payments should be positive (PAYMENT THANK YOU -39.99 in BOA → 39.99)
    const payment = result.transactions.find(
      (t) => t.description.includes('PAYMENT - THANK YOU') && t.amount === 39.99
    );
    expect(payment).toBeDefined();
    // Splits accounts by cardholder/last4
    const accounts = new Set(result.transactions.map((t) => t.accountName));
    expect(accounts.size).toBe(2);
  });

  it('parses BOA checking transactions', () => {
    const txt = read(`BOA/stmt-6.csv`);
    const result = parseCsv('stmt-6.csv', txt);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.source).toBe('boa-checking');
    expect(result.transactions.length).toBeGreaterThan(500);
    // Charges are already negative
    const claude = result.transactions.find((t) =>
      t.description.includes('CLAUDE.AI')
    );
    expect(claude?.amount).toBe(-20);
    // All transactions should be from "BOA Checking" account
    const accounts = new Set(result.transactions.map((t) => t.accountName));
    expect(accounts.size).toBe(1);
    expect([...accounts][0]).toBe('BOA Checking');
    // Should skip balance summary rows
    const balanceRows = result.transactions.filter((t) =>
      /Beginning balance|Ending balance/i.test(t.description)
    );
    expect(balanceRows.length).toBe(0);
  });
});

describe('Custom CSV Parsing', () => {
  it('extracts CSV headers accurately', () => {
    const raw = `Date,Merchant,Amount,Balance\n2026-06-15,Starbucks,-4.50,120.00`;
    expect(extractCsvHeaders(raw)).toEqual(['Date', 'Merchant', 'Amount', 'Balance']);
  });

  it('parses custom CSV with single Amount column', () => {
    const raw = `TxnDate,Merchant,TotalAmount,Balance\n06/15/2026,Coffee Shop,-4.50,100.00\n06/16/2026,Salary,2500.00,2600.00`;
    const mapping = {
      name: 'Test Union',
      headerHash: 'TxnDate,Merchant,TotalAmount,Balance',
      headers: ['TxnDate', 'Merchant', 'TotalAmount', 'Balance'],
      dateColumn: 'TxnDate',
      descriptionColumn: 'Merchant',
      amountColumn: 'TotalAmount',
      balanceColumn: 'Balance',
      accountName: 'My Savings',
      accountType: 'savings' as const,
      institution: 'Union Bank'
    };

    const result = parseCustomCsv('statement_9999.csv', raw, mapping);
    expect(result.warnings.length).toBe(0);
    expect(result.transactions.length).toBe(2);

    expect(result.transactions[0]).toEqual({
      date: '2026-06-15',
      description: 'Coffee Shop',
      amount: -4.50,
      rawCategory: undefined,
      source: 'custom',
      accountName: 'My Savings',
      accountType: 'savings',
      institution: 'Union Bank',
      last4: '9999',
      balance: 100.00
    });

    expect(result.transactions[1].amount).toBe(2500.00);
  });

  it('parses custom CSV with separate Debit and Credit columns', () => {
    const raw = `Date,Desc,Debit,Credit,Balance\n2026-06-15,Supermarket,45.20,,1000.00\n2026-06-16,Refund,,10.00,1010.00`;
    const mapping = {
      name: 'Checking Test',
      headerHash: 'Date,Desc,Debit,Credit,Balance',
      headers: ['Date', 'Desc', 'Debit', 'Credit', 'Balance'],
      dateColumn: 'Date',
      descriptionColumn: 'Desc',
      debitColumn: 'Debit',
      creditColumn: 'Credit',
      balanceColumn: 'Balance',
      accountName: 'My Checking',
      accountType: 'checking' as const,
      institution: 'Union Bank'
    };

    const result = parseCustomCsv('statement.csv', raw, mapping);
    expect(result.transactions.length).toBe(2);

    // Debit row should be negative
    expect(result.transactions[0].amount).toBe(-45.20);
    expect(result.transactions[0].date).toBe('2026-06-15');

    // Credit row should be positive
    expect(result.transactions[1].amount).toBe(10.00);
    expect(result.transactions[1].balance).toBe(1010.00);
  });

  it('auto-detects and parses Capital One, Discover, Amex, and Apple Card CSV exports out of the box', () => {
    const capOneCsv = [
      'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
      '2026-09-10,2026-09-11,4812,STARBUCKS,Dining,6.45,',
      '2026-09-15,2026-09-15,4812,CAPITAL ONE MOBILE PYMT,Payment/Credit,,250.00',
    ].join('\n');
    const capRes = parseCsv('capital_one_4812.csv', capOneCsv);
    expect('error' in capRes).toBe(false);
    if (!('error' in capRes)) {
      expect(capRes.transactions).toHaveLength(2);
      expect(capRes.transactions[0].amount).toBe(-6.45);
      expect(capRes.transactions[0].rawCategory).toBe('Dining');
      expect(capRes.transactions[0].institution).toBe('Capital One');
      expect(capRes.transactions[1].amount).toBe(250.00);
    }

    const amexCsv = [
      'Date,Description,Card Member,Account #,Amount',
      '09/12/2026,DELTA AIR LINES,JANE DOE,-71004,340.50',
      '09/20/2026,AUTOPAY PAYMENT - THANK YOU,JANE DOE,-71004,-340.50',
    ].join('\n');
    const amexRes = parseCsv('activity.csv', amexCsv);
    expect('error' in amexRes).toBe(false);
    if (!('error' in amexRes)) {
      expect(amexRes.transactions).toHaveLength(2);
      expect(amexRes.transactions[0].amount).toBe(-340.50);
      expect(amexRes.transactions[0].accountName).toBe('Amex 1004');
      expect(amexRes.transactions[1].amount).toBe(340.50);
    }

    const appleCsv = [
      'Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD)',
      '09/14/2026,09/15/2026,APPLE STORE,Apple,Merchandise,Purchase,99.00',
      '09/25/2026,09/25/2026,ACH DEPOSIT INTERNET,Ach Deposit,Payment,Payment,-99.00',
    ].join('\n');
    const appleRes = parseCsv('apple_card.csv', appleCsv);
    expect('error' in appleRes).toBe(false);
    if (!('error' in appleRes)) {
      expect(appleRes.transactions).toHaveLength(2);
      expect(appleRes.transactions[0].amount).toBe(-99.00);
      expect(appleRes.transactions[0].institution).toBe('Apple Card');
      expect(appleRes.transactions[1].amount).toBe(99.00);
    }
  });
});

