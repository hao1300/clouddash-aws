# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class dev.clouddash.aws.* {
  native <methods>;
}

-keep class dev.clouddash.aws.WryActivity {
  public <init>(...);

  void setWebView(dev.clouddash.aws.RustWebView);
  java.lang.Class getAppClass(...);
  java.lang.String getVersion();
}

-keep class dev.clouddash.aws.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class dev.clouddash.aws.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class dev.clouddash.aws.RustWebChromeClient,dev.clouddash.aws.RustWebViewClient {
  public <init>(...);
}
