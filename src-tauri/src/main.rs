// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let safe_mode = args.iter().any(|arg| arg == "--safe-mode" || arg == "-s");
    
    if safe_mode {
        // Disable GPU hardware acceleration and software rasterization in WebView2
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-gpu --disable-software-rasterizer");
        std::env::set_var("STRICTLY_SPENDING_SAFE_MODE", "1");
    }

    app_lib::run();
}

