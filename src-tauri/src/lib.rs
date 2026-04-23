mod state;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::Emitter;

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static INTERCEPT_BACK: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn set_back_button_intercept(enabled: bool) {
    INTERCEPT_BACK.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn Java_dev_clouddash_aws_MainActivity_shouldInterceptBack(
    _env: *mut std::ffi::c_void,
    _class: *mut std::ffi::c_void,
) -> bool {
    INTERCEPT_BACK.load(Ordering::Relaxed)
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn Java_dev_clouddash_aws_MainActivity_onBackPressedNative(
    _env: *mut std::ffi::c_void,
    _class: *mut std::ffi::c_void,
) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("tauri://back-button", ());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            APP_HANDLE.set(app.handle().clone()).ok();
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_scoped_storage::init())
        .manage(state::SharedConfig::default())
        .invoke_handler(tauri::generate_handler![
            set_back_button_intercept,
            exit_app,
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
