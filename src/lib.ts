export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatCompactUsd(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return '$0';
  const isNeg = val < 0;
  const abs = Math.abs(val);
  let str = '';
  if (abs >= 1_000_000_000) {
    str = `$${(abs / 1_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}B`;
  } else if (abs >= 1_000_000) {
    const num = abs / 1_000_000;
    str = `$${num.toLocaleString(undefined, { minimumFractionDigits: num >= 10 ? 1 : 2, maximumFractionDigits: 2 })}M`;
  } else if (abs >= 100_000) {
    str = `$${Math.round(abs / 1_000).toLocaleString()}k`;
  } else if (abs >= 10_000) {
    str = `$${(abs / 1_000).toFixed(1)}k`;
  } else if (abs >= 1_000) {
    str = `$${(abs / 1_000).toFixed(1)}k`;
  } else {
    str = `$${Math.round(abs).toLocaleString()}`;
  }
  return isNeg ? `-${str}` : str;
}

export function formatDisplayCurrency(val: number, abbreviate: boolean = true): string {
  if (val === undefined || val === null || isNaN(val)) return '$0';
  if (abbreviate) {
    return formatCompactUsd(val);
  }
  return usd.format(val);
}

export function monthKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  });
}

export function monthsBetween(start: Date, end: Date): string[] {
  const result: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    result.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    // Strip BOA ACH label prefixes ("DES:", "ID:", "INDN:", "CO ID:", "REF:") but
    // keep the value that follows — banks often encode the real merchant after
    // the colon (e.g. "PAYPAL DES:INST XFER ID:HULU INDN:..." -> "PAYPAL INST
    // XFER HULU ..."). We want rules like "HULU" to match those.
    .replace(/\bco\s+id\s*:\s*/g, ' ')
    .replace(/\b(des|id|indn|ref)\s*:\s*/g, ' ')
    // Collapse common merchant-string punctuation and separators (including underscores)
    // to whitespace so rules written one way still match descriptions written another.
    // For example "THE_HOME_DEPOT" and "THE HOME DEPOT", "WAL-MART" and "WALMART", etc.
    .replace(/[*./&\-#_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveRulePattern(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase();
  // Strip processor prefixes like "SQ *", "TST*", "SP *", "PY *"
  s = s.replace(/^[a-z]{1,3}\s*\*+/, '');
  s = s.replace(/^\s*[a-z]{2,4}\*+/i, '');
  // Normalize punctuation and underscores to spaces
  s = s.replace(/[*./&\-#_]+/g, ' ');
  // Strip dates (mm/dd, mm/dd/yyyy)
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ');
  // Strip common bank/POS verbs, channels and noise
  s = s.replace(
    /\b(mobile purchase|mobile|purchase|debit card|debit|card|withdrwl|withdrawal|pos|ach|web|ppd|tel|recurring|payment|xfer|inst xfer|des|indn|co id|ref)\b/gi,
    ' '
  );
  // Strip invoice identifiers (e.g. "inv 6175", "inv x", "inv")
  s = s.replace(/\binv\b(\s*[-0-9a-z]+)?/gi, ' ');
  // Strip random alphanumeric tokens like store/session hashes: "st m8p0d0u2g6e6", "x4n8m0nkn", "2u9z0buucayydkk"
  s = s.replace(/\b[a-z0-9]*\d[a-z0-9]*\b/gi, ' ');
  // Strip trailing US state codes
  s = s.replace(/\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b$/gi, '');
  // Strip remaining non-alphanumeric except spaces
  s = s.replace(/[^a-z0-9\s]+/g, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  // Known brand patterns that frequently have city/store prefixes or suffixes
  const KNOWN_BRANDS = [
    'the home depot',
    'home depot',
    'the ups store',
    'ups store',
    'racetrac',
    'chevron',
    'quiktrip',
    'circle k',
    'citgo',
    'shell',
    'dunkin',
    'xero',
    'amc',
    'starbucks',
    'walmart',
    'target',
    'publix',
    'kroger',
    'trader joe',
    'whole foods',
    'mcdonald',
    'chick fil a',
    'waffle house',
    'marathon',
    'valero',
    'exxon',
    'speedway',
    'costco',
    'sams club',
    'apple',
    'google',
    'amazon',
    'netflix',
    'spotify',
    'hulu',
    'disney',
    'uber',
    'lyft',
    'cvs',
    'walgreens',
    'the corner'
  ];

  for (const brand of KNOWN_BRANDS) {
    const rx = new RegExp('(^|\\s)' + brand + '(\\s|$)', 'i');
    if (rx.test(s)) {
      return brand;
    }
  }

  // Fallback: take first 2 meaningful words (length >= 2)
  const words = s.split(' ').filter(w => w.length >= 2);
  if (words.length <= 2) {
    return words.join(' ');
  }
  return words.slice(0, 2).join(' ');
}
