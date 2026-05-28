import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { detectSource, parseCsv } from './index';

// Parser tests run against real bank-export CSVs that are NOT committed (they
// contain personal financial data). Point STRICTLY_SPENDING_FIXTURES at a
// local directory laid out like:
//   <fixtures>/Chase/Chase1060_Activity20260101_20260523_20260523.CSV
//   <fixtures>/BOA/stmt-5.csv
//   <fixtures>/BOA/stmt-6.csv
// If the env var is unset (or the directory is missing), these tests are
// skipped — CI and other contributors get a green run without needing the
// private data.
const FIXTURES = process.env.STRICTLY_SPENDING_FIXTURES;
const fixturesAvailable = !!FIXTURES && existsSync(FIXTURES);
const describeIfFixtures = fixturesAvailable ? describe : describe.skip;

function read(relPath: string): string {
  return readFileSync(`${FIXTURES}/${relPath}`, 'utf-8');
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
