import { normalizeForMatch } from './categorize';
import type { TaxRule } from './types';

export interface TaxGuess {
  isBusiness: boolean;
  taxCategory?: string;
  deductionStatus: 'pending' | 'confirmed' | 'rejected';
}

export interface ScheduleCCategory {
  id: string;
  label: string;
  deductionRate: number; // e.g. 1.0, 0.5
  description: string;
}

export const SCHEDULE_C_CATEGORIES: Record<string, ScheduleCCategory> = {
  advertising: { id: 'advertising', label: 'Advertising', deductionRate: 1.0, description: 'Online ads, marketing, business cards, websites.' },
  carTruck: { id: 'carTruck', label: 'Car & Truck', deductionRate: 1.0, description: 'Fuel, maintenance, parking, tolls for business travel.' },
  commissions: { id: 'commissions', label: 'Commissions & Fees', deductionRate: 1.0, description: 'Sales commissions, payment processing fees (Stripe, Paypal).' },
  contractLabor: { id: 'contractLabor', label: 'Contract Labor', deductionRate: 1.0, description: 'Payments to freelancers, sub-contractors, virtual assistants.' },
  depreciation: { id: 'depreciation', label: 'Depreciation', deductionRate: 1.0, description: 'Depreciation of business assets (laptops, equipment).' },
  insurance: { id: 'insurance', label: 'Insurance (not Health)', deductionRate: 1.0, description: 'Business liability insurance, professional indemnity.' },
  interest: { id: 'interest', label: 'Interest Expense', deductionRate: 1.0, description: 'Business loan interest, business credit card interest.' },
  legalProfessional: { id: 'legalProfessional', label: 'Legal & Professional', deductionRate: 1.0, description: 'Accountants, lawyers, tax prep software, consultants.' },
  officeExpense: { id: 'officeExpense', label: 'Office Expense & Software', deductionRate: 1.0, description: 'SaaS subscriptions, email hosts, hosting (AWS, Github), software.' },
  rentLease: { id: 'rentLease', label: 'Rent or Lease', deductionRate: 1.0, description: 'Co-working spaces, office rent, equipment rental.' },
  repairsMaintenance: { id: 'repairsMaintenance', label: 'Repairs & Maintenance', deductionRate: 1.0, description: 'Office repairs, equipment maintenance.' },
  supplies: { id: 'supplies', label: 'Supplies', deductionRate: 1.0, description: 'Physical items used in business, small tools.' },
  taxesLicenses: { id: 'taxesLicenses', label: 'Taxes & Licenses', deductionRate: 1.0, description: 'Business licenses, local/state entity taxes, permits.' },
  travel: { id: 'travel', label: 'Travel Expenses', deductionRate: 1.0, description: 'Flights, lodging, taxis/Ubers for business trips.' },
  meals: { id: 'meals', label: 'Meals (50% deduction)', deductionRate: 0.5, description: 'Meals with clients or while traveling for business.' },
  utilities: { id: 'utilities', label: 'Utilities', deductionRate: 1.0, description: 'Business phone, internet, utilities for designated business spaces.' },
  other: { id: 'other', label: 'Other Expenses', deductionRate: 1.0, description: 'Other miscellaneous business expenses.' }
};

export function guessTaxFields(description: string, category: string): TaxGuess {
  const desc = description.toLowerCase();
  
  // 1. Check strong merchant keyword matches first
  // commissions / fees
  if (desc.includes('stripe') || desc.includes('paypal') || desc.includes('square inc') || desc.includes('shopify')) {
    return { isBusiness: true, taxCategory: 'commissions', deductionStatus: 'pending' };
  }
  
  // Office expense / SaaS
  if (
    desc.includes('github') || 
    desc.includes('aws') || 
    desc.includes('amazon web service') ||
    desc.includes('vercel') || 
    desc.includes('heroku') || 
    desc.includes('sentry.io') || 
    desc.includes('figma') || 
    desc.includes('zoom.us') || 
    desc.includes('slack') || 
    desc.includes('adobe') || 
    desc.includes('openai') || 
    desc.includes('chatgpt') ||
    desc.includes('google cloud') || 
    desc.includes('jetbrains') ||
    desc.includes('godaddy') ||
    desc.includes('namecheap') ||
    desc.includes('posthog') ||
    desc.includes('supabase')
  ) {
    return { isBusiness: true, taxCategory: 'officeExpense', deductionStatus: 'pending' };
  }

  // Contract labor
  if (desc.includes('upwork') || desc.includes('fiverr') || desc.includes('toptal')) {
    return { isBusiness: true, taxCategory: 'contractLabor', deductionStatus: 'pending' };
  }

  // Legal & professional
  if (desc.includes('turbotax') || desc.includes('h&r block') || desc.includes('taxact') || desc.includes('freetaxusa')) {
    return { isBusiness: true, taxCategory: 'legalProfessional', deductionStatus: 'pending' };
  }

  // Rent & lease
  if (desc.includes('wework') || desc.includes('co-working') || desc.includes('coworking')) {
    return { isBusiness: true, taxCategory: 'rentLease', deductionStatus: 'pending' };
  }

  // Advertising
  if (desc.includes('facebook ad') || desc.includes('google ad') || desc.includes('meta ad') || desc.includes('linkedin ad')) {
    return { isBusiness: true, taxCategory: 'advertising', deductionStatus: 'pending' };
  }

  // 2. Cascade heuristics based on standard spend category
  if (category === 'Subscriptions') {
    // Non-business streaming/gaming should default to personal
    if (
      desc.includes('netflix') || 
      desc.includes('hulu') || 
      desc.includes('disney') || 
      desc.includes('spotify') || 
      desc.includes('playstation') || 
      desc.includes('xbox') || 
      desc.includes('nintendo') ||
      desc.includes('youtube') ||
      desc.includes('hbo max') ||
      desc.includes('paramount') ||
      desc.includes('peacock') ||
      desc.includes('apple.com/bill')
    ) {
      return { isBusiness: false, deductionStatus: 'confirmed' };
    }
    // Other subscriptions: guess business pending officeExpense
    return { isBusiness: true, taxCategory: 'officeExpense', deductionStatus: 'pending' };
  }

  if (category === 'Travel') {
    return { isBusiness: true, taxCategory: 'travel', deductionStatus: 'pending' };
  }

  if (category === 'Restaurants & Coffee') {
    return { isBusiness: true, taxCategory: 'meals', deductionStatus: 'pending' };
  }

  if (category === 'Transportation') {
    return { isBusiness: true, taxCategory: 'carTruck', deductionStatus: 'pending' };
  }

  if (category === 'Fees & Interest') {
    return { isBusiness: true, taxCategory: 'interest', deductionStatus: 'pending' };
  }

  if (category === 'Taxes') {
    return { isBusiness: true, taxCategory: 'taxesLicenses', deductionStatus: 'pending' };
  }

  if (category === 'Insurance') {
    // Guess business insurance if keywords match, otherwise personal
    if (desc.includes('business') || desc.includes('liability') || desc.includes('indemnity') || desc.includes('commercial')) {
      return { isBusiness: true, taxCategory: 'insurance', deductionStatus: 'pending' };
    }
    return { isBusiness: false, deductionStatus: 'confirmed' };
  }

  if (category === 'Utilities') {
    // Utilities can be partially deducted (e.g. phone/internet)
    if (desc.includes('verizon') || desc.includes('at&t') || desc.includes('comcast') || desc.includes('xfinity') || desc.includes('t-mobile') || desc.includes('spectrum')) {
      return { isBusiness: true, taxCategory: 'utilities', deductionStatus: 'pending' };
    }
    return { isBusiness: false, deductionStatus: 'confirmed' };
  }

  const personalCategories = [
    'Groceries',
    'Housing',
    'Mortgage',
    'Student Loans',
    'Auto Loan',
    'Entertainment',
    'Health',
    'Personal Care',
    'Shopping',
  ];

  if (personalCategories.includes(category)) {
    // Special check for office supplies
    if (category === 'Shopping' && (desc.includes('staples') || desc.includes('office depot') || desc.includes('office max'))) {
      return { isBusiness: true, taxCategory: 'supplies', deductionStatus: 'pending' };
    }
    return { isBusiness: false, deductionStatus: 'confirmed' };
  }

  if (category === 'Income' || category === 'Transfers') {
    return { isBusiness: false, deductionStatus: 'confirmed' };
  }

  // Default fallback for anything else (e.g. Uncategorized)
  return { isBusiness: false, deductionStatus: 'pending' };
}

export function matchTaxRules(
  description: string,
  merchantKey: string | undefined,
  taxRules: TaxRule[]
): TaxRule | null {
  const desc = normalizeForMatch(description);
  const mkey = merchantKey ? normalizeForMatch(merchantKey) : '';
  let best: TaxRule | null = null;
  for (const rule of taxRules) {
    if (!rule.pattern) continue;
    const pattern = normalizeForMatch(rule.pattern);
    if (!pattern) continue;
    if (desc.includes(pattern) || (mkey && mkey.includes(pattern))) {
      if (!best || rule.priority > best.priority) {
        best = rule;
      }
    }
  }
  return best;
}

export function resolveTaxDeduction(
  description: string,
  category: string,
  merchantKey: string | undefined,
  taxRules: TaxRule[]
): TaxGuess {
  const matchedRule = matchTaxRules(description, merchantKey, taxRules);
  if (matchedRule) {
    return {
      isBusiness: matchedRule.isBusiness,
      taxCategory: matchedRule.taxCategory,
      deductionStatus: 'confirmed',
    };
  }
  return guessTaxFields(description, category);
}
