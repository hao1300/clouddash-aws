use crate::state::SharedConfig;
use aws_sdk_s3::Client;
use serde::Serialize;

#[derive(Serialize)]
pub struct BucketView {
    pub name: String,
    pub creation_date: Option<String>,
}

#[tauri::command]
pub async fn fetch_s3_buckets(config: tauri::State<'_, SharedConfig>) -> Result<Vec<BucketView>, String> {
    let guard = config.0.read().await;
    let sdk = guard.as_ref().ok_or("Not authenticated")?;
    let client = Client::new(sdk);

    let resp = client.list_buckets().send().await.map_err(|e| e.to_string())?;
    let buckets = resp.buckets().iter().map(|b| BucketView {
        name: b.name().unwrap_or("Unknown").to_string(),
        creation_date: b.creation_date().map(|d| d.to_string()),
    }).collect();

    Ok(buckets)
}
