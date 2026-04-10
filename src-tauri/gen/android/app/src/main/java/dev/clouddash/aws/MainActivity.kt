package dev.clouddash.aws

import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.view.ViewGroup
import android.view.View

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Find WebView and add permission handler for getUserMedia
    window.decorView.post {
        findWebView(window.decorView as ViewGroup)?.let { webView ->
            webView.webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    request.grant(request.resources)
                }
            }
        }
    }
  }

  private fun findWebView(view: ViewGroup): WebView? {
      for (i in 0 until view.childCount) {
          val child = view.getChildAt(i)
          if (child is WebView) return child
          if (child is ViewGroup) {
              val rv = findWebView(child)
              if (rv != null) return rv
          }
      }
      return null
  }

  // Intercept back button to prevent app exit during scanning
  override fun onBackPressed() {
    if (shouldInterceptBack()) {
      // Call JNI function to emit event via Rust
      onBackPressedNative()
    } else {
      super.onBackPressed()
    }
  }

  // JNI functions implemented in Rust (lib.rs)
  private external fun shouldInterceptBack(): Boolean
  private external fun onBackPressedNative()

  companion object {
    init {
      // The library name is defined in Cargo.toml under [lib] name
      System.loadLibrary("clouddash_aws_lib")
    }
  }
}
