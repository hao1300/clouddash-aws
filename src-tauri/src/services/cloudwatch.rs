use crate::state::SharedConfig;
use aws_sdk_cloudwatch::Client;
use serde::Serialize;

#[derive(Serialize)]
pub struct AlarmView {
    pub name: String,
    pub state: String,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn fetch_alarms(config: tauri::State<'_, SharedConfig>) -> Result<Vec<AlarmView>, String> {
    let guard = config.0.read().await;
    let sdk = guard.as_ref().ok_or("Not authenticated")?;
    let client = Client::new(sdk);

    let resp = client.describe_alarms().send().await.map_err(|e| e.to_string())?;
    let alarms = resp.metric_alarms().iter().map(|a| AlarmView {
        name: a.alarm_name().unwrap_or("Unknown").to_string(),
        state: a.state_value().map(|s| s.as_str().to_string()).unwrap_or("UNKNOWN".to_string()),
        description: a.alarm_description().map(|d| d.to_string()),
    }).collect();

    Ok(alarms)
}
