mod ollama;
mod db;
mod db_mut;
mod ai;
mod tools;
mod documents;

use tauri::Manager;

#[tauri::command]
fn is_safe_mode() -> bool {
    std::env::var("STRICTLY_SPENDING_SAFE_MODE").is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_playwright::init())
        .invoke_handler(tauri::generate_handler![
            ollama::check_ollama_status,
            ollama::install_ollama,
            ollama::start_ollama,
            ollama::pull_ollama_model,
            ollama::delete_ollama_model,
            is_safe_mode,
            
            // ai.rs
            ai::run_copilot_chat,
            ai::run_gemini_chat,
            
            // documents.rs
            documents::save_document,
            documents::read_document_base64,
            documents::open_document,
            
            // tools/
            tools::rule_miner::mine_rule_suggestions,
            tools::recurrence::build_recurrence_map,
            tools::recurrence::refresh_recurrence_all,
            tools::forecast::build_forecast,
            tools::forecast::last_month_actual_spend,
            tools::ai_categorize::ai_categorize_transactions,
            tools::ai_query::ai_query_data,
            tools::sort_queue::get_sort_queue,

            // db.rs
            db::get_transactions,
            db::get_transaction,
            db::get_recurring_transactions,
            db::get_forecast_transactions,
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

            // db::imports
            db::imports::get_imports,
            db::imports::add_import,
            db::imports::put_import,
            db::imports::update_import,
            db::imports::delete_import,
            db::imports::clear_imports,

            // db::settings
            db::settings::get_settings,
            db::settings::add_setting,
            db::settings::put_setting,
            db::settings::update_setting,
            db::settings::delete_setting,
            db::settings::clear_settings,

            // db::chat
            db::chat::get_artifacts,
            db::chat::add_artifact,
            db::chat::put_artifact,
            db::chat::update_artifact,
            db::chat::delete_artifact,
            db::chat::clear_artifacts,
            db::chat::get_artifact_versions,
            db::chat::restore_artifact_version,
            db::chat::get_threads,
            db::chat::add_thread,
            db::chat::put_thread,
            db::chat::update_thread,
            db::chat::delete_thread,
            db::chat::delete_thread_messages,
            db::chat::clear_threads,
            db::chat::get_messages,
            db::chat::add_message,
            db::chat::put_message,
            db::chat::update_message,
            db::chat::delete_message,
            db::chat::clear_messages,

            // db::csv_mappings
            db::csv_mappings::get_csv_mappings,
            db::csv_mappings::add_csv_mapping,
            db::csv_mappings::put_csv_mapping,
            db::csv_mappings::update_csv_mapping,
            db::csv_mappings::delete_csv_mapping,
            db::csv_mappings::clear_csv_mappings,

            // db::tax
            db::tax::get_tax_rules,
            db::tax::add_tax_rule,
            db::tax::put_tax_rule,
            db::tax::update_tax_rule,
            db::tax::delete_tax_rule,
            db::tax::clear_tax_rules,

            // db::loans
            db::loans::get_loans,
            db::loans::add_loan,
            db::loans::put_loan,
            db::loans::update_loan,
            db::loans::delete_loan,
            db::loans::clear_loans,
        ])
        .setup(|app| {
            // Setup native database under app data directory
            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
            let db_path = app_data_dir.join("spending-viz.sqlite");
            
            // Backup the database before applying migrations or initializing
            if db_path.exists() {
                let backup_name = format!("spending-viz_{}.sqlite.bak", chrono::Local::now().format("%Y%m%d_%H%M%S"));
                let backup_path = app_data_dir.join(backup_name);
                let _ = std::fs::copy(&db_path, &backup_path);
            }

            let conn = db::init_db(db_path).map_err(|e| e.to_string())?;
            app.manage(db::DbState {
                conn: std::sync::Mutex::new(conn),
                recurrence_cache: std::sync::Mutex::new(None),
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
