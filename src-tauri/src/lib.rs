mod ollama;
mod migrations;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_playwright::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:spending-viz.sqlite", migrations::get_migrations())
                .build()
        )
        .invoke_handler(tauri::generate_handler![
            ollama::check_ollama_status,
            ollama::install_ollama,
            ollama::start_ollama,
        ])
        .setup(|app| {
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
