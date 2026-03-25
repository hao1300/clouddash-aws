mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_scoped_storage::init())
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
            state::file_exists,
            state::open_folder,
            state::open_file,
            state::get_default_download_directory,
            state::get_android_download_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
