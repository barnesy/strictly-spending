// Optional personal seed rules.
//
// HOW TO USE
//   1. Copy this file to `src/seed.local.ts` (same directory, drop the `.example`).
//   2. Add your own merchant rules below.
//   3. Run `npm run dev`. The rules merge in automatically.
//
// PRIVACY
//   `src/seed.local.ts` is in .gitignore. It will NOT be committed to git,
//   so your personal merchants stay on your machine. Only this `.example`
//   file is checked in. The default starter pack in `seed.ts` is a wide
//   generic US-household list. Nothing in it implies personal usage.
//
// FORMAT
//   Same shape as the rules in `seed.ts`. Each rule has:
//     - pattern:   case-insensitive substring to match against the
//                  transaction description (or normalized merchantKey).
//     - category:  one of the category names from DEFAULT_CATEGORIES in
//                  seed.ts (or a custom name you've created in the app).
//     - priority:  higher beats lower when multiple patterns match.
//                  Use 100+ to override a generic seed rule, 1000+ if
//                  this is a hard manual override.
//
// PATTERN TIPS
//   Patterns use a substring (case-insensitive) match against both the raw
//   description AND the normalized `merchantKey`. So "STARBUCKS" matches
//   both "SQ *STARBUCKS BROOKLYN NY 05/27" and the normalized "starbucks".
//   Punctuation, dates, and 4+ digit runs are stripped before matching
//   (see `extractMerchantKey` in src/categorize.ts), so prefer the bare
//   merchant name without store IDs.

import type { CategoryRule } from './types';

type StarterRule = Omit<CategoryRule, 'id' | 'createdAt'>;

export const LOCAL_RULES: StarterRule[] = [
  // Example. Uncomment and edit:
  // { pattern: 'YOUR LANDLORD NAME', category: 'Housing', priority: 100 },
  // { pattern: 'YOUR GYM', category: 'Health', priority: 100 },
  // { pattern: 'FAVORITE COFFEE SHOP', category: 'Restaurants & Coffee', priority: 100 },
];
