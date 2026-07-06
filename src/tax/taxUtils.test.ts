import { describe, it, expect } from 'vitest';
import { guessTaxFields, matchTaxRules, resolveTaxDeduction } from './taxUtils';

describe('guessTaxFields', () => {
  it('guesses strong merchant keywords correctly', () => {
    // Commissions & Fees
    expect(guessTaxFields('Stripe Payment Gateway', 'Uncategorized')).toEqual({
      isBusiness: true,
      taxCategory: 'commissions',
      deductionStatus: 'pending',
    });
    expect(guessTaxFields('PAYPAL *MERCHANT', 'Uncategorized')).toEqual({
      isBusiness: true,
      taxCategory: 'commissions',
      deductionStatus: 'pending',
    });

    // Office Expense & Software
    expect(guessTaxFields('GitHub Co-pilot SaaS', 'Uncategorized')).toEqual({
      isBusiness: true,
      taxCategory: 'officeExpense',
      deductionStatus: 'pending',
    });
    expect(guessTaxFields('AWS Web Hosting Services', 'Uncategorized')).toEqual({
      isBusiness: true,
      taxCategory: 'officeExpense',
      deductionStatus: 'pending',
    });

    // Contract labor
    expect(guessTaxFields('Upwork Freelancer Fee', 'Uncategorized')).toEqual({
      isBusiness: true,
      taxCategory: 'contractLabor',
      deductionStatus: 'pending',
    });

    // Legal / professional
    expect(guessTaxFields('TurboTax 2025 Home & Business', 'Uncategorized')).toEqual({
      isBusiness: true,
      taxCategory: 'legalProfessional',
      deductionStatus: 'pending',
    });
  });

  it('handles personal streaming subscriptions vs business officeExpense', () => {
    // Standard streaming/gaming should be flagged personal and confirmed
    expect(guessTaxFields('NETFLIX.COM US SUBS', 'Subscriptions')).toEqual({
      isBusiness: false,
      deductionStatus: 'confirmed',
    });
    expect(guessTaxFields('Spotify Premium', 'Subscriptions')).toEqual({
      isBusiness: false,
      deductionStatus: 'confirmed',
    });

    // Other subscriptions default to business officeExpense
    expect(guessTaxFields('Vercel Hosting', 'Subscriptions')).toEqual({
      isBusiness: true,
      taxCategory: 'officeExpense',
      deductionStatus: 'pending',
    });
    expect(guessTaxFields('Some Generic Tool Subscription', 'Subscriptions')).toEqual({
      isBusiness: true,
      taxCategory: 'officeExpense',
      deductionStatus: 'pending',
    });
  });

  it('cascades categories correctly for business travel, meals, and utilities', () => {
    // Travel
    expect(guessTaxFields('Uber Trip 12345', 'Travel')).toEqual({
      isBusiness: true,
      taxCategory: 'travel',
      deductionStatus: 'pending',
    });

    // Restaurants & Coffee
    expect(guessTaxFields('Starbucks Coffee #999', 'Restaurants & Coffee')).toEqual({
      isBusiness: true,
      taxCategory: 'meals',
      deductionStatus: 'pending',
    });

    // Utilities - business phone/internet keywords
    expect(guessTaxFields('Verizon Wireless', 'Utilities')).toEqual({
      isBusiness: true,
      taxCategory: 'utilities',
      deductionStatus: 'pending',
    });
    // Other utilities should be personal
    expect(guessTaxFields('PG&E Electric bill', 'Utilities')).toEqual({
      isBusiness: false,
      deductionStatus: 'confirmed',
    });

    // Transportation
    expect(guessTaxFields('Taxi Cab Co', 'Transportation')).toEqual({
      isBusiness: true,
      taxCategory: 'carTruck',
      deductionStatus: 'pending',
    });

    // Fees & Interest
    expect(guessTaxFields('Bank Fee', 'Fees & Interest')).toEqual({
      isBusiness: true,
      taxCategory: 'interest',
      deductionStatus: 'pending',
    });

    // Taxes
    expect(guessTaxFields('State Tax License', 'Taxes')).toEqual({
      isBusiness: true,
      taxCategory: 'taxesLicenses',
      deductionStatus: 'pending',
    });
  });

  it('categorizes personal spend categories as personal-confirmed', () => {
    expect(guessTaxFields('Safeway Groceries', 'Groceries')).toEqual({
      isBusiness: false,
      deductionStatus: 'confirmed',
    });
    expect(guessTaxFields('Rent Payment', 'Housing')).toEqual({
      isBusiness: false,
      deductionStatus: 'confirmed',
    });

    // Special office supplies shopping check
    expect(guessTaxFields('Staples office paper', 'Shopping')).toEqual({
      isBusiness: true,
      taxCategory: 'supplies',
      deductionStatus: 'pending',
    });
    expect(guessTaxFields('Macy\'s clothes purchase', 'Shopping')).toEqual({
      isBusiness: false,
      deductionStatus: 'confirmed',
    });
  });

  it('falls back to pending personal on unknown category', () => {
    expect(guessTaxFields('Something weird', 'Uncategorized')).toEqual({
      isBusiness: false,
      deductionStatus: 'pending',
    });
  });
});

describe('matchTaxRules and resolveTaxDeduction', () => {
  const dummyRules = [
    {
      id: 1,
      pattern: 'my-business-host',
      isBusiness: true,
      taxCategory: 'officeExpense',
      priority: 100,
      createdAt: '2026-06-20T00:00:00Z',
    },
    {
      id: 2,
      pattern: 'personal-gaming',
      isBusiness: false,
      priority: 100,
      createdAt: '2026-06-20T00:00:00Z',
    },
    {
      id: 3,
      pattern: 'specific-starbucks',
      isBusiness: true,
      taxCategory: 'meals',
      priority: 1000,
      createdAt: '2026-06-20T00:00:00Z',
    },
  ];

  it('matches rules by pattern in description or merchant key', () => {
    // Description matching
    expect(matchTaxRules('Subscription for my-business-host website', undefined, dummyRules)).toEqual(dummyRules[0]);
    // Merchant key matching
    expect(matchTaxRules('Subscription payment', 'my-business-host', dummyRules)).toEqual(dummyRules[0]);
    // Case insensitivity & normalization
    expect(matchTaxRules('MY-BUSINESS-HOST', undefined, dummyRules)).toEqual(dummyRules[0]);
    // No match returns null
    expect(matchTaxRules('random description', undefined, dummyRules)).toBeNull();
  });

  it('resolves tax deduction with rules having higher priority than heuristics', () => {
    // matching rule overrides normal heuristic
    expect(resolveTaxDeduction('Purchase at specific-starbucks-coffee', 'Restaurants & Coffee', undefined, dummyRules)).toEqual({
      isBusiness: true,
      taxCategory: 'meals',
      deductionStatus: 'confirmed',
    });

    // matching personal rule overrides normal heuristic
    expect(resolveTaxDeduction('personal-gaming monthly payment', 'Shopping', undefined, dummyRules)).toEqual({
      isBusiness: false,
      taxCategory: undefined,
      deductionStatus: 'confirmed',
    });

    // fallback to heuristic if no rule matches
    expect(resolveTaxDeduction('Starbucks Coffee', 'Restaurants & Coffee', undefined, dummyRules)).toEqual({
      isBusiness: true,
      taxCategory: 'meals',
      deductionStatus: 'pending',
    });
  });
});
