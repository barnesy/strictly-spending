import { describe, it, expect } from 'vitest';
import {
  calculateMonthlyFromPaycheck,
  calculatePaycheckFromMonthly,
  detectIncomeStreams,
  applyPaymentSelection,
  applyPaycheckOverride,
  applyMonthlyOverride,
  applyFrequencyChange,
  extractStreamName,
} from './incomeStreams';
import type { Transaction, Account, Category } from '../types';

describe('incomeStreams domain', () => {
  describe('frequency and paycheck calculations', () => {
    it('calculates biweekly monthly amount accurately (26 paychecks/yr)', () => {
      // 3709.50 * 26 / 12 = 8037.25 -> 8037
      expect(calculateMonthlyFromPaycheck(3709.5, 'biweekly')).toBe(8037);
      // Accelerant latest payment
      expect(calculateMonthlyFromPaycheck(11692.08, 'biweekly')).toBe(25333);
      // Accelerant prior payment
      expect(calculateMonthlyFromPaycheck(5781.22, 'biweekly')).toBe(12526);
    });

    it('calculates semimonthly monthly amount (2x/month)', () => {
      expect(calculateMonthlyFromPaycheck(5781.22, 'semimonthly')).toBe(11562);
    });

    it('calculates weekly monthly amount (52 paychecks/yr)', () => {
      expect(calculateMonthlyFromPaycheck(1000, 'weekly')).toBe(4333);
    });

    it('calculates monthly amount for standard monthly frequency', () => {
      expect(calculateMonthlyFromPaycheck(6500, 'monthly')).toBe(6500);
    });

    it('calculates paycheck from monthly amount', () => {
      // 8037 * 12 / 26 = 3709.38 -> 3709
      expect(calculatePaycheckFromMonthly(8037, 'biweekly')).toBe(3709);
      expect(calculatePaycheckFromMonthly(10000, 'semimonthly')).toBe(5000);
      expect(calculatePaycheckFromMonthly(4333, 'weekly')).toBe(1000);
      expect(calculatePaycheckFromMonthly(6000, 'monthly')).toBe(6000);
    });
  });

  describe('extractStreamName', () => {
    it('extracts known employers properly', () => {
      expect(extractStreamName('ACCELERANT US SE DES:PAYROLL ID:123')).toBe('Accelerant US Payroll');
      expect(extractStreamName('Vertex Inc', 'vertex_inc')).toBe('Vertex Inc Payroll');
      expect(extractStreamName('OpenGov Inc Payroll')).toBe('OpenGov Inc Payroll');
      expect(extractStreamName('Fidelity Dividend')).toBe('Investment Dividends');
    });

    it('extracts ACH payroll patterns and universal payroll processors cleanly', () => {
      expect(extractStreamName('ACME CORP SE DES:PAYROLL ID:999')).toBe('Acme Corp Payroll');
      expect(extractStreamName('GUSTO PAY 123456 STRIPE INC')).toBe('Stripe Inc Payroll');
      expect(extractStreamName('ADP WAGE PAY')).toBe('ADP Payroll');
      expect(extractStreamName('STRIPE INC DIRECT DEP ID:4421')).toBe('Stripe Inc Payroll');
    });
  });

  describe('detectIncomeStreams and latest recurring payment', () => {
    const mockAccounts = [
      { id: 1, name: 'BofA Checking', type: 'checking', currentBalance: 5000 },
      { id: 2, name: 'Truist Checking', type: 'checking', currentBalance: 3000 },
    ] as unknown as Account[];

    const mockCategories = [
      { id: 10, name: 'Income', type: 'income' },
      { id: 11, name: 'Transfers', type: 'transfer' },
    ] as unknown as Category[];

    const sampleTxns = [
      // Vertex Inc transactions on Account 2 (biweekly, ~14 days apart)
      { id: 101, accountId: 2, date: '2026-10-02', amount: 3709.49, description: 'Vertex Inc', category: 'Income' },
      { id: 102, accountId: 2, date: '2026-10-02', amount: 73.54, description: 'Vertex Inc', category: 'Income' }, // small ancillary
      { id: 103, accountId: 2, date: '2026-09-18', amount: 3709.50, description: 'Vertex Inc', category: 'Income' },
      { id: 104, accountId: 2, date: '2026-09-04', amount: 3709.50, description: 'Vertex Inc', category: 'Income' },
      { id: 105, accountId: 2, date: '2026-08-21', amount: 3709.50, description: 'Vertex Inc', category: 'Income' },
      { id: 106, accountId: 2, date: '2026-08-07', amount: 3709.50, description: 'Vertex Inc', category: 'Income' },

      // Accelerant US Payroll on Account 1 (latest payment is larger)
      { id: 201, accountId: 1, date: '2026-09-30', amount: 11692.08, description: 'ACCELERANT US SE DES:PAYROLL', category: 'Income' },
      { id: 202, accountId: 1, date: '2026-09-15', amount: 5781.22, description: 'ACCELERANT US SE DES:PAYROLL', category: 'Income' },
      { id: 203, accountId: 1, date: '2026-08-31', amount: 3429.70, description: 'ACCELERANT US SE DES:PAYROLL', category: 'Income' },
    ] as unknown as Transaction[];

    it('detects streams and bases income on the latest recurring paycheck payment', () => {
      const streams = detectIncomeStreams(sampleTxns, mockAccounts, mockCategories);
      expect(streams).toHaveLength(2);

      const vertex = streams.find((s) => s.name.includes('Vertex'))!;
      expect(vertex).toBeDefined();
      expect(vertex.frequency).toBe('biweekly');
      // Should pick latest payment ($3709.49)
      expect(vertex.paycheckAmount).toBe(3709.49);
      expect(vertex.monthlyAmount).toBe(8037);
      expect(vertex.recentPayments).toHaveLength(5); // filtered out 73.54 ancillary
      expect(vertex.selectedPaymentId).toBe('101');

      const accelerant = streams.find((s) => s.name.includes('Accelerant'))!;
      expect(accelerant).toBeDefined();
      // Paid on Aug 31, Sep 15, Sep 30 -> 15th & end-of-month -> semimonthly (2x/mo)
      expect(accelerant.frequency).toBe('semimonthly');
      // Defaults to the latest payment ($11692.08 * 2 = $23,384)
      expect(accelerant.paycheckAmount).toBe(11692.08);
      expect(accelerant.monthlyAmount).toBe(23384);
      expect(accelerant.selectedPaymentId).toBe('201');
      expect(accelerant.recentPayments).toHaveLength(3);
      expect(accelerant.recentPayments![0].amount).toBe(11692.08);
      expect(accelerant.recentPayments![1].amount).toBe(5781.22);
      expect(accelerant.recentPayments![2].amount).toBe(3429.70);
    });

    it('allows selecting a prior payment to handle cases where the latest was unusually large', () => {
      const streams = detectIncomeStreams(sampleTxns, mockAccounts, mockCategories);
      const accelerant = streams.find((s) => s.name.includes('Accelerant'))!;

      // User selects the prior paycheck (Sep 15, $5781.22, id '202')
      const updated = applyPaymentSelection(accelerant, '202');
      expect(updated.paycheckAmount).toBe(5781.22);
      expect(updated.selectedPaymentId).toBe('202');
      // Semi-monthly: 5781.22 * 2 = 11562
      expect(updated.monthlyAmount).toBe(11562);
      expect(updated.isOverridden).toBe(true);
    });

    it('allows manually overriding the paycheck amount for custom forecasts', () => {
      const streams = detectIncomeStreams(sampleTxns, mockAccounts, mockCategories);
      const vertex = streams.find((s) => s.name.includes('Vertex'))!;

      // User enters custom override of $6,000 per bi-weekly paycheck
      const overridden = applyPaycheckOverride(vertex, 6000);
      expect(overridden.paycheckAmount).toBe(6000);
      expect(overridden.selectedPaymentId).toBe('custom');
      // 6000 * 26 / 12 = 13000
      expect(overridden.monthlyAmount).toBe(13000);
      expect(overridden.isOverridden).toBe(true);
    });

    it('allows manually overriding monthly amount and syncs paycheck amount', () => {
      const streams = detectIncomeStreams(sampleTxns, mockAccounts, mockCategories);
      const vertex = streams.find((s) => s.name.includes('Vertex'))!;

      const overridden = applyMonthlyOverride(vertex, 9000);
      expect(overridden.monthlyAmount).toBe(9000);
      // 9000 * 12 / 26 = 4153.8 -> 4154
      expect(overridden.paycheckAmount).toBe(4154);
      expect(overridden.selectedPaymentId).toBe('custom');
    });

    it('recalculates monthly amount when frequency changes', () => {
      const streams = detectIncomeStreams(sampleTxns, mockAccounts, mockCategories);
      const accelerant = streams.find((s) => s.name.includes('Accelerant'))!;
      const selected = applyPaymentSelection(accelerant, '202'); // $5781.22

      // Change frequency to bi-weekly (26x/yr) and back to semi-monthly (2x/mo)
      const biweekly = applyFrequencyChange(selected, 'biweekly');
      expect(biweekly.frequency).toBe('biweekly');
      expect(biweekly.monthlyAmount).toBe(12526);

      const semimonthly = applyFrequencyChange(biweekly, 'semimonthly');
      expect(semimonthly.frequency).toBe('semimonthly');
      // 5781.22 * 2 = 11562
      expect(semimonthly.monthlyAmount).toBe(11562);
    });

    it('automatically flags stale streams (> 60 days since latest payment) as former employers and defaults enabled to false', () => {
      const txnsWithOldEmployer = [
        ...sampleTxns,
        // OpenGov terminated in June 2026 (>60 days before October reference date)
        { id: 301, accountId: 1, date: '2026-06-15', amount: 9535.31, description: 'OpenGov Inc Payroll', category: 'Income' },
        { id: 302, accountId: 1, date: '2026-05-31', amount: 9535.31, description: 'OpenGov Inc Payroll', category: 'Income' },
      ] as unknown as Transaction[];

      const streams = detectIncomeStreams(txnsWithOldEmployer, mockAccounts, mockCategories, '2026-10-11');
      expect(streams).toHaveLength(3);

      const opengov = streams.find((s) => s.name.includes('OpenGov'))!;
      expect(opengov).toBeDefined();
      expect(opengov.isFormerEmployer).toBe(true);
      expect(opengov.enabled).toBe(false);
      expect(opengov.lastPaymentDate).toBe('2026-06-15');

      const vertex = streams.find((s) => s.name.includes('Vertex'))!;
      expect(vertex.isFormerEmployer).toBe(false);
      expect(vertex.enabled).toBe(true);

      const accelerant = streams.find((s) => s.name.includes('Accelerant'))!;
      expect(accelerant.isFormerEmployer).toBe(false);
      expect(accelerant.enabled).toBe(true);
    });

    it('excludes Investment Sell and investment/retirement accounts from paycheck detection', () => {
      const accountsWithRoth = [
        ...mockAccounts,
        { id: 9, name: 'Fidelity Investments ROTH IRA (9778)', type: 'investment', currentBalance: 24026.15 },
      ] as unknown as Account[];

      const txnsWithRothSells = [
        ...sampleTxns,
        { id: 401, accountId: 9, date: '2026-09-25', amount: 3000, description: 'Investment Sell', category: 'Income' },
        { id: 402, accountId: 9, date: '2026-09-10', amount: 1500, description: 'Investment Sell', category: 'Income' },
      ] as unknown as Transaction[];

      const streams = detectIncomeStreams(txnsWithRothSells, accountsWithRoth, mockCategories);
      expect(streams).toHaveLength(2);
      expect(streams.some((s) => /investment sell|roth/i.test(s.name))).toBe(false);
    });

    it('detects universal payroll streams across arbitrary banks (e.g. Chase Checking + SoFi Savings)', () => {
      const arbitraryAccounts = [
        { id: 50, name: 'Chase Total Checking', type: 'checking', currentBalance: 8200 },
        { id: 51, name: 'SoFi High-Yield Savings', type: 'savings', currentBalance: 19500 },
      ] as unknown as Account[];

      const arbitraryTxns = [
        // Uncategorized Gusto direct deposit into Chase Checking (detected via payroll pattern even without Income category)
        { id: 501, accountId: 50, date: '2026-10-15', amount: 4200, description: 'GUSTO PAY 99812 LINEAR INC', category: 'Uncategorized' },
        { id: 502, accountId: 50, date: '2026-09-30', amount: 4200, description: 'GUSTO PAY 99812 LINEAR INC', category: 'Uncategorized' },
        // Direct deposit into SoFi Savings
        { id: 601, accountId: 51, date: '2026-10-09', amount: 2850, description: 'ADP WAGE PAY DIRECT DEP', category: 'Uncategorized' },
        { id: 602, accountId: 51, date: '2026-09-25', amount: 2850, description: 'ADP WAGE PAY DIRECT DEP', category: 'Uncategorized' },
      ] as unknown as Transaction[];

      const streams = detectIncomeStreams(arbitraryTxns, arbitraryAccounts, mockCategories, '2026-10-20');
      expect(streams).toHaveLength(2);

      const linearStream = streams.find((s) => s.accountId === 50)!;
      expect(linearStream).toBeDefined();
      expect(linearStream.name).toBe('Linear Inc Payroll');
      expect(linearStream.frequency).toBe('semimonthly');
      expect(linearStream.monthlyAmount).toBe(8400);

      const adpStream = streams.find((s) => s.accountId === 51)!;
      expect(adpStream).toBeDefined();
      expect(adpStream.name).toBe('ADP Payroll');
      expect(adpStream.frequency).toBe('biweekly');
      expect(adpStream.paycheckAmount).toBe(2850);
    });
  });
});


