# Strictly Spending: Architectural Manifesto

This document outlines the core architectural philosophy, patterns, and principles guiding the development of Strictly Spending. It is intended to align both human contributors and AI agents on how to build, scale, and reason about the system.

## 1. The "Agentic UI" Paradigm (Semantic APIs over RPA)
We are building a deeply integrated AI assistant, not a Robotic Process Automation (RPA) bot. 
- **No DOM Crawling:** The LLM should never be fed the DOM or an Accessibility (AX) tree to figure out how to "click" elements. Doing so causes massive context-window bloat, latency spikes, and brittle interactions.
- **Semantic Tooling:** The LLM is provided with high-level, strictly-typed functional tools (e.g., `query_data`, `update_artifact`, `navigate`). It bypasses the UI layer entirely and mutates application state directly. The UI is designed for human eyeballs; the Tools API is designed for the LLM.
- **Dynamic Routing:** Instead of overloading the LLM with every possible workflow, we use a "Semantic Router" to match user intent to specific Playbooks, injecting only the necessary context into the prompt.

## 2. Local-First and Privacy-Absolute
The user's financial data is strictly private. 
- **Local DB:** Data is stored locally in SQLite (`rusqlite`). 
- **Local AI:** The application uses local, on-device LLMs (via Ollama) by default to process transactions and generate insights.
- **No Telemetry:** We do not send financial data to external analytics or telemetry services.

## 3. Data Layer: No ORMs
We explicitly avoid Object-Relational Mappers (ORMs) like Prisma, Diesel, or TypeORM.
- **Raw SQL:** We use raw `rusqlite` commands and manual queries to retain absolute control over database execution, schema migrations, and performance.
- **Explicit Migrations:** Schema changes are handled manually in `db.rs` and `db_extra.rs` on application startup.
- **Transaction Safety:** Write operations must use `db_mut.rs` to ensure they are correctly wrapped in a database transaction, while reads can use standard DB modules.

## 4. IPC Boundaries (Tauri)
Strictly Spending is a Rust-backed Tauri application.
- **No Frontend Fetch:** The React frontend must never attempt to perform direct network `fetch` calls to an external backend API for its own core data. 
- **Tauri Commands:** All frontend-to-backend communication flows through `src/api.ts` which invokes `#[tauri::command]` functions in Rust.
- **Registration:** Any new backend feature requires a corresponding Tauri command registered in `src-tauri/src/lib.rs` (or `main.rs`) via `tauri::Builder::default().invoke_handler(...)`.

## 5. State Management & Reactivity
The UI should be a pure, reactive reflection of the database state.
- **Zustand & TanStack Query:** We use Zustand for ephemeral UI state (like `filters`, `chatStore`) and TanStack Query (`queryClient`) for async database state.
- **Mutation Sync:** When a Tauri command mutates data (either driven by the user or the AI), we must explicitly invalidate the relevant TanStack Query keys to trigger a UI re-render, ensuring the frontend never falls out of sync with SQLite.

## 6. Context Window Discipline
AI context is our most scarce and precious resource.
- **Targeted State:** We only inject the minimal required metadata into the `stateContext` (e.g., Current Date, Active Filters, Active Page, Artifact Summaries). 
- **Tool Fallbacks:** If the LLM needs more information (like the *content* of an artifact or a specific transaction), it must actively fetch it via a tool, rather than having it dumped preemptively into the prompt.
- **Strict Typing and Generative UI:** We prioritize strong typing in our tool schemas. If the LLM lacks the required information to satisfy a strict type (e.g., a specific `taxYear` number or an enum), it must NOT guess or be given a loose type (like `string`). Instead, it should use Generative UI tools (like `request_user_choice` or `request_user_form`) to explicitly ask the user for the missing information before proceeding.

## 7. UI/UX & Theming
The visual language must remain consistent, professional, and deeply integrated.
- **Strict Theme Adherence:** Always use established theme values (e.g., CSS variables or design system tokens) for corner radii on inputs, paper components, and containers. Avoid hardcoding ad-hoc pixel values for borders or spacing.
- **Light & Dark Mode:** All components must be built to natively support both light and dark mode through dynamic theme tokens.
- **Iconography Restraint:** Do not use icons by default. Rely on typography, spacing, and layout to convey hierarchy unless an icon is strictly necessary for navigation or state indication.
- **No AI Tropes:** Never use "sparkle" or "magic wand" icons to denote AI or automation. The AI should feel like a native, fundamental piece of the application's engine, not a bolted-on gimmick.

## 8. Context Engineering & Playbooks
Playbooks are the backbone of our complex agentic workflows. They act as dynamic recipes injected into the system prompt by the Semantic Router, guiding the LLM step-by-step through a specific task.
- **Strict Tooling Mapping:** A playbook's steps must **only** instruct the LLM to call tools that are explicitly defined in the LLM's tool schema (`architecture.ts`). Playbooks must never reference internal codebase functions (e.g., frontend API calls like `getSettings` or `getTransactions`) unless those functions have been explicitly wrapped and exposed as LLM tools. Doing so will "gaslight" the LLM and cause it to hallucinate or freeze.
- **When to Use Playbooks:** Use playbooks for multi-step goals where the LLM might struggle to infer the correct sequence of tools on its own (e.g., End-of-Month Review, Subscription Auditing, Generating Tax Documents).
- **How to Create Playbooks:** Define new playbooks in the `API_WORKFLOWS` array in `apiWorkflows.ts`. Ensure each step's `endpoint` matches the exact `name` of a registered tool. Write clear, semantic descriptions for each step to explain *why* the tool is being called in that phase of the workflow.

---
*“A system’s architecture is defined as much by what it explicitly forbids as by what it enables.”*
