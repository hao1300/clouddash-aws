mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state::SharedConfig::default())
        .invoke_handler(tauri::generate_handler![
            state::list_profiles,
            state::authenticate,
            state::get_credentials,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
