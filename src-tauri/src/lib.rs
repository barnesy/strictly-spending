pub mod db;
pub mod db_mut;
pub mod tools;
pub mod simplefin;
pub mod mcp;
use tauri::{Emitter, Manager};

#[tauri::command]
fn is_safe_mode() -> bool {
    std::env::var("STRICTLY_SPENDING_SAFE_MODE").is_ok()
}

#[tauri::command]
#[allow(deprecated)]
fn open_document(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app.shell().open(path, None).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init());

    #[cfg(desktop)]
    if cfg!(debug_assertions) || std::env::var("ENABLE_PLAYWRIGHT").is_ok() {
        builder = builder.plugin(tauri_plugin_playwright::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            open_document,
            is_safe_mode,
            
            // tools/
            tools::rule_miner::mine_rule_suggestions,
            tools::recurrence::build_recurrence_map,
            tools::recurrence::refresh_recurrence_all,
            tools::forecast::last_month_actual_spend,
            tools::sort_queue::get_sort_queue,
            tools::projection::calculate_projection,

            // db.rs
            db::get_transactions,
            db::get_transaction,
            db::get_accounts,
            db::get_categories,
            db::get_merchant_overrides,
            db::get_budgets,
            db::get_rules,

            // db_mut.rs
            db_mut::add_transaction,
            db_mut::bulk_add_transactions,
            db_mut::update_transaction,
            db_mut::bulk_update_transactions,
            db_mut::delete_transaction,
            db_mut::clear_transactions,
            db_mut::add_account,
            db_mut::update_account,
            db_mut::delete_account,
            db_mut::clear_accounts,
            db_mut::add_category,
            db_mut::update_category,
            db_mut::delete_category,
            db_mut::clear_categories,
            db_mut::put_merchant_override,
            db_mut::delete_merchant_override,
            db_mut::clear_merchant_overrides,
            db_mut::put_budget,
            db_mut::bulk_put_budgets,
            db_mut::clear_budgets,
            db_mut::add_rule,
            db_mut::update_rule,
            db_mut::delete_rule,
            db_mut::clear_rules,

            // db::analytics
            db::analytics::get_transactions_paginated,
            db::analytics::get_transaction_count,
            db::analytics::get_dashboard_aggregates,
            db::analytics::get_top_merchants,
            db::analytics::get_spend_chart_data,
            db::analytics::get_income_chart_data,
            db::analytics::get_consolidated_recurring_merchants,
            db::analytics::get_category_trailing_averages,
            db::analytics::get_unique_merchants,
            db::analytics::get_transaction_bounds,
            db::analytics::get_uncategorized_count,
            db::analytics::get_category_transaction_counts,
            db::analytics::get_rule_match_counts,
            db::analytics::get_merchant_groups,
            db::analytics::preview_rule_matches,
            db::analytics::recategorize_all,

            // db::imports
            db::imports::get_imports,
            db::imports::add_import,
            db::imports::delete_import,
            db::imports::clear_imports,

            // db::settings
            db::settings::get_settings,
            db::settings::get_setting,
            db::settings::put_setting,
            db::settings::delete_setting,

            // db::chat (artifacts for tax reports)
            db::chat::get_artifacts,
            db::chat::put_artifact,
            db::chat::delete_artifact,

            // db::csv_mappings
            db::csv_mappings::get_csv_mappings,
            db::csv_mappings::put_csv_mapping,
            db::csv_mappings::delete_csv_mapping,

            // db::tax
            db::tax::get_tax_rules,
            db::tax::put_tax_rule,
            db::tax::delete_tax_rule,

            // db::loans
            db::loans::get_loans,
            db::loans::add_loan,
            db::loans::put_loan,
            db::loans::update_loan,
            db::loans::delete_loan,

            // db::scenarios
            db::scenarios::get_scenarios,
            db::scenarios::create_scenario,
            db::scenarios::update_scenario,
            db::scenarios::delete_scenario,

            // simplefin.rs
            simplefin::simplefin_get_config,
            simplefin::simplefin_save_config,
            simplefin::simplefin_claim_setup_token,
            simplefin::simplefin_get_accounts,
            simplefin::simplefin_map_account,
            simplefin::simplefin_sync_transactions,
            simplefin::simplefin_remove_connection,

            // mcp.rs
            mcp::get_mcp_server_info,
        ])
        .setup(|app| {
            // Setup native database under app data directory
            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
            let db_path = app_data_dir.join("spending-viz.sqlite");

            // Seamless migration from legacy com.strictlyspending.app directory if present
            if !db_path.exists() {
                if let Some(parent) = app_data_dir.parent() {
                    let legacy_db = parent.join("com.strictlyspending.app").join("spending-viz.sqlite");
                    if legacy_db.exists() {
                        let _ = std::fs::copy(&legacy_db, &db_path);
                    }
                }
            }
            
            // Backup the database before applying migrations or initializing, keeping at most 5 backups
            if db_path.exists() {
                let backup_name = format!("spending-viz_{}.sqlite.bak", chrono::Local::now().format("%Y%m%d_%H%M%S"));
                let backup_path = app_data_dir.join(backup_name);
                let _ = std::fs::copy(&db_path, &backup_path);

                if let Ok(entries) = std::fs::read_dir(&app_data_dir) {
                    let mut backups: Vec<std::path::PathBuf> = entries
                        .flatten()
                        .map(|e| e.path())
                        .filter(|p| {
                            p.file_name()
                                .and_then(|n| n.to_str())
                                .map(|n| n.starts_with("spending-viz_") && n.ends_with(".sqlite.bak"))
                                .unwrap_or(false)
                        })
                        .collect();
                    backups.sort();
                    if backups.len() > 5 {
                        let to_remove = backups.len() - 5;
                        for old_bak in backups.into_iter().take(to_remove) {
                            let _ = std::fs::remove_file(old_bak);
                        }
                    }
                }
            }

            let conn = db::init_db(db_path).map_err(|e| e.to_string())?;
            app.manage(db::DbState {
                conn: std::sync::Mutex::new(conn),
                recurrence_cache: std::sync::Mutex::new(None),
            });

            // Watch SQLite PRAGMA data_version so external MCP mutations and UI commands automatically update the app
            let watcher_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_version: Option<i64> = None;
                let mut last_ui_cmd_id: Option<u64> = {
                    let state = watcher_handle.state::<db::DbState>();
                    let val: Option<u64> = if let Ok(guard) = state.conn.lock() {
                        guard
                            .query_row(
                                "SELECT value FROM settings WHERE key = 'mcp_ui_command'",
                                [],
                                |r| r.get::<_, String>(0),
                            )
                            .ok()
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                            .and_then(|v| v.get("id").and_then(|id| id.as_u64()))
                    } else {
                        None
                    };
                    val
                };

                loop {
                    std::thread::sleep(std::time::Duration::from_millis(750));
                    let (current_version, maybe_ui_cmd) = {
                        let state = watcher_handle.state::<db::DbState>();
                        let guard = match state.conn.lock() {
                            Ok(g) => g,
                            Err(_) => continue,
                        };
                        let ver = guard
                            .query_row("PRAGMA data_version;", [], |r| r.get::<_, i64>(0))
                            .ok();
                        let ui_cmd = if last_version.is_some() && ver != last_version {
                            guard
                                .query_row(
                                    "SELECT value FROM settings WHERE key = 'mcp_ui_command'",
                                    [],
                                    |r| r.get::<_, String>(0),
                                )
                                .ok()
                                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        } else {
                            None
                        };
                        (ver, ui_cmd)
                    };
                    if let Some(ver) = current_version {
                        if let Some(prev) = last_version {
                            if ver != prev {
                                let state = watcher_handle.state::<db::DbState>();
                                if let Ok(mut cache) = state.recurrence_cache.lock() {
                                    *cache = None;
                                }
                                if let Some(cmd) = maybe_ui_cmd {
                                    let cmd_id = cmd.get("id").and_then(|id| id.as_u64());
                                    if cmd_id.is_some() && cmd_id != last_ui_cmd_id {
                                        last_ui_cmd_id = cmd_id;
                                        let _ = watcher_handle.emit("mcp-ui-command", cmd);
                                    }
                                }
                                let _ = watcher_handle.emit("db-update", ());
                            }
                        }
                        last_version = Some(ver);
                    }
                }
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();
            let win_builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .on_new_window(move |url, _features| {
                    use tauri_plugin_shell::ShellExt;
                    #[allow(deprecated)]
                    let _ = handle.shell().open(url.as_str(), None);
                    tauri::webview::NewWindowResponse::Deny
                });

            #[cfg(desktop)]
            let win_builder = win_builder
                .title("Strictly Spending")
                .inner_size(1200.0, 800.0)
                .resizable(true);

            let _main_window = win_builder.build().map_err(|e| e.to_string())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
