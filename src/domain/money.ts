/**
 * Exact integer-cents financial math utilities (`MoneyCents`).
 *
 * SQLite and JavaScript represent currency amounts as IEEE-754 floating-point numbers,
 * which can accumulate rounding drift (`0.1 + 0.2 === 0.30000000000000004`).
 * These helpers convert dollar floats to integer cents for exact addition/subtraction
 * and convert back to 2-decimal dollar amounts at display/storage boundaries.
 */

export type Cents = number;

/** Convert a dollar amount (e.g. `12.34`) to integer cents (`1234`). */
export function toCents(dollars: number | null | undefined): Cents {
  if (dollars === null || dollars === undefined || !Number.isFinite(dollars)) {
    return 0;
  }
  return Math.round(dollars * 100);
}

/** Convert integer cents (`1234`) back to a 2-decimal dollar float (`12.34`). */
export function fromCents(cents: Cents): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

/** Round any floating-point dollar amount to exact 2-decimal cents (`12.345 -> 12.35`). */
export function roundDollars(dollars: number | null | undefined): number {
  return fromCents(toCents(dollars));
}

/** Sum an array or iterable of dollar amounts using exact integer-cents accumulation. */
export function sumDollars(values: Iterable<number | null | undefined>): number {
  let totalCents = 0;
  for (const val of values) {
    totalCents += toCents(val);
  }
  return fromCents(totalCents);
}

/** Add two dollar amounts using exact integer-cents arithmetic. */
export function addDollars(a: number | null | undefined, b: number | null | undefined): number {
  return fromCents(toCents(a) + toCents(b));
}

/** Subtract `b` from `a` (`a - b`) using exact integer-cents arithmetic. */
export function subDollars(a: number | null | undefined, b: number | null | undefined): number {
  return fromCents(toCents(a) - toCents(b));
}
