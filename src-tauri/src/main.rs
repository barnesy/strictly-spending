// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--mcp") {
        let mut custom_db_path: Option<PathBuf> = None;
        for i in 0..args.len() {
            if args[i] == "--db-path" && i + 1 < args.len() {
                custom_db_path = Some(PathBuf::from(&args[i + 1]));
            }
        }
        if let Err(e) = app_lib::mcp::run_mcp_stdio(custom_db_path) {
            eprintln!("MCP server error: {}", e);
            std::process::exit(1);
        }
        return;
    }

    let safe_mode = args.iter().any(|arg| arg == "--safe-mode" || arg == "-s");
    
    if safe_mode {
        // Disable GPU hardware acceleration and software rasterization in WebView2
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-gpu --disable-software-rasterizer");
        std::env::set_var("STRICTLY_SPENDING_SAFE_MODE", "1");
    }

    app_lib::run();
}


