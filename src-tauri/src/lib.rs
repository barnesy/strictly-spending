mod ollama;
mod db;
mod db_extra;
mod db_mut;
mod ai;
mod tools;

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
            is_safe_mode,
            
            // ai.rs
            ai::run_copilot_chat,
            
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

            // db_extra.rs
            db_extra::get_transactions_paginated,
            db_extra::get_transaction_count,
            db_extra::get_dashboard_aggregates,
            db_extra::get_top_merchants,
            db_extra::get_spend_chart_data,
            db_extra::get_income_chart_data,
            db_extra::get_consolidated_recurring_merchants,
            db_extra::get_category_trailing_averages,
            db_extra::get_unique_merchants,
            db_extra::get_transaction_bounds,
            db_extra::get_uncategorized_count,
            db_extra::get_category_transaction_counts,
            db_extra::get_rule_match_counts,
            db_extra::get_merchant_groups,
            db_extra::get_imports,
            db_extra::add_import,
            db_extra::put_import,
            db_extra::update_import,
            db_extra::delete_import,
            db_extra::clear_imports,
            db_extra::get_settings,
            db_extra::add_setting,
            db_extra::put_setting,
            db_extra::update_setting,
            db_extra::delete_setting,
            db_extra::clear_settings,
            db_extra::get_artifacts,
            db_extra::add_artifact,
            db_extra::put_artifact,
            db_extra::update_artifact,
            db_extra::delete_artifact,
            db_extra::clear_artifacts,
            db_extra::get_threads,
            db_extra::add_thread,
            db_extra::put_thread,
            db_extra::update_thread,
            db_extra::delete_thread,
            db_extra::delete_thread_messages,
            db_extra::clear_threads,
            db_extra::get_messages,
            db_extra::add_message,
            db_extra::put_message,
            db_extra::update_message,
            db_extra::delete_message,
            db_extra::clear_messages,
            db_extra::get_csv_mappings,
            db_extra::add_csv_mapping,
            db_extra::put_csv_mapping,
            db_extra::update_csv_mapping,
            db_extra::delete_csv_mapping,
            db_extra::clear_csv_mappings,
            db_extra::get_documents,
            db_extra::add_document,
            db_extra::put_document,
            db_extra::update_document,
            db_extra::delete_document,
            db_extra::clear_documents,
            db_extra::get_document_contents,
            db_extra::add_document_content,
            db_extra::put_document_content,
            db_extra::update_document_content,
            db_extra::delete_document_content,
            db_extra::clear_document_contents,
            db_extra::get_tax_rules,
            db_extra::add_tax_rule,
            db_extra::put_tax_rule,
            db_extra::update_tax_rule,
            db_extra::delete_tax_rule,
            db_extra::clear_tax_rules,
            db_extra::get_loans,
            db_extra::add_loan,
            db_extra::put_loan,
            db_extra::update_loan,
            db_extra::delete_loan,
            db_extra::clear_loans,
        ])
        .setup(|app| {
            // Setup native database under app data directory
            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
            let db_path = app_data_dir.join("spending-viz.sqlite");
            
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
