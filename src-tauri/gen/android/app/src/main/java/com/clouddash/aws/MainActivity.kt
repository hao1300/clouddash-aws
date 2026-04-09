package com.clouddash.aws

import android.os.Bundle

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
  }

  // Intercept back button to prevent app exit during scanning
  override fun onBackPressed() {
    if (shouldInterceptBack()) {
      // Emit event to JS
      this.app?.emit("tauri://back-button", null)
    } else {
      super.onBackPressed()
    }
  }

  // JNI function implemented in Rust (lib.rs)
  private external fun shouldInterceptBack(): Boolean

  companion object {
    init {
      // The library name is defined in Cargo.toml under [lib] name
      System.loadLibrary("clouddash_aws_lib")
    }
  }
}
