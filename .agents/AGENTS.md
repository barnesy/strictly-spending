# Strictly Spending: AI Agent Customization Rules

These are the rules and guidelines for AI coding assistants working in this repository. 

## Architectural Philosophy & "Trip-ups"

1. **No ORM**: We do not use an ORM on the backend. We use raw `rusqlite` commands and manual queries. Do NOT introduce Prisma, TypeORM, Diesel, or any other ORM.
2. **Database Migrations**: We manage migrations manually using basic schema setup in `db.rs` or `db_extra.rs`. If you add a feature requiring persistence, ensure the table is created at startup.
3. **IPC Boundaries**: 
   - Tauri is used for IPC. Do not attempt to use `fetch` for backend calls.
   - Always update `src/api.ts` when adding a new Tauri command.
   - Ensure you register new Tauri commands in `src-tauri/src/lib.rs` (or `main.rs`) inside `tauri::Builder::default().invoke_handler(...)`.
4. **Transactions**: Use `db_mut.rs` for writes (which correctly wraps operations in a transaction for safety) and `db.rs` / `db_extra.rs` for reads.
5. **State Management**: We use `zustand` heavily. Observe how data is kept locally vs how it's saved to the SQLite database via API calls. Ensure UI state matches DB state.

## Repo Simplification Goals

If you are asked to refactor or add new files, be aware of these structural simplification goals:
- **Zustand Stores**: Place new stores in a `src/stores/` directory.
- **Domain Logic**: We are aiming to group domain-specific files (e.g., `categorize.ts`, `forecast.ts`) into a `src/domain/` or `src/core/` folder.
- **Tax Logic**: Place tax-related files in a `src/tax/` directory.
- **Backend Refactoring**: `src-tauri/src/db_extra.rs` is currently very large (~60KB). If you are adding substantial new backend logic, consider splitting it into a dedicated module instead of appending to `db_extra.rs`.
