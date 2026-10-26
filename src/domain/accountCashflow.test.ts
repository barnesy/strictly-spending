import { describe, it, expect } from 'vitest';
import {
  getOperatingCashAccounts,
  getCheckingSourceKey,
  getLegacyCheckingSourceKey,
  getAccountSavingsTransferOut,
  buildUpdatedDestinationsForAccountTransfer,
} from './accountCashflow';
import type { Account } from '../types';
import type { DestinationAccount, IncomeStream } from '../api/scenarios';

describe('accountCashflow per-account savings transfers', () => {
  const boa6669: Account = {
    id: 19,
    name: 'Bank of America Adv Plus Banking- 6669 (6669)',
    type: 'checking',
    institution: 'Bank of America',
    last4: '6669',
    source: 'simplefin',
    enabled: true,
    currentBalance: 4500,
  };

  const truist1770: Account = {
    id: 23,
    name: 'Truist Checking 1770 (1770)',
    type: 'checking',
    institution: 'Truist',
    last4: '1770',
    source: 'simplefin',
    enabled: true,
    currentBalance: 1200,
  };

  const truist5463: Account = {
    id: 33,
    name: 'Truist Checking 5463 (5463)',
    type: 'checking',
    institution: 'Truist',
    last4: '5463',
    source: 'simplefin',
    enabled: true,
    currentBalance: 3800,
  };

  const truist4322: Account = {
    id: 34,
    name: 'Truist Personal Money Rate SAV 4322 (4322)',
    type: 'checking',
    institution: 'Truist',
    last4: '4322',
    source: 'simplefin',
    enabled: true,
    currentBalance: 500,
  };

  const baseDestinations: DestinationAccount[] = [
    {
      id: 'account-truist-shared-savings',
      name: 'Truist Shared Savings',
      accountType: 'savings',
      currentBalance: 30000,
      monthlyAllocation: 5000,
      sourceAllocations: { truist: 2000, boa: 3000 },
      annualGrowthRate: 4.0,
      enabled: true,
    },
  ];

  it('assigns distinct source keys to each individual Truist and BoA account', () => {
    expect(getCheckingSourceKey(boa6669)).toBe('19');
    expect(getCheckingSourceKey(truist1770)).toBe('23');
    expect(getCheckingSourceKey(truist5463)).toBe('33');
    expect(getCheckingSourceKey(truist4322)).toBe('34');
  });

  it('only maps 5463 and 6669 to legacy truist/boa keys so 1770 and 4322 do not inherit them', () => {
    expect(getLegacyCheckingSourceKey(boa6669)).toBe('boa');
    expect(getLegacyCheckingSourceKey(truist5463)).toBe('truist');
    expect(getLegacyCheckingSourceKey(truist1770)).toBeNull();
    expect(getLegacyCheckingSourceKey(truist4322)).toBeNull();

    expect(getAccountSavingsTransferOut(baseDestinations, truist5463).totalTransferOut).toBe(2000);
    expect(getAccountSavingsTransferOut(baseDestinations, boa6669).totalTransferOut).toBe(3000);
    expect(getAccountSavingsTransferOut(baseDestinations, truist1770).totalTransferOut).toBe(0);
    expect(getAccountSavingsTransferOut(baseDestinations, truist4322).totalTransferOut).toBe(0);
  });

  it('updates Savings Moved Out for a single Truist account without affecting other Truist accounts', () => {
    // Set Truist 1770 to $450/mo
    const after1770 = buildUpdatedDestinationsForAccountTransfer(baseDestinations, truist1770, 450);

    expect(getAccountSavingsTransferOut(after1770, truist1770).totalTransferOut).toBe(450);
    expect(getAccountSavingsTransferOut(after1770, truist5463).totalTransferOut).toBe(2000);
    expect(getAccountSavingsTransferOut(after1770, truist4322).totalTransferOut).toBe(0);
    expect(getAccountSavingsTransferOut(after1770, boa6669).totalTransferOut).toBe(3000);
    expect(after1770[0].monthlyAllocation).toBe(5450);

    // Now update Truist 5463 from $2,000 to $1,500/mo — should migrate legacy 'truist' key cleanly
    const after5463 = buildUpdatedDestinationsForAccountTransfer(after1770, truist5463, 1500);

    expect(getAccountSavingsTransferOut(after5463, truist1770).totalTransferOut).toBe(450);
    expect(getAccountSavingsTransferOut(after5463, truist5463).totalTransferOut).toBe(1500);
    expect(getAccountSavingsTransferOut(after5463, truist4322).totalTransferOut).toBe(0);
    expect(getAccountSavingsTransferOut(after5463, boa6669).totalTransferOut).toBe(3000);
    expect(after5463[0].sourceAllocations?.truist).toBeUndefined();
    expect(after5463[0].monthlyAllocation).toBe(4950);
  });

  describe('getOperatingCashAccounts across arbitrary bank setups', () => {
    const chaseChecking: Account = {
      id: 101,
      name: 'Chase Total Checking (8821)',
      type: 'checking',
      institution: 'Chase',
      last4: '8821',
      source: 'simplefin',
      enabled: true,
      currentBalance: 6400,
    };

    const fidelityCashMgmt: Account = {
      id: 102,
      name: 'Fidelity Cash Management (4410)',
      type: 'savings',
      institution: 'Fidelity',
      last4: '4410',
      source: 'simplefin',
      enabled: true,
      currentBalance: 12000,
    };

    const sofiSavingsWithPaycheck: Account = {
      id: 103,
      name: 'SoFi High-Yield Savings (9912)',
      type: 'savings',
      institution: 'SoFi',
      last4: '9912',
      source: 'simplefin',
      enabled: true,
      currentBalance: 25000,
    };

    const allyPureSavings: Account = {
      id: 104,
      name: 'Ally Online Savings (3100)',
      type: 'savings',
      institution: 'Ally',
      last4: '3100',
      source: 'simplefin',
      enabled: true,
      currentBalance: 40000,
    };

    const amexCredit: Account = {
      id: 105,
      name: 'Amex Gold Card',
      type: 'credit',
      institution: 'American Express',
      last4: '1004',
      source: 'simplefin',
      enabled: true,
      currentBalance: -1400,
    };

    it('includes checking accounts, cash management accounts, and savings accounts receiving income streams', () => {
      const streams: IncomeStream[] = [
        {
          id: 'stream-sofi',
          name: 'Stripe Payroll',
          accountId: 103,
          accountName: 'SoFi High-Yield Savings (9912)',
          monthlyAmount: 9500,
          paycheckAmount: 4750,
          frequency: 'semimonthly',
          isTaxed: false,
          enabled: true,
        },
      ];

      const operating = getOperatingCashAccounts(
        [chaseChecking, fidelityCashMgmt, sofiSavingsWithPaycheck, allyPureSavings, amexCredit],
        streams,
      );

      expect(operating.map((a) => a.id)).toEqual([101, 102, 103]);
    });

    it('falls back to enabled savings accounts when a user connects no checking accounts', () => {
      const operating = getOperatingCashAccounts([allyPureSavings, amexCredit], []);
      expect(operating.map((a) => a.id)).toEqual([104]);
    });
  });
});

