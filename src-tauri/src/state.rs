use aws_config::meta::region::RegionProviderChain;
use aws_config::Region;
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::RwLock;

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
pub fn list_profiles() -> Result<Vec<String>, String> {
    let mut profiles = Vec::new();
    let home = dirs::home_dir().ok_or("Could not find home directory")?;

    let cred_path = home.join(".aws").join("credentials");
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

    let cfg_path = home.join(".aws").join("config");
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
) -> Result<String, String> {
    let region_provider = RegionProviderChain::first_try(Region::new(payload.region))
        .or_default_provider()
        .or_else(Region::new("us-east-1"));

    let mut config_loader = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region_provider);

    if payload.auth_type.as_deref() == Some("manual") {
        let ak = payload.access_key_id.filter(|s| !s.is_empty()).ok_or("Access Key ID is required for manual login")?;
        let sk = payload.secret_access_key.filter(|s| !s.is_empty()).ok_or("Secret Access Key is required for manual login")?;
        let token = payload.session_token.filter(|s| !s.is_empty());

        let creds = aws_credential_types::Credentials::new(
            ak, sk, token, None, "manual"
        );
        config_loader = config_loader.credentials_provider(creds);
    } else {
        if let Some(prof) = payload.profile {
            if !prof.is_empty() {
                config_loader = config_loader.profile_name(&prof);
            }
        }
    }

    let sdk_config = config_loader.load().await;

    let mut cfg = state.0.write().await;
    *cfg = Some(sdk_config);

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
pub fn save_profile(name: String, access_key: String, secret_key: String, session_token: Option<String>, region: Option<String>) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let aws_dir = home.join(".aws");

    if !aws_dir.exists() {
        std::fs::create_dir_all(&aws_dir).map_err(|e| e.to_string())?;
    }

    let cred_path = aws_dir.join("credentials");
    
    let profile_header = if name == "default" {
        "[default]".to_string()
    } else {
        format!("[{}]", name)
    };

    let mut buf = String::new();
    buf.push_str(&format!("\n{}\n", profile_header));
    buf.push_str(&format!("aws_access_key_id = {}\n", access_key));
    buf.push_str(&format!("aws_secret_access_key = {}\n", secret_key));
    
    if let Some(token) = session_token {
        if !token.is_empty() {
            buf.push_str(&format!("aws_session_token = {}\n", token));
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&cred_path)
        .map_err(|e| e.to_string())?;

    file.write_all(buf.as_bytes()).map_err(|e| e.to_string())?;

    // Optionally save region to ~/.aws/config
    if let Some(reg) = region {
        if !reg.is_empty() {
            let cfg_path = aws_dir.join("config");
            let mut cfg_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&cfg_path)
                .map_err(|e| e.to_string())?;
            
            let cfg_header = if name == "default" {
                "[default]".to_string()
            } else {
                format!("[profile {}]", name)
            };
            
            let mut cfg_buf = String::new();
            cfg_buf.push_str(&format!("\n{}\n", cfg_header));
            cfg_buf.push_str(&format!("region = {}\n", reg));
            
            cfg_file.write_all(cfg_buf.as_bytes()).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

