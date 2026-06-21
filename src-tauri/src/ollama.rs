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
    #[cfg(target_os = "windows")]
    {
        path.push("ollama.exe");
    }
    #[cfg(not(target_os = "windows"))]
    {
        path.push("Ollama.app");
    }
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
    #[cfg(target_os = "macos")]
    {
        get_ollama_app_path(app).exists() || std::path::Path::new("/Applications/Ollama.app").exists()
    }
    #[cfg(target_os = "windows")]
    {
        // On Windows, check local app data path first
        let local_exe = get_ollama_app_path(app);
        if local_exe.exists() {
            return true;
        }
        
        // Also check default program files / AppData Program locations
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        if !local_appdata.is_empty() {
            let user_prog = std::path::Path::new(&local_appdata).join("Programs").join("Ollama").join("ollama.exe");
            if user_prog.exists() {
                return true;
            }
        }
        
        let prog_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let system_prog = std::path::Path::new(&prog_files).join("Ollama").join("ollama.exe");
        if system_prog.exists() {
            return true;
        }
        
        // Check if ollama is on system PATH
        std::process::Command::new("where")
            .arg("ollama")
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
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
        tauri::async_runtime::spawn_blocking(move || {
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
                return Err("Failed to download Ollama package via curl".to_string());
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
                return Err("Failed to extract Ollama zip package".to_string());
            }
            
            // Clean up the ZIP file
            let _ = std::fs::remove_file(zip_path);
            
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let app_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
            
            let zip_path = app_data.join("ollama.zip");
            
            // Download using powershell Invoke-WebRequest
            let status = std::process::Command::new("powershell")
                .arg("-Command")
                .arg(format!(
                    "Invoke-WebRequest -Uri 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip' -OutFile '{}'",
                    zip_path.to_string_lossy()
                ))
                .status()
                .map_err(|e| e.to_string())?;
                
            if !status.success() {
                return Err("Failed to download Ollama package via PowerShell".to_string());
            }
            
            // Extract using powershell Expand-Archive
            let status = std::process::Command::new("powershell")
                .arg("-Command")
                .arg(format!(
                    "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                    zip_path.to_string_lossy(),
                    app_data.to_string_lossy()
                ))
                .status()
                .map_err(|e| e.to_string())?;
                
            if !status.success() {
                return Err("Failed to extract Ollama zip package".to_string());
            }
            
            // Clean up the ZIP file
            let _ = std::fs::remove_file(zip_path);
            
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Automatic installation is currently only supported on macOS and Windows. Please download Ollama manually from ollama.com".into())
    }
}

#[tauri::command]
pub async fn start_ollama(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let global_app = std::path::Path::new("/Applications/Ollama.app").to_path_buf();
        let local_app = get_ollama_app_path(&app);
        
        let target_app = if global_app.exists() {
            global_app
        } else if local_app.exists() {
            local_app
        } else {
            return Err("Ollama is not installed".into());
        };
        
        // Run open command on Ollama.app (runs it in tray/background natively)
        tauri::async_runtime::spawn_blocking(move || {
            let status = std::process::Command::new("open")
                .arg(target_app)
                .status()
                .map_err(|e| e.to_string())?;
                
            if !status.success() {
                return Err("Failed to launch Ollama.app".to_string());
            }
            
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(target_os = "windows")]
    {
        // Find executable location
        let local_exe = get_ollama_app_path(&app);
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let user_prog = if !local_appdata.is_empty() {
            std::path::Path::new(&local_appdata).join("Programs").join("Ollama").join("ollama.exe")
        } else {
            PathBuf::new()
        };
        let prog_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let system_prog = std::path::Path::new(&prog_files).join("Ollama").join("ollama.exe");
        
        let target_exe = if local_exe.exists() {
            local_exe
        } else if user_prog.exists() {
            user_prog
        } else if system_prog.exists() {
            system_prog
        } else {
            // Check system path by running 'where' or fallback to "ollama" command
            PathBuf::from("ollama")
        };
        
        tauri::async_runtime::spawn_blocking(move || {
            let mut cmd = std::process::Command::new(&target_exe);
            
            if target_exe.to_string_lossy() == "ollama" || target_exe.file_name().unwrap_or_default() == "ollama.exe" {
                if target_exe.exists() && target_exe.parent().map_or(false, |p| {
                    let p_str = p.to_string_lossy().to_lowercase();
                    p_str.contains("programs\\ollama") || p_str.contains("program files\\ollama")
                }) {
                    // Start the tray app directly
                } else {
                    cmd.arg("serve");
                }
            }
            
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const DETACHED_PROCESS: u32 = 0x00000008;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW);
            }
            
            let _child = cmd
                .spawn()
                .map_err(|e| e.to_string())?;
                
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Starting Ollama is currently only supported on macOS and Windows. Please start it manually.".into())
    }
}
