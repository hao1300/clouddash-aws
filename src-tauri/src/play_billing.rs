#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::{AppHandle, Runtime};

#[cfg(target_os = "android")]
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("clouddash-play-billing")
        .setup(|app, api| {
            let billing =
                api.register_android_plugin("dev.clouddash.aws", "CloudDashPlayBilling")?;
            app.manage(billing);
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn play_billing<R: Runtime>(
    app: AppHandle<R>,
    action: String,
    product_id: String,
    account_id: Option<String>,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        if !matches!(action.as_str(), "price" | "purchase" | "restore") {
            return Err("Invalid Google Play Billing action.".into());
        }
        app.state::<tauri::plugin::PluginHandle<R>>()
            .run_mobile_plugin_async(
                action,
                serde_json::json!({ "productId": product_id, "accountId": account_id }),
            )
            .await
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, action, product_id, account_id);
        Err("Google Play Billing is available on Android.".into())
    }
}
