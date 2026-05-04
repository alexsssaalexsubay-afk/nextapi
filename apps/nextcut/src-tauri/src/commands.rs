use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

#[derive(Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub message: String,
}

pub struct SidecarState(pub Mutex<Option<u32>>);

#[tauri::command]
pub async fn check_sidecar_health() -> Result<HealthResponse, String> {
    match reqwest::get("http://localhost:8765/health").await {
        Ok(resp) if resp.status().is_success() => Ok(HealthResponse {
            ok: true,
            message: "Sidecar is running".to_string(),
        }),
        Ok(resp) => Ok(HealthResponse {
            ok: false,
            message: format!("Sidecar returned {}", resp.status()),
        }),
        Err(e) => Ok(HealthResponse {
            ok: false,
            message: format!("Cannot reach sidecar: {}", e),
        }),
    }
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn start_sidecar(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    let sidecar = app
        .shell()
        .sidecar("nextcut-sidecar")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

    let (mut _rx, _child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    Ok("Sidecar started".to_string())
}

#[tauri::command]
pub async fn stop_sidecar() -> Result<String, String> {
    match reqwest::Client::new()
        .post("http://localhost:8765/shutdown")
        .send()
        .await
    {
        Ok(_) => Ok("Shutdown signal sent".to_string()),
        Err(_) => Ok("Sidecar may already be stopped".to_string()),
    }
}
