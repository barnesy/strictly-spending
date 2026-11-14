const NOISE_WORDS = new Set([
  'ach',
  'pos',
  'checkcard',
  'card',
  'visa',
  'debit',
  'credit',
  'pmt',
  'pymt',
  'paymnt',
  'payment',
  'autopay',
  'auto',
  'recurring',
  'bill',
  'billpay',
  'online',
  'purchase',
  'web',
  'ppd',
  'ccd',
  'tel',
  'des',
  'indn',
  'id',
  'coid',
  'inc',
  'llc',
  'corp',
  'co',
  'com',
  'net',
  'org',
  'us',
  'usa',
  'www',
  'http',
  'https',
  'the',
  'and',
  'payroll',
  'direct',
  'dep',
  'deposit',
  'ca',
  'ga',
  'ny',
  'tx',
  'fl',
  'va',
  'nc',
  'mountain',
  'view',
  'viewca',
  'decatur',
  'atlanta',
  'barnes',
  'christopher',
  'chris',
  'daniel',
  'barneschristo',
  'prem',
  'coll',
  'ins',
  'loan',
  'inst',
  'xfer',
  'syf',
  'paypalsi77',
  'wwp',
  'iclub',
  'fees',
]);

export const NON_BILL_RETAIL_CANON_REGEX =
  /\b(home depot|lowe s|lowes|ace hardware|harbor freight|ikea|target|walmart|costco|sam s club|kroger|publix|whole foods|trader joe|aldi|savi provisions|chevron|shell|exxon|bp|qt|quiktrip|racetrac|wawa)\b/i;

export function getPriorYearMonth(monthKey: string): string {
  if (!monthKey || !monthKey.includes('-')) return '';
  const [year, month] = monthKey.split('-').map(Number);
  if (isNaN(year) || isNaN(month)) return '';
  return `${year - 1}-${String(month).padStart(2, '0')}`;
}

export function generateFutureMonths(lastMonthStr: string, count: number): string[] {
  if (!lastMonthStr || count <= 0) return [];
  let [year, month] = lastMonthStr.split('-').map(Number);
  const futureList: string[] = [];
  for (let i = 0; i < count; i++) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    futureList.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return futureList;
}

/**
 * Normalizes a raw merchant key or transaction description into a canonical brand/merchant stem
 * so variations like "VERIZON WIRELESS 09/14" and "VZWRLSS*APOCC", or "google_workspace_ca_recurring"
 * and "google workspace", or "GOOGLE *FI TP6 Mountain View" and "GOOGLE *FI 4xH Mountain View" unify cleanly.
 */
export function normalizeTimelineMerchantKey(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();

  // Strip common payment processor prefixes
  s = s.replace(/^(sq\s*\*|tst\s*\*|sp\s*\*|dd\s*\*|pp\s*\*|wwp\s*\*|ach\s+|pos\s+)/i, '');
  // Strip ACH metadata fields like DES:..., INDN:..., ID:..., CO ID:...
  s = s.replace(/\b(des|indn|id|co\s*id|pmt\s*info):[^\s]*/gi, ' ');
  // Strip dates like 09/14 or 2026-10-15
  s = s.replace(/\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?\b/g, ' ');
  // Replace non-alphanumeric (including underscores) with spaces
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  // Remove masked digits or pure digit tokens
  s = s.replace(/\b[x*]*\d+[a-z0-9]*\b/g, ' ');

  const rawTokens = s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !NOISE_WORDS.has(t));

  // Deduplicate consecutive identical tokens (e.g. "google google" -> "google")
  const dedupedTokens: string[] = [];
  for (const t of rawTokens) {
    if (dedupedTokens[dedupedTokens.length - 1] !== t) {
      dedupedTokens.push(t);
    }
  }

  // If PayPal wraps a known underlying merchant (e.g. "paypal spotify ...", "paypal github ...", "paypal ouraring ..."), drop leading "paypal"
  if (dedupedTokens.length >= 2 && dedupedTokens[0] === 'paypal') {
    dedupedTokens.shift();
  }
  // Remove trailing "paypal" if still present
  while (dedupedTokens.length > 1 && dedupedTokens[dedupedTokens.length - 1] === 'paypal') {
    dedupedTokens.pop();
  }

  const joined = dedupedTokens.slice(0, 3).join(' ');

  // Canonical brand aliases for common utility/telecom/mortgage/subscription variations
  if (/^(vzwrlss|verizon)/.test(joined)) return 'verizon';
  if (/^(att|at\s+t)\b/.test(joined)) return 'att';
  if (/^(comcast|xfinity)/.test(joined)) return 'xfinity';
  if (/^(tmobile|t\s+mobile)/.test(joined)) return 'tmobile';
  if (/^netflix/.test(joined)) return 'netflix';
  if (/^spotify/.test(joined)) return 'spotify';
  if (/^github\b/.test(joined)) return 'github';
  if (/^duke\s+energy/.test(joined)) return 'duke energy';
  if (/^dominion\s+energy/.test(joined)) return 'dominion energy';
  if (/^(newrez|shellpoint)/.test(joined)) return 'shellpoint mortgage';
  if (/^rocket\s+mortgage\b/.test(joined)) return 'rocket mortgage';
  if (/^santander\b/.test(joined)) return 'santander';
  if (/^geico\b/.test(joined)) return 'geico';
  if (/^homesite\b/.test(joined)) return 'homesite';
  if (/^home\s+depot\b/.test(joined)) return 'home depot';
  if (/^(us\s+)?(department|dept)\b.*?\b(ed|education)\b/.test(joined) || /\b(department|dept)\s+of\s+ed(ucation)?\b/.test(s)) {
    return 'us department of';
  }
  if (/^google\s+fi\b/.test(joined)) return 'google fi';
  if (/^google\s+(store|st)\b/.test(joined)) return 'google store';
  if (/^google\s+worksp(ace)?\b/.test(joined)) return 'google workspace';
  if (/^google\s+services\b/.test(joined)) return 'google services';
  if (/^google$/.test(joined)) return 'google';
  if (/^planet\s+fitness\b/.test(joined)) return 'planet fitness';
  if (/^la\s+fitness\b/.test(joined)) return 'la fitness';

  return joined || raw.toLowerCase().trim().slice(0, 24);
}

/**
 * Formats a raw merchant key or description into a clean human-readable display name.
 */
export function formatCleanMerchantName(raw: string): string {
  if (!raw) return 'Recurring Charge';
  const canon = normalizeTimelineMerchantKey(raw);
  const brandMap: Record<string, string> = {
    verizon: 'Verizon Wireless',
    att: 'AT&T',
    xfinity: 'Xfinity / Comcast',
    tmobile: 'T-Mobile',
    netflix: 'Netflix',
    spotify: 'Spotify',
    github: 'GitHub',
    'duke energy': 'Duke Energy',
    'dominion energy': 'Dominion Energy',
    'shellpoint mortgage': 'Shellpoint Mortgage',
    'rocket mortgage': 'Rocket Mortgage',
    santander: 'Santander',
    geico: 'Geico',
    homesite: 'Homesite',
    'home depot': 'The Home Depot',
    'google fi': 'Google Fi',
    'google store': 'Google Store',
    'google workspace': 'Google Workspace',
    'google services': 'Google Services',
    google: 'Google',
    'georgia power': 'Georgia Power',
    'dekalb county': 'Dekalb County',
    'gas south': 'Gas South',
    'state farm': 'State Farm',
    'us department of': 'US Dept. of Education',
    'arrow exterminator': 'Arrow Exterminators',
    godaddy: 'GoDaddy',
    audible: 'Audible',
  };
  if (brandMap[canon]) return brandMap[canon];

  const cleaned = raw
    .replace(/\b(des|indn|id|co\s*id|pmt\s*info):[^\s]*/gi, '')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/[*_#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const source = cleaned.length >= 2 ? cleaned : canon;
  return source
    .split(' ')
    .slice(0, 4)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}
