package dev.clouddash.aws

import android.app.Activity
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONArray

@InvokeArg
class PlayBillingArgs {
    lateinit var productId: String
    var accountId: String? = null
}

@TauriPlugin
class CloudDashPlayBilling(private val host: Activity) : Plugin(host) {
    private var pendingPurchase: Invoke? = null
    private val client by lazy {
        BillingClient.newBuilder(host)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .setListener { result, purchases ->
                host.runOnUiThread {
                    val call = pendingPurchase ?: return@runOnUiThread
                    pendingPurchase = null
                    when (result.responseCode) {
                        BillingClient.BillingResponseCode.OK -> call.resolve(purchaseResult(purchases.orEmpty()))
                        BillingClient.BillingResponseCode.USER_CANCELED -> call.resolve(purchaseResult(emptyList()))
                        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> queryPurchases(call)
                        else -> call.reject("Google Play could not complete the purchase.")
                    }
                }
            }
            .build()
    }

    private fun withClient(call: Invoke, ready: () -> Unit) {
        host.runOnUiThread {
            if (!installedFromPlay()) {
                call.reject("Install CloudDash from Google Play to use Google Play Billing.")
                return@runOnUiThread
            }
            if (client.isReady) {
                ready()
                return@runOnUiThread
            }
            client.startConnection(object : BillingClientStateListener {
                override fun onBillingServiceDisconnected() = Unit
                override fun onBillingSetupFinished(result: BillingResult) {
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) ready()
                    else call.reject("Google Play Billing is unavailable on this device.")
                }
            })
        }
    }

    @Suppress("DEPRECATION")
    private fun installedFromPlay(): Boolean {
        val packages = host.packageManager
        val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            packages.getInstallSourceInfo(host.packageName).installingPackageName
        } else packages.getInstallerPackageName(host.packageName)
        return installer == "com.android.vending"
    }

    private fun withOffer(
        call: Invoke,
        productId: String,
        ready: (ProductDetails, ProductDetails.OneTimePurchaseOfferDetails) -> Unit,
    ) {
        withClient(call) {
            val product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId).setProductType(BillingClient.ProductType.INAPP).build()
            val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
            client.queryProductDetailsAsync(params) { result, details ->
                val item = details.productDetailsList.firstOrNull { it.productId == productId }
                val offer = (item?.oneTimePurchaseOfferDetailsList ?: listOfNotNull(item?.oneTimePurchaseOfferDetails))
                    .firstOrNull { it.rentalDetails == null && it.preorderDetails == null && it.offerId == null }
                if (result.responseCode != BillingClient.BillingResponseCode.OK || item == null || offer == null) {
                    call.reject("The CloudDash Pro offer is unavailable in Google Play.")
                } else host.runOnUiThread { ready(item, offer) }
            }
        }
    }

    @Command
    fun price(call: Invoke) {
        val args = call.parseArgs(PlayBillingArgs::class.java)
        withOffer(call, args.productId) { _, offer ->
            call.resolve(JSObject().put("price", offer.formattedPrice))
        }
    }

    @Command
    fun purchase(call: Invoke) {
        val args = call.parseArgs(PlayBillingArgs::class.java)
        val accountId = args.accountId
        if (accountId == null || !accountId.matches(Regex("[a-f0-9]{64}"))) {
            call.reject("Sign in to CloudDash Pro before buying.")
            return
        }
        withOffer(call, args.productId) { product, offer ->
            if (pendingPurchase != null) {
                call.reject("A purchase is already in progress.")
                return@withOffer
            }
            val item = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product)
            offer.offerToken?.takeIf { it.isNotEmpty() }?.let { item.setOfferToken(it) }
            val params = BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(item.build()))
                .setObfuscatedAccountId(accountId).build()
            pendingPurchase = call
            val result = client.launchBillingFlow(host, params)
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                pendingPurchase = null
                if (result.responseCode == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) queryPurchases(call)
                else call.reject("Google Play could not open checkout.")
            }
        }
    }

    @Command
    fun restore(call: Invoke) = withClient(call) { queryPurchases(call) }

    private fun queryPurchases(call: Invoke) {
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
        client.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) call.resolve(purchaseResult(purchases))
            else call.reject("Google Play could not restore purchases.")
        }
    }

    private fun purchaseResult(purchases: List<Purchase>): JSObject {
        val values = JSONArray()
        for (purchase in purchases) {
            values.put(JSObject().put("products", JSONArray(purchase.products))
                .put("token", purchase.purchaseToken)
                .put("pending", purchase.purchaseState == Purchase.PurchaseState.PENDING))
        }
        return JSObject().put("purchases", values)
    }
}
