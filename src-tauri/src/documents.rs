use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use base64::{Engine as _, engine::general_purpose::STANDARD};

#[tauri::command]
pub async fn save_document(app: AppHandle, bytes: Vec<u8>, filename: String) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let docs_dir = app_data_dir.join("documents");
    fs::create_dir_all(&docs_dir).map_err(|e| e.to_string())?;
    
    // Create a safe, unique filename
    let unique_filename = format!("{}_{}", chrono::Local::now().format("%Y%m%d_%H%M%S"), filename);
    let file_path = docs_dir.join(unique_filename);
    
    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
    
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn read_document_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(PathBuf::from(path)).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
pub async fn open_document(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
