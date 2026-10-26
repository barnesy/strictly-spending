import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCleanupReport } from '../autoCleanup';
import { api } from '../../api';
import type { Transaction, Account } from '../../types';

vi.mock('../../api', () => ({
  api: {
    getTransactions: vi.fn(),
    getRules: vi.fn(),
    getCategories: vi.fn(),
    getAccounts: vi.fn(),
  },
}));

describe('autoCleanup — Transfer Pair & Duplicate Detection', () => {
  const accounts: Account[] = [
    { id: 1, name: 'BoA Checking', source: 'boa-checking', type: 'checking', institution: 'BoA', enabled: true },
    { id: 2, name: 'Truist Checking', source: 'truist-checking', type: 'checking', institution: 'Truist', enabled: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getRules).mockResolvedValue([]);
    vi.mocked(api.getCategories).mockResolvedValue([
      { name: 'Transfers', color: '#888', type: 'transfer', sortOrder: 1 },
      { name: 'Coffee', color: '#a52', type: 'spend', sortOrder: 2 },
    ]);
    vi.mocked(api.getAccounts).mockResolvedValue(accounts);
  });

  it('detects matching cross-account transfer pairs within 3 days', async () => {
    const transactions: Transaction[] = [
      {
        id: 101,
        accountId: 1,
        date: '2026-03-10',
        description: 'ONLINE BANKING TRANSFER TO SAV 1234',
        merchantKey: 'ONLINE BANKING TRANSFER',
        amount: -1500.0,
        category: 'Uncategorized',
        source: 'boa-checking',
        userOverridden: false,
        dedupKey: 'k101',
        recurrence: 'onetime',
      },
      {
        id: 102,
        accountId: 2,
        date: '2026-03-11',
        description: 'ACH DEPOSIT FROM BANK OF AMERICA',
        merchantKey: 'ACH DEPOSIT',
        amount: 1500.0,
        category: 'Income',
        source: 'truist-checking',
        userOverridden: false,
        dedupKey: 'k102',
        recurrence: 'onetime',
      },
    ];
    vi.mocked(api.getTransactions).mockResolvedValue(transactions);

    const report = await generateCleanupReport();
    expect(report.transferPairs).toHaveLength(1);
    expect(report.transferPairs[0].outflowTxn.id).toBe(101);
    expect(report.transferPairs[0].inflowTxn.id).toBe(102);
    expect(report.transferPairs[0].amountAbs).toBe(1500.0);
    expect(report.transferPairs[0].outflowTxn.accountName).toBe('BoA Checking');
    expect(report.transferPairs[0].inflowTxn.accountName).toBe('Truist Checking');
  });

  it('ignores pairs already marked as Transfers on both sides', async () => {
    const transactions: Transaction[] = [
      {
        id: 201,
        accountId: 1,
        date: '2026-03-10',
        description: 'TRANSFER OUT',
        merchantKey: 'TRANSFER OUT',
        amount: -500.0,
        category: 'Transfers',
        source: 'boa-checking',
        userOverridden: true,
        dedupKey: 'k201',
        recurrence: 'onetime',
      },
      {
        id: 202,
        accountId: 2,
        date: '2026-03-10',
        description: 'TRANSFER IN',
        merchantKey: 'TRANSFER IN',
        amount: 500.0,
        category: 'Transfers',
        source: 'truist-checking',
        userOverridden: true,
        dedupKey: 'k202',
        recurrence: 'onetime',
      },
    ];
    vi.mocked(api.getTransactions).mockResolvedValue(transactions);

    const report = await generateCleanupReport();
    expect(report.transferPairs).toHaveLength(0);
  });

  it('detects duplicate transactions in the same account across sources or identical date/description', async () => {
    const transactions: Transaction[] = [
      {
        id: 301,
        accountId: 1,
        date: '2026-03-15',
        description: 'STARBUCKS STORE #10422',
        merchantKey: 'Starbucks',
        amount: -6.45,
        category: 'Coffee',
        source: 'boa-checking',
        userOverridden: false,
        dedupKey: 'k301',
        recurrence: 'onetime',
      },
      {
        id: 302,
        accountId: 1,
        date: '2026-03-16',
        description: 'STARBUCKS 10422 SEATTLE WA',
        merchantKey: 'Starbucks',
        amount: -6.45,
        category: 'Coffee',
        source: 'simplefin',
        userOverridden: false,
        dedupKey: 'k302',
        recurrence: 'onetime',
      },
    ];
    vi.mocked(api.getTransactions).mockResolvedValue(transactions);

    const report = await generateCleanupReport();
    expect(report.duplicateCandidates).toHaveLength(1);
    expect(report.duplicateCandidates[0].keepId).toBe(301);
    expect(report.duplicateCandidates[0].duplicateId).toBe(302);
    expect(report.duplicateCandidates[0].accountName).toBe('BoA Checking');
  });
});
