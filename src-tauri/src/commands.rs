use aws_config::meta::region::RegionProviderChain;
use aws_config::Region;
use aws_sdk_cloudfront::Client as CloudFrontClient;
use aws_sdk_cloudwatch::Client as CloudWatchClient;
use aws_sdk_dynamodb::Client as DynamoDbClient;
use aws_sdk_ec2::Client as Ec2Client;
use aws_sdk_s3::Client as S3Client;
use aws_sdk_sqs::Client as SqsClient;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

// --- Volatile State Manager ---
#[derive(Default)]
pub struct AwsState {
    pub cloudwatch: Option<CloudWatchClient>,
    pub ec2: Option<Ec2Client>,
    pub s3: Option<S3Client>,
    pub dynamodb: Option<DynamoDbClient>,
    pub sqs: Option<SqsClient>,
    pub cloudfront: Option<CloudFrontClient>,
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

#[derive(Serialize)]
pub struct DynamoTableView {
    pub name: String,
    pub status: String,
    pub item_count: i64,
    pub size_bytes: i64,
}

#[derive(Serialize)]
pub struct SqsQueueView {
    pub name: String,
    pub url: String,
    pub messages_available: String,
    pub messages_in_flight: String,
}

#[derive(Serialize)]
pub struct CloudFrontDistView {
    pub id: String,
    pub domain: String,
    pub status: String,
    pub enabled: bool,
}

// --- Tauri Commands ---

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

    let mut aws_state = state.0.write().await;
    aws_state.cloudwatch = Some(CloudWatchClient::new(&shared_config));
    aws_state.ec2 = Some(Ec2Client::new(&shared_config));
    aws_state.s3 = Some(S3Client::new(&shared_config));
    aws_state.dynamodb = Some(DynamoDbClient::new(&shared_config));
    aws_state.sqs = Some(SqsClient::new(&shared_config));
    aws_state.cloudfront = Some(CloudFrontClient::new(&shared_config));

    Ok("Authenticated successfully".into())
}

// --- CloudWatch ---
#[tauri::command]
pub async fn fetch_alarms(state: tauri::State<'_, AppState>) -> Result<Vec<AlarmView>, String> {
    let aws_state = state.0.read().await;
    let client = aws_state.cloudwatch.as_ref().ok_or("Not authenticated")?;
    let response = client.describe_alarms().send().await.map_err(|e| e.to_string())?;

    let alarms = response.metric_alarms().iter().map(|a| AlarmView {
        name: a.alarm_name().unwrap_or("Unknown").to_string(),
        state: a.state_value().map(|s| s.as_str().to_string()).unwrap_or("UNKNOWN".to_string()),
        description: a.alarm_description().map(|d| d.to_string()),
    }).collect();

    Ok(alarms)
}

// --- EC2 ---
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

// --- S3 ---
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

// --- DynamoDB ---
#[tauri::command]
pub async fn fetch_dynamo_tables(state: tauri::State<'_, AppState>) -> Result<Vec<DynamoTableView>, String> {
    let aws_state = state.0.read().await;
    let client = aws_state.dynamodb.as_ref().ok_or("Not authenticated")?;

    let list_resp = client.list_tables().send().await.map_err(|e| e.to_string())?;
    let table_names = list_resp.table_names();

    let mut tables = Vec::new();
    for name in table_names {
        if let Ok(desc_resp) = client.describe_table().table_name(name).send().await {
            if let Some(table) = desc_resp.table() {
                tables.push(DynamoTableView {
                    name: table.table_name().unwrap_or("Unknown").to_string(),
                    status: table.table_status().map(|s| s.as_str().to_string()).unwrap_or("UNKNOWN".to_string()),
                    item_count: table.item_count().unwrap_or(0),
                    size_bytes: table.table_size_bytes().unwrap_or(0),
                });
            }
        }
    }

    Ok(tables)
}

// --- SQS ---
#[tauri::command]
pub async fn fetch_sqs_queues(state: tauri::State<'_, AppState>) -> Result<Vec<SqsQueueView>, String> {
    let aws_state = state.0.read().await;
    let client = aws_state.sqs.as_ref().ok_or("Not authenticated")?;

    let list_resp = client.list_queues().send().await.map_err(|e| e.to_string())?;
    let urls = list_resp.queue_urls();

    let mut queues = Vec::new();
    for url in urls {
        let name = url.rsplit('/').next().unwrap_or(url).to_string();
        // Fetch attributes for message counts
        let mut msgs_available = "N/A".to_string();
        let mut msgs_in_flight = "N/A".to_string();
        if let Ok(attr_resp) = client
            .get_queue_attributes()
            .queue_url(url)
            .attribute_names(aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessages)
            .attribute_names(aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessagesNotVisible)
            .send()
            .await
        {
            if let Some(attrs) = attr_resp.attributes() {
                if let Some(v) = attrs.get(&aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessages) {
                    msgs_available = v.clone();
                }
                if let Some(v) = attrs.get(&aws_sdk_sqs::types::QueueAttributeName::ApproximateNumberOfMessagesNotVisible) {
                    msgs_in_flight = v.clone();
                }
            }
        }
        queues.push(SqsQueueView {
            name,
            url: url.to_string(),
            messages_available: msgs_available,
            messages_in_flight: msgs_in_flight,
        });
    }

    Ok(queues)
}

// --- CloudFront ---
#[tauri::command]
pub async fn fetch_cloudfront_distributions(state: tauri::State<'_, AppState>) -> Result<Vec<CloudFrontDistView>, String> {
    let aws_state = state.0.read().await;
    let client = aws_state.cloudfront.as_ref().ok_or("Not authenticated")?;

    let response = client.list_distributions().send().await.map_err(|e| e.to_string())?;

    let mut dists = Vec::new();
    if let Some(list) = response.distribution_list() {
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
