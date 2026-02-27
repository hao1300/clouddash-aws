use crate::state::SharedConfig;
use aws_sdk_cloudfront::Client;
use serde::Serialize;

#[derive(Serialize)]
pub struct CloudFrontDistView {
    pub id: String,
    pub domain: String,
    pub status: String,
    pub enabled: bool,
}

#[tauri::command]
pub async fn fetch_cloudfront_distributions(config: tauri::State<'_, SharedConfig>) -> Result<Vec<CloudFrontDistView>, String> {
    let guard = config.0.read().await;
    let sdk = guard.as_ref().ok_or("Not authenticated")?;
    let client = Client::new(sdk);

    let resp = client.list_distributions().send().await.map_err(|e| e.to_string())?;
    let mut dists = Vec::new();

    if let Some(list) = resp.distribution_list() {
        for item in list.items() {
            dists.push(CloudFrontDistView {
                id: item.id().to_string(),
                domain: item.domain_name().to_string(),
                status: item.status().to_string(),
                enabled: item.enabled(),
            });
        }
    }

    Ok(dists)
}
