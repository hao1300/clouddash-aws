use crate::state::SharedConfig;
use aws_sdk_dynamodb::Client;
use serde::Serialize;

#[derive(Serialize)]
pub struct DynamoTableView {
    pub name: String,
    pub status: String,
    pub item_count: i64,
    pub size_bytes: i64,
}

#[tauri::command]
pub async fn fetch_dynamo_tables(config: tauri::State<'_, SharedConfig>) -> Result<Vec<DynamoTableView>, String> {
    let guard = config.0.read().await;
    let sdk = guard.as_ref().ok_or("Not authenticated")?;
    let client = Client::new(sdk);

    let list_resp = client.list_tables().send().await.map_err(|e| e.to_string())?;
    let mut tables = Vec::new();

    for name in list_resp.table_names() {
        if let Ok(desc) = client.describe_table().table_name(name).send().await {
            if let Some(t) = desc.table() {
                tables.push(DynamoTableView {
                    name: t.table_name().unwrap_or("Unknown").to_string(),
                    status: t.table_status().map(|s| s.as_str().to_string()).unwrap_or("UNKNOWN".into()),
                    item_count: t.item_count().unwrap_or(0),
                    size_bytes: t.table_size_bytes().unwrap_or(0),
                });
            }
        }
    }

    Ok(tables)
}
