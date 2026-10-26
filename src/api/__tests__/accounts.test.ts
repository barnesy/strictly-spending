import { describe, it, expect } from 'vitest';
import { accountSchema } from '../accounts';

describe('accountSchema', () => {
  it('validates investment accounts like Fidelity', () => {
    const fidelity = {
      name: 'Fidelity Investments Individual - TOD (0951)',
      type: 'investment',
      institution: 'Fidelity Investments',
      source: 'custom',
      enabled: true,
      last4: '0951',
      currentBalance: 6513.85,
    };

    const parsed = accountSchema.parse(fidelity);
    expect(parsed.type).toBe('investment');
    expect(parsed.name).toBe('Fidelity Investments Individual - TOD (0951)');
  });

  it('validates loan and mortgage accounts', () => {
    const loan = {
      name: 'Santander Tesla Loan',
      type: 'loan',
      institution: 'Santander',
      source: 'custom',
      enabled: true,
      currentBalance: -19000,
    };
    expect(accountSchema.parse(loan).type).toBe('loan');

    const mortgage = {
      name: 'Rocket Mortgage',
      type: 'mortgage',
      institution: 'Rocket',
      source: 'custom',
      enabled: true,
      currentBalance: -320000,
    };
    expect(accountSchema.parse(mortgage).type).toBe('mortgage');
  });

  it('validates checking, credit, and savings accounts', () => {
    expect(accountSchema.parse({ name: 'Checking', type: 'checking', institution: 'Truist', source: 'truist-checking', enabled: true }).type).toBe('checking');
    expect(accountSchema.parse({ name: 'Credit', type: 'credit', institution: 'BoA', source: 'boa-credit', enabled: true }).type).toBe('credit');
    expect(accountSchema.parse({ name: 'Savings', type: 'savings', institution: 'Truist', source: 'custom', enabled: true }).type).toBe('savings');
  });
});
