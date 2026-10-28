import type { Account, Category } from '../types';
import {
  formatLocalDate,
  isBusinessAccount,
  type DashboardViewMode,
  type DateRangePreset,
  type GroupBy,
  type ProfileType,
  type RecurrenceFilter,
  type TransactionType,
} from '../stores/store';

export type TransactionSortBy = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export interface SmartFilterChip {
  id: string;
  kind:
    | 'date'
    | 'category'
    | 'account'
    | 'amount'
    | 'type'
    | 'recurrence'
    | 'view'
    | 'groupBy'
    | 'sort'
    | 'profile'
    | 'forecast'
    | 'compare'
    | 'runway'
    | 'keyword'
    | 'reset';
  label: string;
  valueSummary: string;
}

export interface ParsedNaturalLanguageSearch {
  rawQuery: string;
  hasStructuredIntents: boolean;
  isResetCommand: boolean;
  preset?: DateRangePreset;
  customStart?: string;
  customEnd?: string;
  drillMonth?: string;
  soloCategories?: string[];
  excludedCategories?: string[];
  enabledAccountIds?: number[];
  profile?: ProfileType;
  transactionType?: TransactionType;
  spendOnly?: boolean;
  recurrenceFilter?: RecurrenceFilter;
  minPrice?: number;
  maxPrice?: number;
  viewMode?: DashboardViewMode;
  groupBy?: GroupBy;
  sortBy?: TransactionSortBy;
  forecastHorizon?: number;
  compareWithPriorYear?: boolean;
  showRunway?: boolean;
  remainingSearchQuery: string;
  chips: SmartFilterChip[];
}

interface ParseContext {
  accounts: Account[];
  categories: Category[];
  referenceDate?: Date;
}

interface ConsumedSpan {
  start: number;
  end: number;
}

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const SHORT_MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  Groceries: [
    'groceries',
    'grocery',
    'supermarket',
    'supermarkets',
    'food store',
    'grocery store',
  ],
  'Restaurants & Coffee': [
    'restaurants & coffee',
    'restaurants and coffee',
    'restaurants',
    'restaurant',
    'dining out',
    'dining',
    'eating out',
    'takeout',
    'take out',
    'fast food',
    'coffee shops',
    'coffee shop',
    'coffee',
    'cafes',
    'cafe',
    'bars',
    'food and drink',
    'food & drink',
  ],
  Transportation: [
    'transportation',
    'transport',
    'gas stations',
    'gas station',
    'gas & fuel',
    'fuel',
    'gas',
    'parking',
    'tolls',
    'public transit',
    'transit',
    'rideshare',
    'commute',
  ],
  'Auto Loan': [
    'auto loans',
    'auto loan',
    'car loans',
    'car loan',
    'car payments',
    'car payment',
    'vehicle loan',
  ],
  Utilities: [
    'utilities',
    'utility bills',
    'utility bill',
    'utility',
    'electric bill',
    'electricity',
    'electric',
    'water bill',
    'power bill',
    'internet bill',
    'internet',
    'phone bill',
    'trash',
  ],
  Subscriptions: [
    'subscriptions',
    'subscription',
    'streaming services',
    'streaming',
    'memberships',
    'membership',
    'software',
  ],
  Housing: ['housing', 'rent', 'hoa', 'home maintenance', 'apartment'],
  Mortgage: ['mortgages', 'mortgage', 'home loan', 'house payment'],
  'Student Loans': ['student loans', 'student loan', 'tuition'],
  Shopping: [
    'shopping',
    'retail',
    'clothing',
    'clothes',
    'electronics',
    'merchandise',
  ],
  Entertainment: [
    'entertainment',
    'movies',
    'movie',
    'concerts',
    'events',
    'games',
    'gaming',
    'hobbies',
    'fun',
  ],
  Health: [
    'healthcare',
    'health',
    'medical',
    'doctor',
    'doctors',
    'dental',
    'dentist',
    'pharmacy',
    'fitness',
    'gym',
    'wellness',
    'hospital',
  ],
  Insurance: [
    'insurance',
    'auto insurance',
    'car insurance',
    'home insurance',
    'life insurance',
  ],
  Taxes: ['taxes', 'tax payments', 'tax', 'irs', 'property tax'],
  Travel: [
    'travel',
    'traveling',
    'flights',
    'flight',
    'hotels',
    'hotel',
    'vacation',
    'vacations',
    'airlines',
    'airline',
    'lodging',
  ],
  'Personal Care': [
    'personal care',
    'haircut',
    'haircuts',
    'salon',
    'barber',
    'spa',
    'beauty',
    'grooming',
  ],
  'Fees & Interest': [
    'fees & interest',
    'fees and interest',
    'bank fees',
    'late fees',
    'late fee',
    'atm fees',
    'atm fee',
    'finance charges',
    'interest charges',
    'fees',
  ],
  Income: [
    'paychecks',
    'paycheck',
    'direct deposits',
    'direct deposit',
    'payroll',
    'salary',
    'earnings',
    'dividends',
  ],
  Transfers: [
    'transfers',
    'transfer',
    'credit card payments',
    'credit card payment',
  ],
  Uncategorized: [
    'uncategorized',
    'unsorted',
    'untagged',
    'needs category',
    'no category',
  ],
};

const STOP_WORDS = new Set([
  'show',
  'me',
  'all',
  'my',
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'for',
  'from',
  'to',
  'at',
  'with',
  'by',
  'and',
  'or',
  'that',
  'are',
  'were',
  'was',
  'is',
  'be',
  'been',
  'view',
  'see',
  'find',
  'search',
  'filter',
  'list',
  'only',
  'just',
  'please',
  'what',
  'did',
  'i',
  'we',
  'have',
  'had',
  'paid',
  'pay',
  'spent',
  'money',
  'dollars',
  'dollar',
  'bucks',
  'during',
  'within',
  'into',
  'account',
  'accounts',
  'category',
  'categories',
]);

function isOverlapping(spans: ConsumedSpan[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start);
}

function markSpan(spans: ConsumedSpan[], start: number, end: number): void {
  spans.push({ start, end });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseAmountNumber(raw: string): number {
  const cleaned = raw.replace(/[,$\s]/g, '');
  const val = Number(cleaned);
  return Number.isFinite(val) ? val : NaN;
}

/**
 * Parses a plain-language search query into structured Dashboard filters, view updates,
 * sorting, and any remaining merchant/description keyword search.
 */
export function parseNaturalLanguageSearch(
  rawInput: string,
  context: ParseContext
): ParsedNaturalLanguageSearch {
  const rawQuery = rawInput.trim();
  const result: ParsedNaturalLanguageSearch = {
    rawQuery,
    hasStructuredIntents: false,
    isResetCommand: false,
    remainingSearchQuery: '',
    chips: [],
  };

  if (!rawQuery) {
    return result;
  }

  const lower = rawQuery.toLowerCase();
  const now = context.referenceDate ?? new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const spans: ConsumedSpan[] = [];

  // 0. Check for Reset / Clear All command
  if (
    /^(?:reset|reset\s+filters|clear|clear\s+all|clear\s+filters|default\s+view|show\s+everything|reset\s+all)$/i.test(
      rawQuery
    )
  ) {
    result.hasStructuredIntents = true;
    result.isResetCommand = true;
    result.chips.push({
      id: 'reset',
      kind: 'reset',
      label: 'Reset',
      valueSummary: 'Restore default filters',
    });
    return result;
  }

  const matchAndConsume = (
    regex: RegExp,
    onMatch: (match: RegExpExecArray) => boolean | void
  ) => {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const re = new RegExp(regex.source, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (isOverlapping(spans, start, end)) continue;
      const shouldConsume = onMatch(m);
      if (shouldConsume !== false) {
        markSpan(spans, start, end);
      }
    }
  };

  // =========================================================================
  // 1. COMPARE & FORECAST & RUNWAY INTENTS
  // =========================================================================
  matchAndConsume(
    /\b(?:compare(?:\s+with|\s+to)?\s+(?:last|prior|previous)\s+year|(?:vs\.?|versus)\s+(?:last|prior|previous)\s+year|year\s+over\s+year|yoy)\b/i,
    () => {
      result.compareWithPriorYear = true;
      result.viewMode = 'chart';
      result.chips.push({
        id: 'compare-yoy',
        kind: 'compare',
        label: 'Compare',
        valueSummary: 'Same Month Last Year',
      });
    }
  );

  matchAndConsume(
    /\b(?:forecast|project|projection)(?:\s+(?:next|for))?\s+(\d+)\s*(?:months?|mos?|m)\b/i,
    (m) => {
      const n = Number(m[1]);
      const valid = [1, 3, 6, 12].includes(n) ? n : n <= 2 ? 1 : n <= 4 ? 3 : n <= 9 ? 6 : 12;
      result.forecastHorizon = valid;
      result.viewMode = 'chart';
      result.chips.push({
        id: 'forecast',
        kind: 'forecast',
        label: 'Forecast',
        valueSummary: `+${valid} Months`,
      });
    }
  );

  matchAndConsume(
    /\b(?:forecast\s+this\s+month|remaining\s+this\s+month\s+forecast)\b/i,
    () => {
      result.forecastHorizon = 0.5;
      result.viewMode = 'chart';
      result.chips.push({
        id: 'forecast',
        kind: 'forecast',
        label: 'Forecast',
        valueSummary: 'This Month (Remaining)',
      });
    }
  );

  matchAndConsume(/\b(?:show\s+runway|project\s+runway|cash\s+runway|runway)\b/i, () => {
    result.showRunway = true;
    result.chips.push({
      id: 'runway',
      kind: 'runway',
      label: 'Runway',
      valueSummary: 'Show Cash Runway',
    });
  });

  // =========================================================================
  // 2. DATE & TIME RANGES
  // =========================================================================
  let dateMatched = false;

  // 2a. Explicit ISO Date Range: "from 2026-01-01 to 2026-03-31" or "2026-01-01 to 2026-03-31"
  matchAndConsume(
    /\b(?:from\s+|between\s+)?(\d{4}-\d{2}-\d{2})\s+(?:to|through|until|and|-|–)\s+(\d{4}-\d{2}-\d{2})\b/i,
    (m) => {
      if (dateMatched) return false;
      dateMatched = true;
      result.preset = 'custom';
      result.customStart = m[1];
      result.customEnd = m[2];
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: `${m[1]} – ${m[2]}`,
      });
    }
  );

  // 2b. Month-to-Month range: "from jan to mar 2026", "january through march"
  matchAndConsume(
    /\b(?:from\s+|between\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(?:to|through|until|-|–)\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)(?:\s+(20\d{2}))?\b/i,
    (m) => {
      if (dateMatched) return false;
      const m1 = MONTH_NAMES[m[1].toLowerCase()];
      const m2 = MONTH_NAMES[m[2].toLowerCase()];
      if (m1 === undefined || m2 === undefined) return false;
      dateMatched = true;
      const yr = m[3] ? Number(m[3]) : currentYear;
      const endYr = m2 < m1 && !m[3] ? yr + 1 : yr;
      const start = formatLocalDate(new Date(yr, m1, 1));
      const end = formatLocalDate(new Date(endYr, m2 + 1, 0));
      result.preset = 'custom';
      result.customStart = start;
      result.customEnd = end;
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: `${SHORT_MONTH_LABELS[m1]} – ${SHORT_MONTH_LABELS[m2]} ${endYr}`,
      });
    }
  );

  // 2c. Standard Presets: This Month, Last Month, YTD / This Year, Last 30D, Last 90D, All Time
  matchAndConsume(
    /\b(?:this\s+month|current\s+month|month\s+to\s+date|mtd)\b/i,
    () => {
      if (dateMatched) return false;
      dateMatched = true;
      result.preset = 'thisMonth';
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: 'This Month',
      });
    }
  );

  matchAndConsume(
    /\b(?:last\s+month|previous\s+month|prev\s+month|prior\s+month)\b/i,
    () => {
      if (dateMatched) return false;
      dateMatched = true;
      result.preset = 'lastMonth';
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: 'Last Month',
      });
    }
  );

  matchAndConsume(
    /\b(?:year\s+to\s+date|ytd|this\s+year|current\s+year)\b/i,
    () => {
      if (dateMatched) return false;
      dateMatched = true;
      result.preset = 'ytd';
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: 'Year to Date (YTD)',
      });
    }
  );

  matchAndConsume(
    /\b(?:last\s+year|previous\s+year|prior\s+year)\b/i,
    () => {
      if (dateMatched) return false;
      dateMatched = true;
      const lastYear = currentYear - 1;
      result.preset = 'custom';
      result.customStart = `${lastYear}-01-01`;
      result.customEnd = `${lastYear}-12-31`;
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: `${lastYear} (Full Year)`,
      });
    }
  );

  matchAndConsume(
    /\b(?:(?:last|past)\s+30\s*days?|30\s*days?|30d|past\s+month)\b/i,
    () => {
      if (dateMatched) return false;
      dateMatched = true;
      result.preset = 'last30';
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: 'Last 30 Days',
      });
    }
  );

  matchAndConsume(
    /\b(?:(?:last|past)\s+90\s*days?|90\s*days?|90d|(?:last|past)\s+3\s*months?)\b/i,
    () => {
      if (dateMatched) return false;
      dateMatched = true;
      result.preset = 'last90';
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: 'Last 90 Days',
      });
    }
  );

  matchAndConsume(
    /\b(?:all\s+time|all\s+dates|forever|since\s+the\s+beginning|ever)\b/i,
    () => {
      if (dateMatched) return false;
      dateMatched = true;
      result.preset = 'allTime';
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: 'All Time',
      });
    }
  );

  // 2d. Relative dynamic windows: today, yesterday, this week, last week, last N days/weeks/months
  matchAndConsume(/\btoday\b/i, () => {
    if (dateMatched) return false;
    dateMatched = true;
    const todayIso = formatLocalDate(now);
    result.preset = 'custom';
    result.customStart = todayIso;
    result.customEnd = todayIso;
    result.chips.push({
      id: 'date',
      kind: 'date',
      label: 'Date',
      valueSummary: 'Today',
    });
  });

  matchAndConsume(/\byesterday\b/i, () => {
    if (dateMatched) return false;
    dateMatched = true;
    const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yestIso = formatLocalDate(yest);
    result.preset = 'custom';
    result.customStart = yestIso;
    result.customEnd = yestIso;
    result.chips.push({
      id: 'date',
      kind: 'date',
      label: 'Date',
      valueSummary: 'Yesterday',
    });
  });

  matchAndConsume(/\bthis\s+week\b/i, () => {
    if (dateMatched) return false;
    dateMatched = true;
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    result.preset = 'custom';
    result.customStart = formatLocalDate(startOfWeek);
    result.customEnd = formatLocalDate(now);
    result.chips.push({
      id: 'date',
      kind: 'date',
      label: 'Date',
      valueSummary: 'This Week',
    });
  });

  matchAndConsume(/\b(?:last\s+week|previous\s+week|prior\s+week)\b/i, () => {
    if (dateMatched) return false;
    dateMatched = true;
    const dayOfWeek = now.getDay();
    const endOfLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 1);
    const startOfLastWeek = new Date(
      endOfLastWeek.getFullYear(),
      endOfLastWeek.getMonth(),
      endOfLastWeek.getDate() - 6
    );
    result.preset = 'custom';
    result.customStart = formatLocalDate(startOfLastWeek);
    result.customEnd = formatLocalDate(endOfLastWeek);
    result.chips.push({
      id: 'date',
      kind: 'date',
      label: 'Date',
      valueSummary: 'Last Week',
    });
  });

  matchAndConsume(/\bpast\s+week\b/i, () => {
    if (dateMatched) return false;
    dateMatched = true;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    result.preset = 'custom';
    result.customStart = formatLocalDate(start);
    result.customEnd = formatLocalDate(now);
    result.chips.push({
      id: 'date',
      kind: 'date',
      label: 'Date',
      valueSummary: 'Past 7 Days',
    });
  });

  matchAndConsume(
    /\b(?:last|past)\s+(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\b/i,
    (m) => {
      if (dateMatched) return false;
      const count = Number(m[1]);
      if (!Number.isFinite(count) || count <= 0) return false;
      dateMatched = true;
      const unit = m[2].toLowerCase();
      let start: Date;
      let labelUnit: string;
      if (unit.startsWith('w')) {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - count * 7);
        labelUnit = count === 1 ? 'Week' : 'Weeks';
      } else if (unit.startsWith('m')) {
        start = new Date(now.getFullYear(), now.getMonth() - count, now.getDate());
        labelUnit = count === 1 ? 'Month' : 'Months';
      } else {
        if (count === 30) {
          result.preset = 'last30';
          result.chips.push({
            id: 'date',
            kind: 'date',
            label: 'Date',
            valueSummary: 'Last 30 Days',
          });
          return;
        }
        if (count === 90) {
          result.preset = 'last90';
          result.chips.push({
            id: 'date',
            kind: 'date',
            label: 'Date',
            valueSummary: 'Last 90 Days',
          });
          return;
        }
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - count);
        labelUnit = count === 1 ? 'Day' : 'Days';
      }
      result.preset = 'custom';
      result.customStart = formatLocalDate(start);
      result.customEnd = formatLocalDate(now);
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: `Last ${count} ${labelUnit}`,
      });
    }
  );

  // 2e. Quarters: "q1", "q2 2025", "this quarter", "last quarter"
  matchAndConsume(/\b(?:q([1-4])(?:\s+(20\d{2}))?|(first|second|third|fourth)\s+quarter(?:\s+(20\d{2}))?)\b/i, (m) => {
    if (dateMatched) return false;
    dateMatched = true;
    const qMap: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
    const q = m[1] ? Number(m[1]) : qMap[m[3].toLowerCase()];
    const yr = m[2] ? Number(m[2]) : m[4] ? Number(m[4]) : currentYear;
    const startMonth = (q - 1) * 3;
    const start = formatLocalDate(new Date(yr, startMonth, 1));
    const end = formatLocalDate(new Date(yr, startMonth + 3, 0));
    result.preset = 'custom';
    result.customStart = start;
    result.customEnd = end;
    result.chips.push({
      id: 'date',
      kind: 'date',
      label: 'Date',
      valueSummary: `Q${q} ${yr}`,
    });
  });

  matchAndConsume(/\b(this|current|last|previous|prior)\s+quarter\b/i, (m) => {
    if (dateMatched) return false;
    dateMatched = true;
    const isLast = /last|previous|prior/i.test(m[1]);
    const currQ = Math.floor(currentMonth / 3);
    const targetQ = isLast ? (currQ === 0 ? 3 : currQ - 1) : currQ;
    const yr = isLast && currQ === 0 ? currentYear - 1 : currentYear;
    const startMonth = targetQ * 3;
    result.preset = 'custom';
    result.customStart = formatLocalDate(new Date(yr, startMonth, 1));
    result.customEnd = formatLocalDate(new Date(yr, startMonth + 3, 0));
    result.chips.push({
      id: 'date',
      kind: 'date',
      label: 'Date',
      valueSummary: `${isLast ? 'Last' : 'This'} Quarter (Q${targetQ + 1} ${yr})`,
    });
  });

  // 2f. Named Month (+ optional year): "in march", "october 2025", "september", "for jan"
  matchAndConsume(
    /\b(?:(in|for|during|from|of)\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)(?:\s+(20\d{2}))?\b/i,
    (m) => {
      if (dateMatched) return false;
      const prep = m[1];
      const monthWord = m[2].toLowerCase();
      const yearStr = m[3];
      // For "may" without a preposition or year, only match if query isn't using "may" as modal verb
      if (monthWord === 'may' && !prep && !yearStr) {
        return false;
      }
      const monthIdx = MONTH_NAMES[monthWord];
      if (monthIdx === undefined) return false;
      dateMatched = true;
      let yr = yearStr ? Number(yearStr) : currentYear;
      if (!yearStr && monthIdx > currentMonth) {
        yr = currentYear - 1;
      }
      const monthKeyStr = `${yr}-${String(monthIdx + 1).padStart(2, '0')}`;
      result.preset = 'custom';
      result.customStart = formatLocalDate(new Date(yr, monthIdx, 1));
      result.customEnd = formatLocalDate(new Date(yr, monthIdx + 1, 0));
      result.drillMonth = monthKeyStr;
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: `${SHORT_MONTH_LABELS[monthIdx]} ${yr}`,
      });
    }
  );

  // 2g. Standalone 4-digit Year: "in 2025", "2025", "for 2024"
  matchAndConsume(/\b(?:in\s+|for\s+|from\s+|during\s+)?(20[2-3]\d)\b/i, (m) => {
    if (dateMatched) return false;
    const yr = Number(m[1]);
    // Avoid matching if this 4-digit number is an account's last4
    const isAccountLast4 = context.accounts.some((a) => a.last4 === m[1]);
    if (isAccountLast4 && !/\b(?:in|for|year|during)\s+20[2-3]\d/i.test(m[0])) {
      return false;
    }
    dateMatched = true;
    if (yr === currentYear) {
      result.preset = 'ytd';
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: `${yr} (YTD)`,
      });
    } else {
      result.preset = 'custom';
      result.customStart = `${yr}-01-01`;
      result.customEnd = `${yr}-12-31`;
      result.chips.push({
        id: 'date',
        kind: 'date',
        label: 'Date',
        valueSummary: `${yr}`,
      });
    }
  });

  // =========================================================================
  // 3. PRICE / AMOUNT FILTERS
  // =========================================================================
  // 3a. Range: "between $20 and $100", "from $20 to $100", "$20-$100", "$20 to $100"
  matchAndConsume(
    /(?:(?:\bbetween\s+|\bfrom\s+)\$?(\d[\d,]*(?:\.\d{1,2})?)\s*(?:and|to|-|–)\s*\$?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(?:dollars?|bucks?))?|\$(\d[\d,]*(?:\.\d{1,2})?)\s*(?:to|-|–)\s*\$?(\d[\d,]*(?:\.\d{1,2})?))/i,
    (m) => {
      const lowRaw = m[1] ?? m[3];
      const highRaw = m[2] ?? m[4];
      const n1 = parseAmountNumber(lowRaw);
      const n2 = parseAmountNumber(highRaw);
      if (Number.isNaN(n1) || Number.isNaN(n2)) return false;
      const min = Math.min(n1, n2);
      const max = Math.max(n1, n2);
      result.minPrice = min;
      result.maxPrice = max;
      result.chips.push({
        id: 'amount-range',
        kind: 'amount',
        label: 'Amount',
        valueSummary: `$${min} – $${max}`,
      });
    }
  );

  // 3b. Min Price: "over $50", "above 100", "more than $50", "greater than $50", "at least $50", ">= $50", "> $50", "$100+"
  matchAndConsume(
    /(?:(?:\b(?:over|above|more\s+than|greater\s+than|at\s+least|minimum|min|starting\s+at)\s+|>=?\s*)\$?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(?:dollars?|bucks?))?|\$(\d[\d,]*(?:\.\d{1,2})?)\+)/i,
    (m) => {
      const val = parseAmountNumber(m[1] ?? m[2]);
      if (Number.isNaN(val)) return false;
      result.minPrice = val;
      result.chips.push({
        id: 'amount-min',
        kind: 'amount',
        label: 'Min Amount',
        valueSummary: `≥ $${val}`,
      });
    }
  );

  // 3c. Max Price: "under $50", "below 50", "less than $50", "up to $50", "at most $50", "max $50", "<= $50", "< $50"
  matchAndConsume(
    /(?:\b(?:under|below|less\s+than|fewer\s+than|up\s+to|at\s+most|maximum|max)\s+|<=?\s*)\$?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(?:dollars?|bucks?))?/i,
    (m) => {
      const val = parseAmountNumber(m[1]);
      if (Number.isNaN(val)) return false;
      result.maxPrice = val;
      result.chips.push({
        id: 'amount-max',
        kind: 'amount',
        label: 'Max Amount',
        valueSummary: `≤ $${val}`,
      });
    }
  );

  // 3d. Approximate amount: "around $50", "about $50", "~$50"
  matchAndConsume(
    /(?:\b(?:around|about|approximately|approx)\s+|~\s*)\$?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(?:dollars?|bucks?))?/i,
    (m) => {
      const val = parseAmountNumber(m[1]);
      if (Number.isNaN(val)) return false;
      const min = Math.max(0, Math.round(val * 0.8 * 100) / 100);
      const max = Math.round(val * 1.2 * 100) / 100;
      result.minPrice = min;
      result.maxPrice = max;
      result.chips.push({
        id: 'amount-approx',
        kind: 'amount',
        label: 'Amount',
        valueSummary: `~$${val} ($${min}–$${max})`,
      });
    }
  );

  // 3e. Exact dollar amount: "exactly $49.99" or standalone "$49.99"
  matchAndConsume(
    /(?:\bexactly\s+\$?(\d[\d,]*(?:\.\d{1,2})?)|\$(\d[\d,]*(?:\.\d{1,2})?))/i,
    (m) => {
      const val = parseAmountNumber(m[1] ?? m[2]);
      if (Number.isNaN(val)) return false;
      result.minPrice = val;
      result.maxPrice = val;
      result.chips.push({
        id: 'amount-exact',
        kind: 'amount',
        label: 'Amount',
        valueSummary: `= $${val}`,
      });
    }
  );

  // 3f. Qualitative amount descriptors: "big purchases", "large expenses", "small purchases"
  matchAndConsume(
    /\b(?:big|large|major|high\s+ticket|expensive)\s+(?:purchases?|expenses?|transactions?|charges?|spend(?:ing)?)\b/i,
    () => {
      if (result.minPrice === undefined) {
        result.minPrice = 100;
        result.chips.push({
          id: 'amount-large',
          kind: 'amount',
          label: 'Min Amount',
          valueSummary: '≥ $100 (Large)',
        });
      }
    }
  );

  matchAndConsume(
    /\b(?:small|tiny|micro|minor|cheap)\s+(?:purchases?|expenses?|transactions?|charges?|spend(?:ing)?)\b/i,
    () => {
      if (result.maxPrice === undefined) {
        result.maxPrice = 20;
        result.chips.push({
          id: 'amount-small',
          kind: 'amount',
          label: 'Max Amount',
          valueSummary: '≤ $20 (Small)',
        });
      }
    }
  );

  // =========================================================================
  // 4. SORTING INTENTS
  // =========================================================================
  matchAndConsume(
    /\b(?:sort(?:ed)?\s+by\s+(?:highest|largest|biggest|amount(?:\s+desc)?)|biggest|largest|highest(?:\s+amount|\s+spend)?|most\s+expensive|top\s+(?:transactions?|purchases?|expenses?|charges?))\b/i,
    () => {
      result.sortBy = 'amount_desc';
      result.chips.push({
        id: 'sort',
        kind: 'sort',
        label: 'Sort',
        valueSummary: 'Largest Amount First',
      });
    }
  );

  matchAndConsume(
    /\b(?:sort(?:ed)?\s+by\s+(?:lowest|smallest|cheapest|amount\s+asc)|smallest|lowest(?:\s+amount)?|cheapest|least\s+expensive)\b/i,
    () => {
      result.sortBy = 'amount_asc';
      result.chips.push({
        id: 'sort',
        kind: 'sort',
        label: 'Sort',
        valueSummary: 'Smallest Amount First',
      });
    }
  );

  matchAndConsume(
    /\b(?:sort(?:ed)?\s+by\s+(?:oldest|earliest|date\s+asc)|oldest(?:\s+first)?|earliest(?:\s+first)?)\b/i,
    () => {
      result.sortBy = 'date_asc';
      result.chips.push({
        id: 'sort',
        kind: 'sort',
        label: 'Sort',
        valueSummary: 'Oldest First',
      });
    }
  );

  matchAndConsume(
    /\b(?:sort(?:ed)?\s+by\s+(?:newest|latest|recent|date(?:\s+desc)?)|newest\s+first|most\s+recent\s+first)\b/i,
    () => {
      result.sortBy = 'date_desc';
      result.chips.push({
        id: 'sort',
        kind: 'sort',
        label: 'Sort',
        valueSummary: 'Newest First',
      });
    }
  );

  // =========================================================================
  // 5. VIEW MODE & CHART GROUPING
  // =========================================================================
  matchAndConsume(
    /\b(?:group(?:ed)?\s+by\s+accounts?|by\s+accounts?|per\s+account|account\s+breakdown)\b/i,
    () => {
      result.groupBy = 'account';
      result.viewMode = 'chart';
      result.chips.push({
        id: 'groupBy',
        kind: 'groupBy',
        label: 'Group By',
        valueSummary: 'Account',
      });
    }
  );

  matchAndConsume(
    /\b(?:group(?:ed)?\s+by\s+categor(?:y|ies)|by\s+categor(?:y|ies)|category\s+breakdown)\b/i,
    () => {
      result.groupBy = 'category';
      result.viewMode = 'chart';
      result.chips.push({
        id: 'groupBy',
        kind: 'groupBy',
        label: 'Group By',
        valueSummary: 'Category',
      });
    }
  );

  matchAndConsume(
    /\b(?:(?:in\s+|show\s+|view\s+)?(?:bar\s+)?chart(?:\s+view)?|graph(?:\s+view)?|trends?\s+view|visualize)\b/i,
    () => {
      result.viewMode = 'chart';
      result.chips.push({
        id: 'view',
        kind: 'view',
        label: 'View',
        valueSummary: 'Chart',
      });
    }
  );

  matchAndConsume(
    /\b(?:(?:in\s+|show\s+|view\s+)?timeline(?:\s+view)?|calendar(?:\s+view)?|day\s+by\s+day|daily\s+timeline)\b/i,
    () => {
      result.viewMode = 'timeline';
      result.chips.push({
        id: 'view',
        kind: 'view',
        label: 'View',
        valueSummary: 'Timeline',
      });
    }
  );

  matchAndConsume(
    /\b(?:(?:in\s+|show\s+|view\s+)?table(?:\s+view)?|transaction\s+list|itemized\s+list)\b/i,
    () => {
      result.viewMode = 'table';
      result.chips.push({
        id: 'view',
        kind: 'view',
        label: 'View',
        valueSummary: 'Table',
      });
    }
  );

  // =========================================================================
  // 6. RECURRENCE FILTER
  // =========================================================================
  matchAndConsume(
    /\b(?:non[-\s]?recurring|one[-\s]?time(?:\s+only)?|onetime|variable\s+(?:expenses?|spend(?:ing)?|purchases?)|discretionary)\b/i,
    () => {
      result.recurrenceFilter = 'onetime';
      result.chips.push({
        id: 'recurrence',
        kind: 'recurrence',
        label: 'Frequency',
        valueSummary: 'One-Time Only',
      });
    }
  );

  matchAndConsume(
    /\b(?:recurring(?:\s+bills?|\s+expenses?|\s+charges?|\s+only)?|monthly\s+bills?|fixed\s+expenses?|autopay|repeating)\b/i,
    () => {
      if (!result.recurrenceFilter) {
        result.recurrenceFilter = 'recurring';
        result.chips.push({
          id: 'recurrence',
          kind: 'recurrence',
          label: 'Frequency',
          valueSummary: 'Recurring Only',
        });
      }
    }
  );

  // =========================================================================
  // 7. ACCOUNTS, ACCOUNT GROUPS, & BUSINESS/PERSONAL PROFILE
  // =========================================================================
  const matchedAccountIds = new Set<number>();
  const matchedAccountLabels: string[] = [];

  // 7a. Profile: Business vs Personal
  matchAndConsume(
    /\b(?:business(?:\s+accounts?|\s+expenses?|\s+spend(?:ing)?|\s+transactions?)?|webtime(?:\s+llc|\s+corp)?|llc|company)\b/i,
    () => {
      result.profile = 'business';
      const bizIds = context.accounts
        .filter((a) => isBusinessAccount(a) && typeof a.id === 'number')
        .map((a) => a.id!);
      if (bizIds.length > 0) {
        bizIds.forEach((id) => matchedAccountIds.add(id));
      }
      result.chips.push({
        id: 'profile',
        kind: 'profile',
        label: 'Profile',
        valueSummary: 'Business (WEBTIME LLC)',
      });
    }
  );

  matchAndConsume(
    /\b(?:personal(?:\s+accounts?|\s+expenses?|\s+spend(?:ing)?|\s+transactions?)?|household)\b/i,
    () => {
      if (!result.profile) {
        result.profile = 'personal';
        const personalIds = context.accounts
          .filter((a) => !isBusinessAccount(a) && typeof a.id === 'number')
          .map((a) => a.id!);
        if (personalIds.length > 0) {
          personalIds.forEach((id) => matchedAccountIds.add(id));
        }
        result.chips.push({
          id: 'profile',
          kind: 'profile',
          label: 'Profile',
          valueSummary: 'Personal',
        });
      }
    }
  );

  // 7b. Account Type Groups: Credit Cards, Checking, Savings, Investments
  matchAndConsume(
    /\b(?:(?:on\s+|from\s+)?credit\s+cards?|on\s+credit|cc\s+charges|card\s+charges)\b/i,
    () => {
      const creditAccs = context.accounts.filter(
        (a) => a.type === 'credit' && typeof a.id === 'number'
      );
      if (creditAccs.length > 0) {
        creditAccs.forEach((a) => matchedAccountIds.add(a.id!));
        matchedAccountLabels.push('Credit Cards');
      }
    }
  );

  matchAndConsume(
    /\b(?:(?:on\s+|from\s+|in\s+)?checking(?:\s+accounts?)?|debit\s+cards?)\b/i,
    () => {
      const checkingAccs = context.accounts.filter(
        (a) => a.type === 'checking' && typeof a.id === 'number'
      );
      if (checkingAccs.length > 0) {
        checkingAccs.forEach((a) => matchedAccountIds.add(a.id!));
        matchedAccountLabels.push('Checking');
      }
    }
  );

  matchAndConsume(
    /\b(?:(?:on\s+|from\s+|in\s+)?savings(?:\s+accounts?)?)\b/i,
    () => {
      const savingsAccs = context.accounts.filter(
        (a) => a.type === 'savings' && typeof a.id === 'number'
      );
      if (savingsAccs.length > 0) {
        savingsAccs.forEach((a) => matchedAccountIds.add(a.id!));
        matchedAccountLabels.push('Savings');
      }
    }
  );

  matchAndConsume(
    /\b(?:(?:on\s+|from\s+|in\s+)?investments?(?:\s+accounts?)?|brokerage|retirement\s+accounts?)\b/i,
    () => {
      const invAccs = context.accounts.filter(
        (a) => a.type === 'investment' && typeof a.id === 'number'
      );
      if (invAccs.length > 0) {
        invAccs.forEach((a) => matchedAccountIds.add(a.id!));
        matchedAccountLabels.push('Investments');
      }
    }
  );

  // 7c. Specific Accounts by Institution / Name / Last4
  const institutionAliases: Array<{ pattern: RegExp; matchFn: (a: Account) => boolean; label: string }> = [
    {
      pattern: /\b(?:bank\s+of\s+america|bofa|boa)(?:\s+(\d{4}))?\b/i,
      matchFn: (a) => /bank of america|boa|adv plus|customized cash/i.test(`${a.institution} ${a.name}`),
      label: 'Bank of America',
    },
    {
      pattern: /\btruist(?:\s+(\d{4}))?\b/i,
      matchFn: (a) => /truist/i.test(`${a.institution} ${a.name}`),
      label: 'Truist',
    },
    {
      pattern: /\bchase(?:\s+(\d{4}))?\b/i,
      matchFn: (a) => /chase/i.test(`${a.institution} ${a.name}`),
      label: 'Chase',
    },
    {
      pattern: /\bfidelity(?:\s+(\d{4}))?\b/i,
      matchFn: (a) => /fidelity/i.test(`${a.institution} ${a.name}`),
      label: 'Fidelity',
    },
    {
      pattern: /\brobinhood\b/i,
      matchFn: (a) => /robinhood/i.test(`${a.institution} ${a.name}`),
      label: 'Robinhood',
    },
    {
      pattern: /\bsantander\b/i,
      matchFn: (a) => /santander/i.test(`${a.institution} ${a.name}`),
      label: 'Santander',
    },
  ];

  for (const inst of institutionAliases) {
    matchAndConsume(inst.pattern, (m) => {
      const last4Filter = m[1];
      const matching = context.accounts.filter(
        (a) =>
          typeof a.id === 'number' &&
          inst.matchFn(a) &&
          (!last4Filter || a.last4 === last4Filter || a.name.includes(last4Filter))
      );
      if (matching.length === 0) return false;
      matching.forEach((a) => matchedAccountIds.add(a.id!));
      matchedAccountLabels.push(last4Filter ? `${inst.label} (${last4Filter})` : inst.label);
    });
  }

  // Match explicit account last4 digits (e.g. "6669", "account 6669", "card 6669")
  for (const acc of context.accounts) {
    if (!acc.id || !acc.last4) continue;
    const re = new RegExp(`\\b(?:account\\s+|card\\s+|ending\\s+in\\s+)?${escapeRegex(acc.last4)}\\b`, 'i');
    matchAndConsume(re, () => {
      matchedAccountIds.add(acc.id!);
      matchedAccountLabels.push(acc.name);
    });
  }

  // Match exact account names from context.accounts
  const sortedAccounts = [...context.accounts]
    .filter((a) => typeof a.id === 'number' && a.name.trim().length >= 4)
    .sort((a, b) => b.name.length - a.name.length);
  for (const acc of sortedAccounts) {
    const re = new RegExp(`\\b${escapeRegex(acc.name.toLowerCase())}\\b`, 'i');
    matchAndConsume(re, () => {
      matchedAccountIds.add(acc.id!);
      matchedAccountLabels.push(acc.name);
    });
  }

  if (matchedAccountIds.size > 0 && !result.profile) {
    result.enabledAccountIds = Array.from(matchedAccountIds);
    result.chips.push({
      id: 'accounts',
      kind: 'account',
      label: 'Account',
      valueSummary: Array.from(new Set(matchedAccountLabels)).join(', '),
    });
  } else if (matchedAccountIds.size > 0 && result.profile) {
    result.enabledAccountIds = Array.from(matchedAccountIds);
  }

  // =========================================================================
  // 8. CATEGORIES (INCLUSION & EXCLUSION)
  // =========================================================================
  const availableCatMap = new Map<string, Category>();
  for (const c of context.categories) {
    availableCatMap.set(c.name.toLowerCase(), c);
  }

  // Build ordered phrase -> canonical Category Name pairs (longest phrases first)
  const categoryPhrases: Array<{ phrase: string; categoryName: string }> = [];
  for (const c of context.categories) {
    categoryPhrases.push({ phrase: c.name.toLowerCase(), categoryName: c.name });
    const syns = CATEGORY_SYNONYMS[c.name] || [];
    for (const s of syns) {
      categoryPhrases.push({ phrase: s.toLowerCase(), categoryName: c.name });
    }
  }
  // Also include built-in synonym mappings if category exists or fallback
  for (const [catName, syns] of Object.entries(CATEGORY_SYNONYMS)) {
    const matchingCat =
      context.categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())?.name ??
      catName;
    for (const s of syns) {
      if (!categoryPhrases.some((p) => p.phrase === s.toLowerCase())) {
        categoryPhrases.push({ phrase: s.toLowerCase(), categoryName: matchingCat });
      }
    }
  }
  categoryPhrases.sort((a, b) => b.phrase.length - a.phrase.length);

  const includedCategories = new Set<string>();
  const excludedCategories = new Set<string>();

  // First check for negated category clauses: "without mortgage and housing", "excluding rent", "no subscriptions", "except transfers"
  for (const { phrase, categoryName } of categoryPhrases) {
    const negRe = new RegExp(
      `\\b(?:without|excluding|exclude|except(?:\\s+for)?|not|no)\\s+(?:[a-z\\s,&]+?\\b(?:and|or|,)\\s+)?${escapeRegex(phrase)}\\b`,
      'i'
    );
    matchAndConsume(negRe, () => {
      excludedCategories.add(categoryName);
    });
  }

  // Now check positive category mentions
  for (const { phrase, categoryName } of categoryPhrases) {
    const posRe = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i');
    matchAndConsume(posRe, (m) => {
      // Check if preceded immediately by a negation word that already consumed or is adjacent
      const prefix = lower.slice(Math.max(0, m.index - 24), m.index);
      if (/\b(?:without|excluding|exclude|except|not|no)\s+(?:[\w\s,]+\s+(?:and|or)\s+)?$/i.test(prefix)) {
        excludedCategories.add(categoryName);
        return true;
      }
      includedCategories.add(categoryName);
    });
  }

  if (excludedCategories.size > 0) {
    result.excludedCategories = Array.from(excludedCategories);
    result.chips.push({
      id: 'cat-exclude',
      kind: 'category',
      label: 'Exclude Category',
      valueSummary: `Not ${result.excludedCategories.join(', ')}`,
    });
  }

  if (includedCategories.size > 0) {
    const incList = Array.from(includedCategories);
    result.soloCategories = incList;
    result.chips.push({
      id: 'cat-include',
      kind: 'category',
      label: incList.length === 1 ? 'Category' : 'Categories',
      valueSummary: incList.join(', '),
    });

    // If the user explicitly asked for Income or Transfers category, ensure transactionType allows it!
    if (incList.length === 1 && incList[0] === 'Income') {
      result.transactionType = 'income';
      result.spendOnly = false;
    } else if (incList.includes('Transfers')) {
      result.transactionType = 'all';
      result.spendOnly = false;
    } else if (incList.includes('Uncategorized')) {
      result.transactionType = 'all';
      result.spendOnly = false;
    }
  }

  // =========================================================================
  // 9. TRANSACTION TYPE (INCOME / SPEND / ALL)
  // =========================================================================
  matchAndConsume(
    /\b(?:income(?:\s+only)?|deposits?|inflows?|credits?|money\s+in)\b/i,
    () => {
      if (!result.transactionType) {
        result.transactionType = 'income';
        result.spendOnly = false;
        result.chips.push({
          id: 'type',
          kind: 'type',
          label: 'Type',
          valueSummary: 'Income Only',
        });
      }
    }
  );

  matchAndConsume(
    /\b(?:all\s+transactions|both\s+income\s+and\s+(?:spend|expenses)|net\s+flow|everything)\b/i,
    () => {
      if (!result.transactionType) {
        result.transactionType = 'all';
        result.spendOnly = false;
        result.chips.push({
          id: 'type',
          kind: 'type',
          label: 'Type',
          valueSummary: 'All Transactions',
        });
      }
    }
  );

  matchAndConsume(
    /\b(?:expenses?(?:\s+only)?|spend(?:ing)?(?:\s+only)?|purchases?|charges?|outflows?|debits?)\b/i,
    () => {
      if (!result.transactionType) {
        result.transactionType = 'spend';
        result.spendOnly = true;
        result.chips.push({
          id: 'type',
          kind: 'type',
          label: 'Type',
          valueSummary: 'Expenses',
        });
      }
    }
  );

  // Consume generic "transactions" / "transaction" word so it doesn't pollute merchant searchQuery
  matchAndConsume(/\btransactions?\b/i, () => {
    if (!result.viewMode) {
      result.viewMode = 'table';
    }
  });

  // =========================================================================
  // 10. EXTRACT REMAINING MERCHANT / KEYWORD QUERY
  // =========================================================================
  // Build remaining string by blanking out consumed spans
  const chars = rawQuery.split('');
  for (const span of spans) {
    for (let i = span.start; i < span.end && i < chars.length; i++) {
      chars[i] = ' ';
    }
  }

  const rawRemainder = chars
    .join('')
    .replace(/[,.;:!?()"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasAnyStructuredFilter =
    result.preset !== undefined ||
    result.customStart !== undefined ||
    result.customEnd !== undefined ||
    result.soloCategories !== undefined ||
    result.excludedCategories !== undefined ||
    result.enabledAccountIds !== undefined ||
    result.profile !== undefined ||
    result.transactionType !== undefined ||
    result.recurrenceFilter !== undefined ||
    result.minPrice !== undefined ||
    result.maxPrice !== undefined ||
    result.viewMode !== undefined ||
    result.groupBy !== undefined ||
    result.sortBy !== undefined ||
    result.forecastHorizon !== undefined ||
    result.compareWithPriorYear !== undefined ||
    result.showRunway !== undefined;

  if (hasAnyStructuredFilter) {
    // Strip filler/stop words from the remaining text
    const tokens = rawRemainder
      .split(/\s+/)
      .filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok.toLowerCase()));
    result.remainingSearchQuery = tokens.join(' ').trim();
  } else {
    // Pure keyword search (e.g. "starbucks", "home depot", "amazon")
    result.remainingSearchQuery = rawQuery;
  }

  // Special handling for transfer-like keywords ("zelle", "venmo") so they aren't hidden by spendOnly
  if (
    /\b(?:zelle|venmo)\b/i.test(result.remainingSearchQuery) &&
    !result.transactionType
  ) {
    result.transactionType = 'all';
    result.spendOnly = false;
    result.chips.push({
      id: 'type-transfer-kw',
      kind: 'type',
      label: 'Type',
      valueSummary: 'All (Includes Transfers)',
    });
  }

  result.hasStructuredIntents =
    hasAnyStructuredFilter || result.chips.length > 0;

  // If structured filters were matched and no explicit viewMode was set, default to 'table' view
  // so the user immediately sees the matching transactions (unless they asked for chart-only features).
  if (
    result.hasStructuredIntents &&
    !result.viewMode &&
    result.forecastHorizon === undefined &&
    !result.compareWithPriorYear &&
    !result.groupBy &&
    !result.showRunway
  ) {
    result.viewMode = 'table';
    result.chips.push({
      id: 'view-auto',
      kind: 'view',
      label: 'View',
      valueSummary: 'Table',
    });
  }

  if (result.hasStructuredIntents && result.remainingSearchQuery) {
    result.chips.unshift({
      id: 'keyword',
      kind: 'keyword',
      label: 'Merchant / Text',
      valueSummary: `"${result.remainingSearchQuery}"`,
    });
  }

  return result;
}
