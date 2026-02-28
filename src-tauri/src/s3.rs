use crate::state::SharedConfig;
use aws_sdk_s3::Client;
use aws_sdk_s3::config::Region;
use serde_json::{json, Value};
use base64::Engine;

/// Detect bucket region and create a region-correct S3 client.
/// S3 is unique: you must hit the correct region for each bucket.
async fn client_for_bucket(base: &Client, sdk: &aws_config::SdkConfig, bucket: &str) -> Result<Client, String> {
    let loc = base.get_bucket_location().bucket(bucket).send().await.map_err(|e| format!("GetBucketLocation: {e}"))?;
    let region_str = loc.location_constraint()
        .map(|c| c.as_str().to_string())
        .unwrap_or_else(|| "us-east-1".to_string()); // null means us-east-1

    // Empty string also means us-east-1
    let region_str = if region_str.is_empty() { "us-east-1".to_string() } else { region_str };

    let s3_config = aws_sdk_s3::config::Builder::from(&sdk.clone())
        .region(Region::new(region_str))
        .build();
    Ok(Client::from_conf(s3_config))
}

/// S3 gateway — proxied through Rust because S3 endpoints don't support browser CORS.
#[tauri::command]
pub async fn s3(action: String, params: Value, config: tauri::State<'_, SharedConfig>) -> Result<Value, String> {
    let guard = config.0.read().await;
    let sdk = guard.as_ref().ok_or("Not authenticated")?;
    let client = Client::new(sdk);

    match action.as_str() {
        "list_buckets" => {
            let resp = client.list_buckets().send().await.map_err(|e| format!("ListBuckets: {e}"))?;
            let items: Vec<Value> = resp.buckets().iter().map(|b| json!({
                "name": b.name().unwrap_or("Unknown"),
                "creation_date": b.creation_date().map(|d| d.to_string()),
            })).collect();
            Ok(json!({ "items": items }))
        }

        "list_objects" => {
            let bucket = params.get("bucket").and_then(|v| v.as_str()).ok_or("bucket required")?;
            let prefix = params.get("prefix").and_then(|v| v.as_str()).unwrap_or("");
            let delimiter = params.get("delimiter").and_then(|v| v.as_str());
            let token = params.get("next_token").and_then(|v| v.as_str());

            let bc = client_for_bucket(&client, sdk, bucket).await?;

            let mut req = bc.list_objects_v2().bucket(bucket).max_keys(100);
            if !prefix.is_empty() { req = req.prefix(prefix); }
            if let Some(d) = delimiter { if !d.is_empty() { req = req.delimiter(d); } }
            if let Some(t) = token { req = req.continuation_token(t); }

            let resp = req.send().await.map_err(|e| format!("ListObjectsV2: {e}"))?;

            let items: Vec<Value> = resp.contents().iter()
                .filter(|o| { let k = o.key().unwrap_or(""); !k.is_empty() && k != prefix })
                .map(|o| json!({
                    "key": o.key().unwrap_or(""),
                    "size": o.size().unwrap_or(0),
                    "last_modified": o.last_modified().map(|d| d.to_string()),
                })).collect();

            let common_prefixes: Vec<String> = resp.common_prefixes().iter()
                .filter_map(|p| p.prefix().map(|s| s.to_string()))
                .collect();

            Ok(json!({ "items": items, "common_prefixes": common_prefixes, "next_token": resp.next_continuation_token() }))
        }

        "get_object" => {
            let bucket = params.get("bucket").and_then(|v| v.as_str()).ok_or("bucket required")?;
            let key = params.get("key").and_then(|v| v.as_str()).ok_or("key required")?;

            let bc = client_for_bucket(&client, sdk, bucket).await?;

            let resp = bc.get_object().bucket(bucket).key(key).send().await.map_err(|e| format!("GetObject: {e}"))?;
            let content_type = resp.content_type().unwrap_or("application/octet-stream").to_string();
            let body = resp.body.collect().await.map_err(|e| format!("read body: {e}"))?;
            let bytes = body.into_bytes();

            let is_text = content_type.starts_with("text/")
                || content_type.contains("json") || content_type.contains("xml")
                || content_type.contains("yaml") || content_type.contains("javascript")
                || content_type.contains("csv");

            if is_text {
                let text = String::from_utf8_lossy(&bytes).to_string();
                Ok(json!({ "type": "text", "content": text, "content_type": content_type, "size": bytes.len() }))
            } else {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                Ok(json!({ "type": "binary", "content": b64, "content_type": content_type, "size": bytes.len() }))
            }
        }

        _ => Err(format!("Unknown s3 action: {action}")),
    }
}
