use aws_config::meta::region::RegionProviderChain;
use aws_config::Region;
use serde::Deserialize;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::RwLock;

fn get_aws_dir(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Ok(app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join(".aws"))
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        Ok(dirs::home_dir()
            .ok_or("Could not find home directory")?
            .join(".aws"))
    }
}

#[tauri::command]
pub fn get_default_download_directory(app_handle: tauri::AppHandle) -> Result<String, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let path = app_handle
            .path()
            .document_dir()
            .map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().to_string())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let path =
            dirs::download_dir().unwrap_or_else(|| dirs::home_dir().unwrap().join("Downloads"));
        Ok(path.to_string_lossy().to_string())
    }
}

#[tauri::command]
pub fn get_android_download_directory() -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        // standard android download folder
        let path = std::path::Path::new("/storage/emulated/0/Download");
        if path.exists() {
            Ok(path.to_string_lossy().to_string())
        } else {
            Err("Download directory not found".into())
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("Not on Android".into())
    }
}

/// Shared AWS configuration — each service creates its own client from this.
pub struct SharedConfig(pub Arc<RwLock<Option<aws_config::SdkConfig>>>);

impl Default for SharedConfig {
    fn default() -> Self {
        Self(Arc::new(RwLock::new(None)))
    }
}

#[derive(Deserialize)]
pub struct AuthPayload {
    pub auth_type: Option<String>,
    pub profile: Option<String>,
    pub region: String,
    pub access_key_id: Option<String>,
    pub secret_access_key: Option<String>,
    pub session_token: Option<String>,
}

#[tauri::command]
pub fn list_profiles(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut profiles = Vec::new();
    let aws_dir = get_aws_dir(&app_handle)?;

    let cred_path = aws_dir.join("credentials");
    if cred_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cred_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with('[') && line.ends_with(']') {
                    let name = &line[1..line.len() - 1];
                    if !profiles.contains(&name.to_string()) {
                        profiles.push(name.to_string());
                    }
                }
            }
        }
    }

    let cfg_path = aws_dir.join("config");
    if cfg_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cfg_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with('[') && line.ends_with(']') {
                    let mut name = &line[1..line.len() - 1];
                    if name.starts_with("profile ") {
                        name = name["profile ".len()..].trim();
                    }
                    if !profiles.contains(&name.to_string()) {
                        profiles.push(name.to_string());
                    }
                }
            }
        }
    }

    if profiles.is_empty() {
        profiles.push("default".to_string());
    }
    Ok(profiles)
}

#[tauri::command]
pub async fn authenticate(
    payload: AuthPayload,
    state: tauri::State<'_, SharedConfig>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let _ = app_handle.emit("auth_progress", "Starting authentication...");

    std::env::set_var("AWS_EC2_METADATA_DISABLED", "true");

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        if let Ok(aws_dir) = get_aws_dir(&app_handle) {
            std::env::set_var("AWS_SHARED_CREDENTIALS_FILE", aws_dir.join("credentials"));
            std::env::set_var("AWS_CONFIG_FILE", aws_dir.join("config"));
        }
    }
    let _ = app_handle.emit(
        "auth_progress",
        format!("Resolving region: {}...", payload.region),
    );
    let region_provider = RegionProviderChain::first_try(Region::new(payload.region))
        .or_default_provider()
        .or_else(Region::new("us-east-1"));

    let mut config_loader =
        aws_config::defaults(aws_config::BehaviorVersion::latest()).region(region_provider);

    if payload.auth_type.as_deref() == Some("manual") {
        let _ = app_handle.emit("auth_progress", "Using manual API keys...");
        let ak = payload
            .access_key_id
            .filter(|s| !s.is_empty())
            .ok_or("Access Key ID is required for manual login")?;
        let sk = payload
            .secret_access_key
            .filter(|s| !s.is_empty())
            .ok_or("Secret Access Key is required for manual login")?;
        let token = payload.session_token.filter(|s| !s.is_empty());

        let creds = aws_credential_types::Credentials::new(ak, sk, token, None, "manual");
        config_loader = config_loader.credentials_provider(creds);
    } else {
        if let Some(prof) = payload.profile {
            if !prof.is_empty() {
                let _ = app_handle.emit("auth_progress", format!("Using profile: {}", prof));
                config_loader = config_loader.profile_name(&prof);
            }
        }
    }

    let _ = app_handle.emit(
        "auth_progress",
        "Loading AWS config... (with 10-second timeout)",
    );
    let sdk_config = match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        config_loader.load(),
    )
    .await
    {
        Ok(cfg) => cfg,
        Err(_) => {
            let _ = app_handle.emit("auth_progress", "ERROR: AWS configuration loading timed out after 10 seconds. Check your network or credentials setup.");
            return Err("AWS configuration loading timed out after 10 seconds.".into());
        }
    };

    let _ = app_handle.emit(
        "auth_progress",
        "AWS configuration loaded. Updating state...",
    );
    let mut cfg = state.0.write().await;
    *cfg = Some(sdk_config);

    let _ = app_handle.emit("auth_progress", "Authentication successful.");
    Ok("Authenticated successfully".into())
}

#[tauri::command]
pub async fn get_credentials(
    config: tauri::State<'_, SharedConfig>,
) -> Result<serde_json::Value, String> {
    let guard = config.0.read().await;
    let sdk = guard.as_ref().ok_or("Not authenticated")?;

    let provider = sdk
        .credentials_provider()
        .ok_or("No credentials provider configured")?;

    use aws_credential_types::provider::ProvideCredentials;
    let creds = provider
        .provide_credentials()
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "access_key_id": creds.access_key_id(),
        "secret_access_key": creds.secret_access_key(),
        "session_token": creds.session_token(),
        "region": sdk.region().map(|r| r.as_ref()),
    }))
}

#[tauri::command]
pub fn save_profile(
    app_handle: tauri::AppHandle,
    name: String,
    properties: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let aws_dir = get_aws_dir(&app_handle)?;

    if !aws_dir.exists() {
        std::fs::create_dir_all(&aws_dir).map_err(|e| e.to_string())?;
    }

    let cred_path = aws_dir.join("credentials");
    let cfg_path = aws_dir.join("config");

    let cred_header = if name == "default" {
        "[default]".to_string()
    } else {
        format!("[{}]", name)
    };

    let cfg_header = if name == "default" {
        "[default]".to_string()
    } else {
        format!("[profile {}]", name)
    };

    let mut cred_buf = String::new();
    let mut cfg_buf = String::new();

    cred_buf.push_str(&format!("\n{}\n", cred_header));
    cfg_buf.push_str(&format!("\n{}\n", cfg_header));

    let mut has_cred = false;
    let mut has_cfg = false;

    let is_cred_key = |k: &str| {
        k == "aws_access_key_id"
            || k == "aws_secret_access_key"
            || k == "aws_session_token"
            || k == "credential_process"
            || k == "credential_source"
    };

    for (k, v) in properties.iter() {
        if k == "profile" {
            continue;
        }
        if v.is_empty() {
            continue;
        }
        if is_cred_key(k) {
            cred_buf.push_str(&format!("{} = {}\n", k, v));
            has_cred = true;
        } else {
            cfg_buf.push_str(&format!("{} = {}\n", k, v));
            has_cfg = true;
        }
    }

    if has_cred {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&cred_path)
            .map_err(|e| e.to_string())?;
        file.write_all(cred_buf.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    if has_cfg {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&cfg_path)
            .map_err(|e| e.to_string())?;
        file.write_all(cfg_buf.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[derive(serde::Serialize)]
pub struct InitialState {
    pub path: Option<String>,
    pub region: Option<String>,
    pub profile: Option<String>,
}

#[tauri::command]
pub fn fork_process(
    path: Option<String>,
    region: Option<String>,
    profile: Option<String>,
) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut cmd = std::process::Command::new(current_exe);

    if let Some(p) = path {
        cmd.env("CLOUDDASH_INITIAL_PATH", p);
    }
    if let Some(r) = region {
        cmd.env("CLOUDDASH_INITIAL_REGION", r);
    }
    if let Some(p) = profile {
        cmd.env("CLOUDDASH_INITIAL_PROFILE", p);
    }

    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_initial_state() -> InitialState {
    InitialState {
        path: std::env::var("CLOUDDASH_INITIAL_PATH").ok(),
        region: std::env::var("CLOUDDASH_INITIAL_REGION").ok(),
        profile: std::env::var("CLOUDDASH_INITIAL_PROFILE").ok(),
    }
}

fn parse_ini(
    path: &std::path::Path,
) -> std::collections::HashMap<String, std::collections::HashMap<String, String>> {
    let mut map = std::collections::HashMap::new();
    let mut current_section = String::new();
    if let Ok(content) = std::fs::read_to_string(path) {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('[') && line.ends_with(']') {
                let name = &line[1..line.len() - 1];
                let mut name_clean = name.trim();
                if name_clean.starts_with("profile ") {
                    name_clean = name_clean["profile ".len()..].trim();
                }
                current_section = name_clean.to_string();
                map.entry(current_section.clone())
                    .or_insert_with(std::collections::HashMap::new);
            } else if !line.is_empty() && !line.starts_with('#') {
                if let Some((k, v)) = line.split_once('=') {
                    if !current_section.is_empty() {
                        if let Some(section_map) = map.get_mut(&current_section) {
                            section_map.insert(k.trim().to_string(), v.trim().to_string());
                        }
                    }
                }
            }
        }
    }
    map
}

#[tauri::command]
pub fn get_all_profiles(app_handle: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let aws_dir = get_aws_dir(&app_handle)?;
    let creds_map = parse_ini(&aws_dir.join("credentials"));
    let cfg_map = parse_ini(&aws_dir.join("config"));

    let mut all_profile_names: Vec<String> = creds_map.keys().cloned().collect();
    for k in cfg_map.keys() {
        if !all_profile_names.contains(k) {
            all_profile_names.push(k.clone());
        }
    }

    let mut profiles = Vec::new();
    for name in all_profile_names {
        let mut props = std::collections::HashMap::new();
        if let Some(m) = creds_map.get(&name) {
            props.extend(m.clone());
        }
        if let Some(m) = cfg_map.get(&name) {
            props.extend(m.clone());
        }

        if !props.is_empty() {
            let mut val = serde_json::to_value(props).map_err(|e| e.to_string())?;
            val.as_object_mut().unwrap().insert(
                "profile".to_string(),
                serde_json::Value::String(name.clone()),
            );
            profiles.push(val);
        }
    }
    Ok(profiles)
}

#[tauri::command]
pub fn get_os() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub async fn save_file(path: String, data: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(&data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(path).spawn();
    }
    Ok(())
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Ok(())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        open_folder(path).await
    }
}
