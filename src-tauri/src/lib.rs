mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state::SharedConfig::default())
        .invoke_handler(tauri::generate_handler![
            state::list_profiles,
            state::authenticate,
            state::get_credentials,
            state::save_profile,
            state::fork_process,
            state::get_initial_state,
            state::get_all_profiles,
            state::get_os,
            state::save_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
