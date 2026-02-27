// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod services;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state::SharedConfig::default())
        // ── Register service commands here (one line per service) ──
        .invoke_handler(tauri::generate_handler![
            state::list_profiles,
            state::authenticate,
            services::cloudwatch::fetch_alarms,
            services::ec2::fetch_ec2_instances,
            services::s3::fetch_s3_buckets,
            services::dynamodb::fetch_dynamo_tables,
            services::sqs::fetch_sqs_queues,
            services::cloudfront::fetch_cloudfront_distributions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
