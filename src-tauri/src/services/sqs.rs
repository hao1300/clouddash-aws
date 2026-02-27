use crate::state::SharedConfig;
use aws_sdk_sqs::Client;
use aws_sdk_sqs::types::QueueAttributeName;
use serde::Serialize;

#[derive(Serialize)]
pub struct SqsQueueView {
    pub name: String,
    pub url: String,
    pub messages_available: String,
    pub messages_in_flight: String,
}

#[tauri::command]
pub async fn fetch_sqs_queues(config: tauri::State<'_, SharedConfig>) -> Result<Vec<SqsQueueView>, String> {
    let guard = config.0.read().await;
    let sdk = guard.as_ref().ok_or("Not authenticated")?;
    let client = Client::new(sdk);

    let list_resp = client.list_queues().send().await.map_err(|e| e.to_string())?;
    let mut queues = Vec::new();

    for url in list_resp.queue_urls() {
        let name = url.rsplit('/').next().unwrap_or(url).to_string();
        let mut msgs_available = "N/A".to_string();
        let mut msgs_in_flight = "N/A".to_string();

        if let Ok(attr_resp) = client
            .get_queue_attributes()
            .queue_url(url)
            .attribute_names(QueueAttributeName::ApproximateNumberOfMessages)
            .attribute_names(QueueAttributeName::ApproximateNumberOfMessagesNotVisible)
            .send()
            .await
        {
            if let Some(attrs) = attr_resp.attributes() {
                if let Some(v) = attrs.get(&QueueAttributeName::ApproximateNumberOfMessages) {
                    msgs_available = v.clone();
                }
                if let Some(v) = attrs.get(&QueueAttributeName::ApproximateNumberOfMessagesNotVisible) {
                    msgs_in_flight = v.clone();
                }
            }
        }

        queues.push(SqsQueueView { name, url: url.to_string(), messages_available: msgs_available, messages_in_flight: msgs_in_flight });
    }

    Ok(queues)
}
