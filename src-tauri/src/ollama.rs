use std::path::PathBuf;
use std::net::TcpStream;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
pub struct OllamaStatus {
    installed: bool,
    running: bool,
}

fn get_ollama_app_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_local_data_dir().unwrap_or_default();
    path.push("Ollama.app");
    path
}

fn is_running() -> bool {
    // Ping TCP port 11434 to check if Ollama is running
    TcpStream::connect_timeout(
        &"127.0.0.1:11434".parse().unwrap(),
        Duration::from_millis(200),
    ).is_ok()
}

fn is_installed(app: &AppHandle) -> bool {
    get_ollama_app_path(app).exists() || std::path::Path::new("/Applications/Ollama.app").exists()
}

#[tauri::command]
pub async fn check_ollama_status(app: AppHandle) -> Result<OllamaStatus, String> {
    Ok(OllamaStatus {
        installed: is_installed(&app),
        running: is_running(),
    })
}

#[tauri::command]
pub async fn install_ollama(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let app_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
        
        let zip_path = app_data.join("ollama.zip");
        
        // Download using system curl
        let status = std::process::Command::new("curl")
            .arg("-L")
            .arg("-o")
            .arg(&zip_path)
            .arg("https://ollama.com/download/Ollama-darwin.zip")
            .status()
            .map_err(|e| e.to_string())?;
            
        if !status.success() {
            return Err("Failed to download Ollama package via curl".into());
        }
        
        // Extract using system unzip
        let status = std::process::Command::new("unzip")
            .arg("-o")
            .arg(&zip_path)
            .arg("-d")
            .arg(&app_data)
            .status()
            .map_err(|e| e.to_string())?;
            
        if !status.success() {
            return Err("Failed to extract Ollama zip package".into());
        }
        
        // Clean up the ZIP file
        let _ = std::fs::remove_file(zip_path);
        
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Automatic installation is currently only supported on macOS. Please download Ollama manually from ollama.com".into())
    }
}

#[tauri::command]
pub async fn start_ollama(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let global_app = std::path::Path::new("/Applications/Ollama.app");
        let local_app = get_ollama_app_path(&app);
        
        let target_app = if global_app.exists() {
            global_app
        } else if local_app.exists() {
            &local_app
        } else {
            return Err("Ollama is not installed".into());
        };
        
        // Run open command on Ollama.app (runs it in tray/background natively)
        let status = std::process::Command::new("open")
            .arg(target_app)
            .status()
            .map_err(|e| e.to_string())?;
            
        if !status.success() {
            return Err("Failed to launch Ollama.app".into());
        }
        
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Starting Ollama is currently only supported on macOS. Please start it manually.".into())
    }
}
