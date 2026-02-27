// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod commands;
use std::sync::Arc;
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = commands::AppState(Arc::new(RwLock::new(commands::AwsState::default())));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::list_profiles,
            commands::authenticate,
            commands::fetch_alarms,
            commands::fetch_ec2_instances,
            commands::fetch_s3_buckets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
