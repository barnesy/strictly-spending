# Contributing to Strictly Spending

Welcome! Thank you for considering contributing to Strictly Spending.

## Architecture Overview

Strictly Spending uses a **local-first** architecture with no cloud backend. 
- **Frontend**: React 19, TypeScript, Vite, Zustand, and Material UI.
- **Backend (IPC)**: Tauri v2 (Rust) and `rusqlite` for database management.

```mermaid
graph TD
    subgraph Frontend (Vite + React + TS)
        UI[React Pages & Hooks] -->|Method Calls| API[src/api.ts Wrapper]
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

### Developing a New Feature

Features that require database persistence generally follow this path:
1. **Database Schema**: Ensure the SQLite schema supports your feature. If a new table is needed, add the initialization query to `src-tauri/src/db.rs` or `db_extra.rs`.
2. **Rust Command**: Write a new Tauri command in Rust (e.g., in `db_mut.rs` for writes, or `db_extra.rs`). Use `#[tauri::command]` and execute queries via the managed database state.
3. **Command Registration**: Register your new Rust command in `src-tauri/src/lib.rs` inside the `invoke_handler!`.
4. **API Wrapper**: Add a strongly-typed wrapper for your command in `src/api.ts`. Use `zod` schemas to validate inputs where appropriate.
5. **React Component**: Import your method from `src/api.ts` into a React component or use it within a React Query hook / Zustand store.

## Repository Structure & Simplification Opportunities

Currently, the `src/` directory is relatively flat. As the project grows, we encourage organizing files by domain.

**Future Refactoring Opportunities:**
- **State Stores**: Move Zustand stores (`store.ts`, `chatStore.ts`, `budgetStore.ts`, `sortStore.ts`, `animationStore.ts`) to a `src/stores/` folder.
- **Domain Logic**: Group domain-specific logic (`categorize.ts`, `recurrence.ts`, `forecast.ts`, `import.ts`, `ruleMiner.ts`, `watchFolder.ts`, `budgets.ts`) into a `src/domain/` or `src/core/` folder.
- **Tax Logic**: Group `taxDocumentGenerator.ts` and `taxUtils.ts` into a `src/tax/` folder.
- **Backend**: `src-tauri/src/db_extra.rs` has become large. Consider splitting it into `db_tax.rs`, `db_chat.rs`, `db_loans.rs`, etc.

## Testing

- **Unit Tests**: `npm run test` (Vitest)
- **E2E Tests**: `npx playwright test` (Runs Playwright against the compiled Tauri application via CDP on Windows).
- **TypeScript**: `npm run typecheck`

## AI Assistance
If you are using AI tools (like Claude, Cursor, or Gemini) to contribute, the AI will automatically load specific architectural rules from `.agents/AGENTS.md`. This helps the AI understand our "No ORM" philosophy and Tauri IPC boundaries.
