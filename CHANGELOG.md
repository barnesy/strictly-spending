# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-07-02
### Added
- **Forecast Charts**: Separated chart rendering logic into its own reusable `ForecastCharts` component for better code modularity.
- **Goals Tracking**: Proper typings implemented for savings and loan goals inside Scenarios.

### Changed
- **Forecast State Management**: Replaced over 15 local component states with a single `useForecastStore` powered by Zustand.
- **Backend Refactoring**: Deduplicated database row mapping logic inside `db.rs` by extracting a `row_to_transaction` helper, saving over 80 lines of boilerplate.
- **Manage Scenarios AI Tool**: Standardized the IPC boundaries and data types (`ManageScenariosAction`) to work smoothly with the new Zustand store instead of relying on custom DOM events.
- **Build Configurations**: Updated to strictly enforce `verbatimModuleSyntax` inside `tsconfig.json`.

### Fixed
- Addressed duplicate variable scope issues in the Forecast UI module.
- Cleaned up several TypeScript type warnings (e.g., proper usage of `import type`).
