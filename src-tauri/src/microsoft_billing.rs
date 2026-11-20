use serde_json::Value;
use tauri::WebviewWindow;

#[tauri::command]
pub async fn microsoft_billing(
    window: WebviewWindow,
    action: String,
    product_id: String,
    service_ticket: Option<String>,
    account_id: Option<String>,
) -> Result<Value, String> {
    #[cfg(all(target_os = "windows", feature = "microsoft-store"))]
    {
        store::run(window, action, product_id, service_ticket, account_id).await
    }
    #[cfg(not(all(target_os = "windows", feature = "microsoft-store")))]
    {
        let _ = (window, action, product_id, service_ticket, account_id);
        Err("Install CloudDash from the Microsoft Store to use its billing.".into())
    }
}

#[cfg(all(target_os = "windows", feature = "microsoft-store"))]
mod store {
    use serde_json::{json, Value};
    use tauri::WebviewWindow;
    use tokio::sync::oneshot;
    use windows::core::{Interface, Result as WindowsResult, HSTRING};
    use windows::Services::Store::{StoreContext, StorePurchaseStatus};
    use windows::Win32::UI::Shell::IInitializeWithWindow;
    use windows_collections::IIterable;

    const UNAVAILABLE: &str =
        "Microsoft Store billing is unavailable. Try again from the Store build.";

    async fn start_on_window<T: Send + 'static>(
        window: &WebviewWindow,
        start: impl FnOnce(StoreContext) -> WindowsResult<T> + Send + 'static,
    ) -> Result<T, String> {
        let (send, receive) = oneshot::channel();
        let owner = window.clone();
        window
            .run_on_main_thread(move || {
                let result = (|| {
                    let hwnd = owner.hwnd().map_err(|_| {
                        windows::core::Error::from_hresult(windows::core::HRESULT(
                            0x80004005u32 as i32,
                        ))
                    })?;
                    let context = StoreContext::GetDefault()?;
                    let initialize: IInitializeWithWindow = context.cast()?;
                    // The Store must know which window owns its purchase and sign-in dialogs.
                    unsafe { initialize.Initialize(hwnd)? };
                    start(context)
                })();
                let _ = send.send(result);
            })
            .map_err(|_| UNAVAILABLE.to_string())?;
        receive
            .await
            .map_err(|_| UNAVAILABLE.to_string())?
            .map_err(|_| UNAVAILABLE.to_string())
    }

    pub async fn run(
        window: WebviewWindow,
        action: String,
        product_id: String,
        service_ticket: Option<String>,
        account_id: Option<String>,
    ) -> Result<Value, String> {
        if product_id.len() != 12
            || !product_id
                .bytes()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        {
            return Err("Invalid Microsoft Store product.".into());
        }
        let product = HSTRING::from(product_id);
        match action.as_str() {
            "price" => {
                let lookup = product.clone();
                let operation = start_on_window(&window, move |context| {
                    let kinds: IIterable<HSTRING> = vec![HSTRING::from("Durable")].into();
                    let ids: IIterable<HSTRING> = vec![lookup].into();
                    context.GetStoreProductsAsync(&kinds, &ids)
                })
                .await?;
                let result = operation
                    .await
                    .and_then(|value| {
                        value.ExtendedError()?.ok()?;
                        value
                            .Products()?
                            .Lookup(&product)?
                            .Price()?
                            .FormattedPrice()
                    })
                    .map_err(|_| UNAVAILABLE.to_string())?;
                Ok(json!({ "price": result.to_string_lossy() }))
            }
            "purchase" => {
                let operation = start_on_window(&window, move |context| {
                    context.RequestPurchaseAsync(&product)
                })
                .await?;
                let status = operation
                    .await
                    .and_then(|value| value.Status())
                    .map_err(|_| UNAVAILABLE.to_string())?;
                match status {
                    StorePurchaseStatus::Succeeded | StorePurchaseStatus::AlreadyPurchased => Ok(json!({ "purchased": true })),
                    StorePurchaseStatus::NotPurchased => Ok(json!({ "purchased": false })),
                    _ => Err("The Microsoft Store could not complete the purchase. Try again or restore it from CloudDash.".into()),
                }
            }
            "store-key" => {
                let ticket = service_ticket
                    .filter(|value| !value.is_empty() && value.len() <= 16_384)
                    .ok_or("Microsoft Store verification is unavailable.")?;
                let account = account_id
                    .filter(|value| {
                        value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
                    })
                    .ok_or("Sign in to CloudDash Pro before restoring a purchase.")?;
                let operation = start_on_window(&window, move |context| {
                    context.GetCustomerCollectionsIdAsync(
                        &HSTRING::from(ticket),
                        &HSTRING::from(account),
                    )
                })
                .await?;
                let key = operation.await.map_err(|_| UNAVAILABLE.to_string())?;
                if key.is_empty() {
                    return Err("Sign in to the Microsoft Store with the account that bought CloudDash Pro.".into());
                }
                Ok(json!({ "key": key.to_string_lossy() }))
            }
            _ => Err("Invalid Microsoft Store billing action.".into()),
        }
    }
}
