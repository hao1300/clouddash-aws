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
    pub profile: String,
    pub region: String,
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

    let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .profile_name(&payload.profile)
        .region(region_provider)
        .load()
        .await;

    let mut cfg = state.0.write().await;
    *cfg = Some(sdk_config);

    Ok("Authenticated successfully".into())
}
