export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

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
    // Collapse common merchant-string punctuation to whitespace so rules
    // written one way still match descriptions written another. For example
    // "APPLE.COM/BILL" (Chase) and "APPLE.COM BILL" (Truist via PayPal) both
    // normalize to "apple com bill". Same for "AT&T", "WAL-MART", etc.
    .replace(/[*./&\-#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
