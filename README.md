# Strictly Spending

> *Where is the money actually going?*

A local-first household spending dashboard. Multi-bank CSV ingestion, rule-based categorization, recurring-charge detection, per-category budgets, and a rapid-triage **Sort** view — all in the browser. **No server. No cloud. No account credentials.**

![Strictly Spending dashboard](docs/hero.png)

## What it does

- **Imports CSV exports** from Chase, Bank of America (credit + checking), and Truist. Drop a file in, or point the app at a folder and have new files auto-detected via the File System Access API. SHA-256 content hashing dedupes the same statement even if it gets re-downloaded under a different name.
- **Categorizes automatically** via a priority-ordered rule engine seeded with ~150+ common merchant patterns (NETFLIX, STARBUCKS, SHELL, …). Source CSV categories normalize through a per-bank lookup table when no rule matches.
- **Surfaces recurring charges** by detecting consistent intervals across a merchant's history (monthly, biweekly, weekly, annual). Uses the mean of the most recent 3 charges so subscription tier changes propagate within one billing cycle.
- **Projects next month** by splitting recurring (locked-in) from per-category budgets (trailing average). Toggle individual recurring charges or budget lines to simulate cuts.
- **Sort view** turns the dreaded post-import Uncategorized triage into a card-stack interaction. One decision per merchant categorizes every past *and* future transaction from that merchant. `Enter` accepts the suggested category, `1`–`9` pick from the grid, `⌘Z` undoes.
- **JSON backup & restore** for moving data between browsers or surviving a *Clear site data*. Single file, plain JSON, no encryption (store it yourself).
- **Demo mode** — a Settings toggle that hides real data and shows only `Demo:` records app-wide, useful for screenshots, demos, or share-screen calls.

## Privacy & data

Everything lives in your browser's IndexedDB. The app never makes network requests with your financial data. There is no account, no login, no telemetry. If you `Clear site data` in DevTools, your data is gone — use the JSON Backup tool on the Import page to keep a copy outside the browser sandbox.

CSV exports stay on your machine; the parsers run client-side. The watch-folder integration uses the browser's File System Access API, which holds a permission-scoped directory handle persistently in IndexedDB — re-grant once, then drops in just work.

## Stack

- **Vite** + **React 19** + **TypeScript**
- **MUI v7** + **MUI X Charts** for UI and the stacked-bar visualization
- **Dexie** wrapping IndexedDB
- **Zustand** for filter / forecast / sort session state
- **PapaParse** for CSV
- **react-resizable-panels** for the Figma-style 3-panel dashboard layout
- **Playwright** for screenshot / video automation scripts

## Quick start

```bash
npm install
npm run dev
# open http://localhost:5173
```

Then open **Settings → Load demo data → Demo mode** to explore the app without importing your real CSVs. The demo dataset spans 5 months across 3 synthetic accounts with realistic recurring + variable patterns.

## Scripts

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |

### Capture scripts (Playwright)

Optional automation under `scripts/` for capturing screenshots and a feature-walkthrough video. They drive a headless Chromium against a running dev server.

```bash
# In one terminal:
npm run dev

# In another:
node scripts/capture-screenshots.mjs     # static PNGs of key views
node scripts/capture-sort.mjs            # the populated Sort view (mutates demo data)
node scripts/record-demo.mjs             # ~40s WebM walkthrough
node scripts/reset-demo.mjs              # clears + reseeds demo data
```

Override the output directory or app URL via env vars:

```bash
SCREENSHOTS_OUT=./out STRICTLY_SPENDING_URL=http://localhost:3000 node scripts/capture-screenshots.mjs
```

### Personal merchant rules (private, not committed)

The starter pack in `src/seed.ts` is intentionally broad — many alternatives per category — so the presence of any single brand reveals nothing about who set it up.

If you want to add your own merchants in code (e.g., a specific landlord, gym, or local restaurant), copy the template:

```bash
cp src/seed.local.example.ts src/seed.local.ts
```

Edit `src/seed.local.ts` and add your rules. The file is in `.gitignore` — it stays on your machine. The build merges its `LOCAL_RULES` array into the starter pack automatically (Vite resolves the optional import at build time).

You can also add merchants through the **Sort** or **Rules** page at runtime; those are stored in IndexedDB. Use the **Backup** button on the Import page to preserve them across browsers.

### Parser tests

The CSV parser tests under `src/parsers/parsers.test.ts` need real bank exports as fixtures. They're skipped automatically when the fixtures aren't present.

To run them locally:

```bash
STRICTLY_SPENDING_FIXTURES=/path/to/bank-csvs npm test
```

Layout expected:
```
<fixtures>/Chase/Chase1060_Activity20260101_20260523_20260523.CSV
<fixtures>/BOA/stmt-5.csv
<fixtures>/BOA/stmt-6.csv
```

## Project layout

```
src/
├── pages/              Top-level route components (Dashboard, Sort, Forecast, …)
├── components/         Reusable pieces (SortCard, SpendChart, ChartTooltip, …)
├── parsers/            Per-bank CSV parsers (Chase, BoA credit, BoA checking, Truist)
├── db.ts               Dexie schema + migration
├── categorize.ts       Rule engine + merchantKey extraction
├── recurrence.ts       Recurring-charge detection
├── forecast.ts         Next-month projection (recurring + budgets)
├── sort.ts             Sort queue + smart-suggest heuristic
├── store.ts            Zustand: filters + demo mode
├── sortStore.ts        Zustand: in-session undo history
├── forecastStore.ts    Zustand: forecast exclusions
├── seed.ts             Default categories + rules
├── demoData.ts         Synthetic demo dataset (3 accounts, ~200 txns / 5mo)
├── backup.ts           JSON export / restore
├── watchFolder.ts      File System Access API integration
└── import.ts           Drop-zone preview + commit pipeline
```

## License

MIT — see [LICENSE](LICENSE).

---

Built with [Claude](https://claude.com/claude-code) as the engineering partner. The workflow is documented in the [case study](https://barnesy.me/strictly-spending.html).
