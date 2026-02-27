use aws_config::meta::region::RegionProviderChain;
use aws_config::Region;
use aws_sdk_cloudwatch::Client as CloudWatchClient;
use aws_sdk_ec2::Client as Ec2Client;
use aws_sdk_s3::Client as S3Client;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

// --- Volatile State Manager ---
#[derive(Default)]
pub struct AwsState {
    pub cloudwatch: Option<CloudWatchClient>,
    pub ec2: Option<Ec2Client>,
    pub s3: Option<S3Client>,
}

pub struct AppState(pub Arc<RwLock<AwsState>>);

// --- IPC Payloads ---
#[derive(Deserialize)]
pub struct AuthPayload {
    pub profile: String,
    pub region: String,
}

#[derive(Serialize)]
pub struct AlarmView {
    pub name: String,
    pub state: String,
    pub description: Option<String>,
}

#[derive(Serialize)]
pub struct InstanceView {
    pub id: String,
    pub state: String,
    pub instance_type: String,
}

#[derive(Serialize)]
pub struct BucketView {
    pub name: String,
    pub creation_date: Option<String>,
}

// --- Tauri Commands ---

#[tauri::command]
pub fn list_profiles() -> Result<Vec<String>, String> {
    let mut profiles = Vec::new();
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    
    // Check credentials file
    let cred_path = home.join(".aws").join("credentials");
    if cred_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cred_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with('[') && line.ends_with(']') {
                    let name = &line[1..line.len()-1];
                    if !profiles.contains(&name.to_string()) {
                        profiles.push(name.to_string());
                    }
                }
            }
        }
    }
    
    // Check config file
    let cfg_path = home.join(".aws").join("config");
    if cfg_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cfg_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with('[') && line.ends_with(']') {
                    let mut name = &line[1..line.len()-1];
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
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let region_provider = RegionProviderChain::first_try(Region::new(payload.region))
        .or_default_provider()
        .or_else(Region::new("us-east-1"));

    let shared_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .profile_name(&payload.profile)
        .region(region_provider)
        .load()
        .await;

    // Initialize Clients
    let cw_client = CloudWatchClient::new(&shared_config);
    let ec2_client = Ec2Client::new(&shared_config);
    let s3_client = S3Client::new(&shared_config);

    // Store in volatile state
    let mut aws_state = state.0.write().await;
    aws_state.cloudwatch = Some(cw_client);
    aws_state.ec2 = Some(ec2_client);
    aws_state.s3 = Some(s3_client);

    Ok("Authenticated successfully".into())
}

#[tauri::command]
pub async fn fetch_alarms(state: tauri::State<'_, AppState>) -> Result<Vec<AlarmView>, String> {
    let aws_state = state.0.read().await;
    let client = aws_state.cloudwatch.as_ref().ok_or("Not authenticated")?;

    let response = client.describe_alarms().send().await.map_err(|e| e.to_string())?;
    
    let alarms = response.metric_alarms().iter().map(|a| {
        AlarmView {
            name: a.alarm_name().unwrap_or("Unknown").to_string(),
            state: a.state_value().map(|s| s.as_str().to_string()).unwrap_or("UNKNOWN".to_string()),
            description: a.alarm_description().map(|d| d.to_string()),
        }
    }).collect();

    Ok(alarms)
}

#[tauri::command]
pub async fn fetch_ec2_instances(state: tauri::State<'_, AppState>) -> Result<Vec<InstanceView>, String> {
    let aws_state = state.0.read().await;
    let client = aws_state.ec2.as_ref().ok_or("Not authenticated")?;

    let response = client.describe_instances().send().await.map_err(|e| e.to_string())?;
    
    let mut instances = Vec::new();
    for reservation in response.reservations() {
        for instance in reservation.instances() {
            instances.push(InstanceView {
                id: instance.instance_id().unwrap_or("Unknown").to_string(),
                state: instance.state().map(|s| s.name().map(|n| n.as_str().to_string()).unwrap_or("UNKNOWN".to_string())).unwrap_or("UNKNOWN".to_string()),
                instance_type: instance.instance_type().map(|t| t.as_str().to_string()).unwrap_or("Unknown".to_string()),
            });
        }
    }

    Ok(instances)
}

#[tauri::command]
pub async fn fetch_s3_buckets(state: tauri::State<'_, AppState>) -> Result<Vec<BucketView>, String> {
    let aws_state = state.0.read().await;
    let client = aws_state.s3.as_ref().ok_or("Not authenticated")?;

    let response = client.list_buckets().send().await.map_err(|e| e.to_string())?;
    
    let buckets = response.buckets().iter().map(|b| {
        let date_str = b.creation_date().map(|d| d.to_string());
        BucketView {
            name: b.name().unwrap_or("Unknown").to_string(),
            creation_date: date_str,
        }
    }).collect();

    Ok(buckets)
}
