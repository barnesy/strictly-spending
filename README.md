# Strictly Spending

> *Where is the money actually going?*

A local-first household spending dashboard. Multi-bank CSV ingestion, rule-based categorization, recurring-charge detection, per-category budgets, and a rapid-triage **Sort** view, all in the browser. **No server. No cloud. No account credentials.**

![Strictly Spending dashboard](docs/hero.png)

## What it does

- **Imports CSV exports** from Chase, Bank of America (credit + checking), and Truist. Drop a file in, or point the app at a folder and have new files auto-detected via the File System Access API. SHA-256 content hashing dedupes the same statement even if it gets re-downloaded under a different name.
- **Categorizes automatically** via a priority-ordered rule engine seeded with ~150+ common merchant patterns (NETFLIX, STARBUCKS, SHELL, …). Source CSV categories normalize through a per-bank lookup table when no rule matches.
- **Surfaces recurring charges** by detecting consistent intervals across a merchant's history (monthly, biweekly, weekly, annual). Uses the mean of the most recent 3 charges so subscription tier changes propagate within one billing cycle.
- **Projects next month** by splitting recurring (locked-in) from per-category budgets (trailing average). Toggle individual recurring charges or budget lines to simulate cuts.
- **Sort view** turns the dreaded post-import Uncategorized triage into a card-stack interaction. One decision per merchant categorizes every past *and* future transaction from that merchant. `Enter` accepts the suggested category, `1`–`9` pick from the grid, `⌘Z` undoes.
- **JSON backup & restore** for moving data between browsers or surviving a *Clear site data*. Single file, plain JSON, no encryption (store it yourself).
- **Demo mode**: a Settings toggle that hides real data and shows only `Demo:` records app-wide, useful for screenshots, demos, or share-screen calls.

## Privacy & data

Strictly Spending is a local-first desktop application. Everything lives in a local SQLite database (`spending-viz.sqlite`) stored in your system's standard application data directory. 

The application never makes network requests with your financial data. There is no account, no login, and no telemetry. All CSV exports are parsed client-side and committed directly to the database. To back up your data or move it between machines, use the JSON Backup tool on the Import page.

---

## Architecture

Strictly Spending uses a modern, local-first hybrid architecture combining a high-performance native systems backend with a rich web frontend:

```mermaid
graph TD
    subgraph Frontend (Vite + React + TS)
        UI[React Pages & Hooks] -->|Method Calls| API[API Wrapper]
    end
    
    subgraph IPC Bridge (Tauri v2)
        API -->|Invoke Command| TAURI[Tauri Command Router]
    end
    
    subgraph Backend (Rust + SQLite)
        TAURI -->|Invokes| COMMANDS[Rust Commands]
        COMMANDS -->|Connection Pool| RUSQLITE[rusqlite Database Layer]
        RUSQLITE -->|Read / Write| SQLITE[(spending-viz.sqlite)]
    end
```

### Key Architectural Highlights:
- **Native Rust Backend**: Built on Tauri v2 and powered by Rust. All database connection pooling, transactions, migrations, and mutations are handled directly by Rust using `rusqlite` with thread-safe connection locks.
- **Thin API Wrapper**: Frontend components interact with the backend via a thin, fully-typed API wrapper (`src/api.ts`) that maps directly to Tauri IPC commands, keeping the frontend bundle extremely lightweight and entirely free of heavy ORM libraries.
- **Transactional Safety**: Database mutations (inserts, updates, bulk operations) run inside acid-compliant SQLite transactions in Rust, ensuring database consistency even under heavy loads.
- **High-Fidelity Testing**: 
  - **Unit Tests**: Run in Vitest against mock configurations or simulated API boundaries.
  - **E2E Integration Tests**: Run in Playwright using Chrome DevTools Protocol (CDP) mode to test the compiled Tauri application natively on Windows.

---

## Stack

- **Backend**: **Rust** + **Tauri v2** + **rusqlite** (SQLite)
- **Frontend**: **Vite** + **React 19** + **TypeScript**
- **UI & Styling**: **MUI v7** + **MUI X Charts** (stacked-bar visualization) + **react-resizable-panels**
- **State Management**: **Zustand** (filters, forecast, sort session state)
- **Parser**: **PapaParse** (CSV parsing)

---

## Contributing & AI Customizations

We welcome contributions! To understand how the app works, how to run tests, and our local-first architecture rules, please see our **[Contributing Guide](CONTRIBUTING.md)**. 

If you are using an AI coding assistant (like Claude, Gemini, or Cursor) to help build features, it will automatically load our workspace rules from **[.agents/AGENTS.md](.agents/AGENTS.md)**. This ensures the AI understands our "No ORM" rule and our Tauri IPC boundaries without you needing to explicitly prompt it.

---

## Quick start

To build and run the desktop application:

```bash
# Install dependencies
npm install

# Run the app in Tauri dev mode
npm run tauri dev
```

Then open **Settings → Load demo data → Demo mode** to explore the app without importing your real CSVs. The demo dataset spans 5 months across 3 synthetic accounts with realistic recurring + variable patterns.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run Vite development server |
| `npm run build` | Compile TypeScript and build production web assets |
| `npm run tsc` | Run TypeScript typechecking (`tsc --noEmit`) |
| `npm run test` | Run Vitest unit tests |
| `npx playwright test` | Run Playwright E2E tests (CDP mode on Windows) |
| `npm run tauri dev` | Run the Tauri application in developer mode |
| `npm run tauri build` | Package the Tauri application into a production installer |

---

### Personal merchant rules (private, not committed)

The starter pack in `src/seed.ts` is intentionally broad, with many alternatives per category, so the presence of any single brand reveals nothing about who set it up.

If you want to add your own merchants in code (e.g., a specific landlord, gym, or local restaurant), copy the template:

```bash
cp src/seed.local.example.ts src/seed.local.ts
```

Edit `src/seed.local.ts` and add your rules. The file is in `.gitignore`, so it stays on your machine. The build merges its `LOCAL_RULES` array into the starter pack automatically (Vite resolves the optional import at build time).

You can also add merchants through the **Sort** or **Rules** page at runtime; those are stored in SQLite. Use the **Backup** button on the Import page to preserve them across devices.

---

### Parser and E2E tests

To run the unit and integration tests:

```bash
# Run unit tests
npm run test

# Run E2E tests (requires tauri app to compile and launch)
npx playwright test
```

The CSV parser tests under `src/parsers/parsers.test.ts` need real bank exports as fixtures. They're skipped automatically when the fixtures aren't present. To run them locally:

```bash
STRICTLY_SPENDING_FIXTURES=/path/to/bank-csvs npm run test
```

---

## Project layout

```
strictly-spending/
├── src-tauri/            Native Rust backend
│   ├── Cargo.toml        Rust dependencies (tauri, rusqlite, serde)
│   └── src/
│       ├── lib.rs        App entry point, state initialization, command routing
│       ├── db.rs         rusqlite schema setup and read-only commands
│       ├── db_mut.rs     rusqlite transaction-safe mutation commands
│       └── db_extra.rs   rusqlite auxiliary tables and commands
├── src/                  React frontend
│   ├── pages/            Top-level routes (Dashboard, Sort, Forecast, Rules, …)
│   ├── components/       Reusable UI components (SortCard, SpendChart, …)
│   ├── api.ts            Tauri command invoke wrapper
│   ├── testBridge.ts     E2E test bridge for injecting mock data
│   ├── main.tsx          Frontend bootstrapper
│   ├── categorize.ts     Rule engine + merchantKey extraction
│   ├── recurrence.ts     Recurring-charge detection
│   ├── forecast.ts       Next-month projection (recurring + budgets)
│   ├── seed.ts           Default categories + rules
│   ├── demoData.ts       Synthetic demo dataset generator
│   └── backup.ts         JSON export / restore pipeline
├── e2e/                  Playwright E2E specs and setup
└── playwright.config.ts  Playwright configuration (configured for CDP mode on Windows)
```

## License

MIT. See [LICENSE](LICENSE).

---

Built with [Claude](https://claude.com/claude-code) as the engineering partner. The workflow is documented in the [case study](https://barnesy.me/strictly-spending.html).
