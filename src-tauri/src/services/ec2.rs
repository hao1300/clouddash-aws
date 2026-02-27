use crate::state::SharedConfig;
use aws_sdk_ec2::Client;
use serde::Serialize;

#[derive(Serialize)]
pub struct InstanceView {
    pub id: String,
    pub state: String,
    pub instance_type: String,
}

#[tauri::command]
pub async fn fetch_ec2_instances(config: tauri::State<'_, SharedConfig>) -> Result<Vec<InstanceView>, String> {
    let guard = config.0.read().await;
    let sdk = guard.as_ref().ok_or("Not authenticated")?;
    let client = Client::new(sdk);

    let resp = client.describe_instances().send().await.map_err(|e| e.to_string())?;
    let mut instances = Vec::new();
    for reservation in resp.reservations() {
        for inst in reservation.instances() {
            instances.push(InstanceView {
                id: inst.instance_id().unwrap_or("Unknown").to_string(),
                state: inst.state()
                    .map(|s| s.name().map(|n| n.as_str().to_string()).unwrap_or("UNKNOWN".into()))
                    .unwrap_or("UNKNOWN".into()),
                instance_type: inst.instance_type()
                    .map(|t| t.as_str().to_string())
                    .unwrap_or("Unknown".into()),
            });
        }
    }

    Ok(instances)
}
