mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_sidecar_health,
            commands::get_app_version,
            commands::start_sidecar,
            commands::stop_sidecar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running nextcut");
}
