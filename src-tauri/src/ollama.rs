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
        let mut cmd = std::process::Command::new("where");
        cmd.arg("ollama");
        
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .stdin(std::process::Stdio::null())
            .output()
            .map(|s| s.status.success())
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
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .stdin(std::process::Stdio::null())
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
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .stdin(std::process::Stdio::null())
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
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let app_data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
            
            let zip_path = app_data.join("ollama.zip");
            
            // Try downloading with curl.exe first (faster, natively handles redirects and large files without memory buffering)
            let mut downloaded = false;
            let mut curl_cmd = std::process::Command::new("curl.exe");
            curl_cmd
                .arg("-L")
                .arg("-o")
                .arg(&zip_path)
                .arg("https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .stdin(std::process::Stdio::null())
                .creation_flags(CREATE_NO_WINDOW);

            if let Ok(status) = curl_cmd.status() {
                if status.success() {
                    downloaded = true;
                }
            }

            if !downloaded {
                // Fallback to powershell WebClient
                let mut ps_cmd = std::process::Command::new("powershell");
                ps_cmd
                    .arg("-Command")
                    .arg(format!(
                        "[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12; \
                         (New-Object System.Net.WebClient).DownloadFile('https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip', '{}')",
                        zip_path.to_string_lossy()
                    ))
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .stdin(std::process::Stdio::null())
                    .creation_flags(CREATE_NO_WINDOW);

                let status = ps_cmd.status().map_err(|e| e.to_string())?;
                if !status.success() {
                    return Err("Failed to download Ollama package via both curl.exe and PowerShell".to_string());
                }
            }
            
            // Try extracting with tar.exe first (native, extremely fast, low memory overhead)
            let mut extracted = false;
            let mut tar_cmd = std::process::Command::new("tar.exe");
            tar_cmd
                .arg("-x")
                .arg("-f")
                .arg(&zip_path)
                .arg("-C")
                .arg(&app_data)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .stdin(std::process::Stdio::null())
                .creation_flags(CREATE_NO_WINDOW);

            if let Ok(status) = tar_cmd.status() {
                if status.success() {
                    extracted = true;
                }
            }

            if !extracted {
                // Fallback to powershell Expand-Archive
                let mut ps_extract_cmd = std::process::Command::new("powershell");
                ps_extract_cmd
                    .arg("-Command")
                    .arg(format!(
                        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                        zip_path.to_string_lossy(),
                        app_data.to_string_lossy()
                    ))
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .stdin(std::process::Stdio::null())
                    .creation_flags(CREATE_NO_WINDOW);

                let status = ps_extract_cmd.status().map_err(|e| e.to_string())?;
                if !status.success() {
                    return Err("Failed to extract Ollama zip package via both tar.exe and PowerShell".to_string());
                }
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
            // Write a VBScript wrapper to the temp directory to completely hide 
            // the console windows of both `ollama serve` and its grandchild `llama-server.exe`
            let vbs_path = std::env::temp_dir().join("start_ollama.vbs");
            let vbs_content = "Set WshShell = CreateObject(\"WScript.Shell\")\nWshShell.Run \"cmd.exe /c \"\"\" & WScript.Arguments(0) & \"\"\" serve\", 0, False\n";
            let _ = std::fs::write(&vbs_path, vbs_content);

            let mut cmd = std::process::Command::new("wscript.exe");
            cmd.arg(vbs_path);
            cmd.arg(&target_exe);
            
            let _child = cmd
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .stdin(std::process::Stdio::null())
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

#[derive(serde::Serialize, Clone)]
pub struct PullProgress {
    pub pct: f64,
    pub status: String,
}

#[derive(serde::Deserialize)]
struct OllamaPullResponse {
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
}

#[tauri::command]
pub async fn pull_ollama_model(app: tauri::AppHandle, name: String) -> Result<(), String> {
    use futures_util::StreamExt;
    use tauri::Emitter;
    
    let client = reqwest::Client::new();
    let res = client.post("http://127.0.0.1:11434/api/pull")
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if let Ok(bytes) = chunk {
            // Split by newline since Ollama sends NDJSON
            let s = String::from_utf8_lossy(&bytes);
            for line in s.lines() {
                if let Ok(msg) = serde_json::from_str::<OllamaPullResponse>(line) {
                    let mut pct = 0.0;
                    if let (Some(completed), Some(total)) = (msg.completed, msg.total) {
                        if total > 0 {
                            pct = (completed as f64 / total as f64) * 100.0;
                        }
                    }
                    
                    let _ = app.emit("ollama_pull_progress", PullProgress {
                        pct,
                        status: msg.status,
                    });
                }
            }
        }
    }
    
    let _ = app.emit("ollama_pull_progress", PullProgress {
        pct: 100.0,
        status: "success".to_string(),
    });
    
    Ok(())
}

#[tauri::command]
pub async fn delete_ollama_model(name: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res = client.delete("http://127.0.0.1:11434/api/delete")
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to delete model: {}", res.status()))
    }
}
