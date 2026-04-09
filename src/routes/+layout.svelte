<script lang="ts">
  import "../app.css";
  import { invoke } from "@tauri-apps/api/core";
  import { onMount, type Snippet } from "svelte";
  import { flip } from "svelte/animate";
  import { fly, fade } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import Login from "$lib/components/Login.svelte";
  import { aws } from "$lib/services/aws.svelte";
  import { bookmarks } from "$lib/services/bookmarks.svelte";
  import { titleService } from "$lib/services/title.svelte";
  import { settings } from "$lib/services/settings.svelte";
  import { SERVICE_MANIFEST } from "$lib/services/service-manifest";
  import { transformTabsGeneric } from "$lib/services/tab-utils";
  import ServiceLayout from "$lib/components/ServiceLayout.svelte";
  import BackButton from "$lib/components/BackButton.svelte";
  import ToastContainer from "$lib/components/ToastContainer.svelte";

  let { children }: { children: Snippet } = $props();

  const STORAGE_KEY = "aws_console_state";

  const ALL_REGIONS = [
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-central-1",
    "eu-north-1",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
    "ap-northeast-2",
    "ap-south-1",
    "sa-east-1",
    "ca-central-1",
    "me-south-1",
    "af-south-1",
  ];

  // Derive services list from manifest
  const services = Object.entries(SERVICE_MANIFEST).map(([id, entry]) => ({
    id,
    label: entry.label,
    defaultEnabled: true,
  }));

  let allProfiles = $state<string[]>([]);
  let selectedProfile = $state("default");
  let region = $state("us-east-1");
  let authType = $state<"profile" | "manual" | "assume" | "qr">("profile");

  // Custom API Keys
  let os = $state("");
  let isMobile = $derived(os === "android" || os === "ios");
  let accountId = $state("");
  let roleName = $state("");
  let sourceProfile = $state("default");
  let accessKeyId = $state("");
  let secretAccessKey = $state("");
  let sessionToken = $state("");
  let saveProfileChecked = $state(false);
  let saveProfileName = $state("");

  let isAuthenticated = $state(false);
  let loading = $state(false);
  let error = $state("");

  // Ordered + visibility lists
  let profileOrder = $state<string[]>([]);
  let profileVisible = $state<Set<string>>(new Set());
  let regionOrder = $state<string[]>([...ALL_REGIONS]);
  let regionVisible = $state<Set<string>>(new Set(ALL_REGIONS));
  let serviceOrder = $state<string[]>(services.map((s) => s.id));
  let serviceVisible = $state<Set<string>>(new Set(services.map((s) => s.id)));

  let refreshKey = $state(0);
  let currentLoginId = $state(0);

  // Settings

  // Settings dialog
  let showSettings = $state(false);
  type SettingsTab = "profiles" | "regions" | "services";
  let settingsTab = $state<SettingsTab>("profiles");

  // Service Dropdown
  let dropdownOpen = $state(false);
  let sideMenuOpen = $state(window.innerWidth >= 640);
  let rightPanelOpen = $state(false);
  let searchQuery = $state("");

  let filteredServices = $derived(
    services.filter((s) =>
      s.label.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  let mobileServices = $derived.by(() => {
    const query = searchQuery.toLowerCase();
    const all = services
      .filter((s) => s.label.toLowerCase().includes(query))
      .filter((s) => s.label.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarred = serviceVisible.has(a.id);
        const bStarred = serviceVisible.has(b.id);
        if (aStarred && !bStarred) return -1;
        if (!aStarred && bStarred) return 1;
        return a.label.localeCompare(b.label);
      });

    return all.map((svc, i) => ({
      ...svc,
      isStarred: serviceVisible.has(svc.id),
      prevIsStarred: i > 0 ? serviceVisible.has(all[i - 1].id) : true,
    }));
  });

  function toggleStar(id: string, e: MouseEvent) {
    e.stopPropagation();
    const next = new Set(serviceVisible);
    const wasStarred = next.has(id);
    if (wasStarred) next.delete(id);
    else next.add(id);
    serviceVisible = next;
    saveState();

    if (!wasStarred) {
      // If we just starred it, switch to it and close
      switchTab(id);
    }
  }

  // Derived
  let visibleProfiles = $derived(
    profileOrder.filter((p) => profileVisible.has(p)),
  );
  let visibleRegions = $derived(
    regionOrder.filter((r) => regionVisible.has(r)),
  );
  let orderedServices = $derived(
    serviceOrder
      .map((id) => services.find((s) => s.id === id)!)
      .filter(Boolean),
  );
  const enabledServices = $derived(
    orderedServices.filter((s) => serviceVisible.has(s.id))
  );

  // To highlight active tab on top
  let activeId = $derived($page.url.pathname.split("/")[1] || "");
  let serviceTitle = $derived(
    titleService.parts.map((p) => p.label).join(" > ") || "CloudDash for AWS",
  );

  $effect(() => {
    titleService.updateFromUrl($page.url.pathname);
    bookmarks.currentUrl = $page.url.pathname + $page.url.search;

    if (!settings.isPro && activeId && activeId !== "settings" && activeId !== "upgrade" && !["cloudwatch", "s3", "dynamodb"].includes(activeId)) {
        goto("/upgrade", { replaceState: true });
        return;
    }

    if ($page.url.pathname !== "/") {
      localStorage.setItem("aws_console_last_url", $page.url.pathname + $page.url.search);
    }

    if (Object.keys($page.params).length === 0) {
      const manifest = SERVICE_MANIFEST[activeId];
      if (manifest && serviceActiveTab !== undefined) {
        const resourceName =
          manifest.tabs[serviceActiveTab] ?? manifest.tabs[""];
        if (resourceName) {
          titleService.setResource(resourceName, undefined, $page.url.pathname);
        }
      }
    }
  });
  let serviceTabs = $derived.by(() => {
    const manifest = SERVICE_MANIFEST[activeId];
    if (!manifest) return $page.data.tabs || [];

    // Convert Record<id, label> to Array<{id, label}>
    let tabs = Object.entries(manifest.tabs).map(([id, label]) => ({
      id,
      label,
    }));

    // Transform tabs using generic manifest-driven logic
    tabs = transformTabsGeneric(tabs, $page, manifest);

    return tabs;
  });

  let serviceActiveTab = $derived(
    $page.data.activeTab ||
      $page.url.pathname.split("/").slice(2).join("/") ||
      "",
  );

  function handleServiceTabChange(tabId: string) {
    const url = new URL($page.url);
    // If it's a relative-like tab change within the service
    url.pathname = `/${activeId}/${tabId}`;
    goto(url.toString());
  }

  function loadState() {
    try {
      const r = localStorage.getItem(STORAGE_KEY);
      return r ? JSON.parse(r) : null;
    } catch {
      return null;
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profile: selectedProfile,
        region,
        profileOrder,
        profileVisible: [...profileVisible],
        regionOrder,
        regionVisible: [...regionVisible],
        serviceOrder,
        serviceVisible: [...serviceVisible],
        authType,
        accountId,
        roleName,
        sourceProfile,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        saveProfileChecked,
        saveProfileName,
        activeId: activeId, // Save last active route to redirect later
        sideMenuOpen,
      }),
    );
  }

  onMount(async () => {
    try {
      os = await invoke("get_os");
    } catch {
      os = "windows";
    }

    const initialState = await invoke<{
      path: string | null;
      region: string | null;
      profile: string | null;
    }>("get_initial_state");

    const saved = loadState();

    // Load profiles from Rust
    try {
      allProfiles = await invoke("list_profiles");
    } catch {
      allProfiles = ["default"];
    }

    // Restore profile order/visibility
    if (saved?.profileOrder) {
      const known = new Set(saved.profileOrder);
      const newOnes = allProfiles.filter((p) => !known.has(p));
      profileOrder = [
        ...saved.profileOrder.filter((p: string) => allProfiles.includes(p)),
        ...newOnes,
      ];
    } else {
      profileOrder = [...allProfiles];
    }
    profileVisible = saved?.profileVisible
      ? new Set(saved.profileVisible)
      : new Set(allProfiles);

    // Restore region order/visibility
    if (saved?.regionOrder) {
      const known = new Set(saved.regionOrder);
      const newOnes = ALL_REGIONS.filter((r) => !known.has(r));
      regionOrder = [
        ...saved.regionOrder.filter((r: string) => ALL_REGIONS.includes(r)),
        ...newOnes,
      ];
    }
    if (saved?.regionVisible) regionVisible = new Set(saved.regionVisible);

    // Restore service order/visibility
    if (saved?.serviceOrder) {
      const known = new Set(saved.serviceOrder);
      const newOnes = services.map((s) => s.id).filter((id) => !known.has(id));
      serviceOrder = [
        ...saved.serviceOrder.filter((id: string) =>
          services.some((s) => s.id === id),
        ),
        ...newOnes,
      ];
    }
    if (saved?.serviceVisible) serviceVisible = new Set(saved.serviceVisible);
    else serviceVisible = new Set(["cloudwatch", "s3", "dynamodb"]);

    // Restore profile/region and auto-login
    let noRealProfiles =
      allProfiles.length === 0 ||
      (allProfiles.length === 1 && allProfiles[0] === "default");

    if (saved?.authType) {
      authType = saved.authType;
    } else if (isMobile && noRealProfiles) {
      authType = "qr";
    }

    if (saved?.accessKeyId) accessKeyId = saved.accessKeyId;
    if (saved?.secretAccessKey) secretAccessKey = saved.secretAccessKey;
    if (saved?.sessionToken) sessionToken = saved.sessionToken;
    if (saved?.accountId) accountId = saved.accountId;
    if (saved?.roleName) roleName = saved.roleName;
    if (saved?.sourceProfile) sourceProfile = saved.sourceProfile;
    if (saved?.saveProfileChecked)
      saveProfileChecked = saved.saveProfileChecked;
    if (saved?.saveProfileName) saveProfileName = saved.saveProfileName;
    if (saved?.sideMenuOpen !== undefined && window.innerWidth >= 640) {
      sideMenuOpen = saved.sideMenuOpen;
    } else if (window.innerWidth < 640) {
      sideMenuOpen = false;
    }


    // Apply initial state from environment variables (forked process)
    if (initialState.profile && allProfiles.includes(initialState.profile)) {
      selectedProfile = initialState.profile;
      authType = "profile";
    } else if (saved?.profile && allProfiles.includes(saved.profile)) {
      selectedProfile = saved.profile;
    } else if (allProfiles.length > 0) {
      selectedProfile = allProfiles[0];
    }

    if (initialState.region) {
      region = initialState.region;
    } else if (saved?.region) {
      region = saved.region;
    }

    // Auto connect
    let shouldAutoConnect = false;
    if (authType === "manual" && accessKeyId && secretAccessKey) {
      shouldAutoConnect = true;
    } else if (authType === "profile" && selectedProfile) {
      if (
        selectedProfile !== "default" ||
        saved?.profile === "default" ||
        initialState.profile
      ) {
        shouldAutoConnect = true;
      }
    }

    if (shouldAutoConnect) {
      await login(true, initialState.path || null);
    }
  });

  function switchAuthType(type: "profile" | "manual" | "assume" | "qr") {
    authType = type;
    currentLoginId++;
    loading = false;
    error = "";
  }

  async function login(silent = false, initialPath: string | null = null) {
    const loginId = ++currentLoginId;
    try {
      loading = true;
      error = "";

      if (authType === "manual") {
        if (!saveProfileName.trim()) {
          throw "Profile Name is required.";
        }

        let properties: Record<string, string> = { region: region || "" };

        if (!accessKeyId.trim() || !secretAccessKey.trim()) {
          throw "Access Key ID and Secret Access Key are required.";
        }
        properties["aws_access_key_id"] = accessKeyId.trim();
        properties["aws_secret_access_key"] = secretAccessKey.trim();
        if (sessionToken.trim())
          properties["aws_session_token"] = sessionToken.trim();

        await invoke("save_profile", {
          name: saveProfileName.trim(),
          properties,
        });

        selectedProfile = saveProfileName.trim();
        authType = "profile";

        try {
          allProfiles = await invoke("list_profiles");
        } catch {
          allProfiles = [selectedProfile];
        }

        if (!profileOrder.includes(selectedProfile)) {
          profileOrder = [...profileOrder, selectedProfile];
        }
        profileVisible.add(selectedProfile);
        profileVisible = profileVisible; // Force reactivity
      } else if (authType === "assume") {
        if (!saveProfileName.trim()) {
          throw "Profile Name is required.";
        }

        let properties: Record<string, string> = { region: region || "" };

        if (!accountId.trim() || !roleName.trim() || !sourceProfile.trim()) {
          throw "Account ID, Role Name, and Source Profile are required.";
        }
        properties["role_arn"] =
          `arn:aws:iam::${accountId.trim()}:role/${roleName.trim()}`;
        properties["source_profile"] = sourceProfile.trim();

        await invoke("save_profile", {
          name: saveProfileName.trim(),
          properties,
        });

        selectedProfile = saveProfileName.trim();
        authType = "profile";

        try {
          allProfiles = await invoke("list_profiles");
        } catch {
          allProfiles = [selectedProfile];
        }

        if (!profileOrder.includes(selectedProfile)) {
          profileOrder = [...profileOrder, selectedProfile];
        }
        profileVisible.add(selectedProfile);
        profileVisible = profileVisible; // Force reactivity
      }

      let finalCreds = null;
      let targetRegion = region || "us-east-1";

      if (authType === "qr") {
        finalCreds = {
          access_key_id: accessKeyId,
          secret_access_key: secretAccessKey,
          session_token: sessionToken || null,
          region: targetRegion,
        };
      } else {
        // All other types fall through to "profile"
        const profiles = (await invoke("get_all_profiles")) as any[];
        const target = profiles.find((p) => p.profile === selectedProfile);
        if (!target) throw new Error("Profile not found");

        targetRegion = target.region || region || "us-east-1";

        if (target.role_arn && target.source_profile) {
          const source = profiles.find(
            (p) => p.profile === target.source_profile,
          );
          if (!source)
            throw new Error(
              `Source profile ${target.source_profile} not found`,
            );

          const { STSClient, AssumeRoleCommand } = await import(
            "@aws-sdk/client-sts"
          );
          const { customRequestHandler } = await import(
            "$lib/services/aws.svelte"
          );

          const sts = new STSClient({
            region: targetRegion,
            credentials: {
              accessKeyId: source.aws_access_key_id,
              secretAccessKey: source.aws_secret_access_key,
              sessionToken: source.aws_session_token || undefined,
            },
            requestHandler: customRequestHandler,
          });

          const res = await sts.send(
            new AssumeRoleCommand({
              RoleArn: target.role_arn,
              RoleSessionName: "CloudDashSession",
            }),
          );

          if (!res.Credentials) throw new Error("STS returned no credentials");

          finalCreds = {
            access_key_id: res.Credentials.AccessKeyId!,
            secret_access_key: res.Credentials.SecretAccessKey!,
            session_token: res.Credentials.SessionToken || null,
            region: targetRegion,
          };
        } else {
          if (!target.aws_access_key_id)
            throw new Error("Profile has no access keys");
          finalCreds = {
            access_key_id: target.aws_access_key_id,
            secret_access_key: target.aws_secret_access_key,
            session_token: target.aws_session_token || null,
            region: targetRegion,
          };
        }
      }

      if (loginId !== currentLoginId) return;

      isAuthenticated = true;
      error = "";
      aws.setCredentials(finalCreds);
      refreshKey++;
      saveState();

      // Auto redirect to last saved service if we are at root
      if ($page.url.pathname === "/") {
        let lastUrl = localStorage.getItem("aws_console_last_url");
        if (!initialPath && lastUrl && lastUrl !== "/") {
          const svcId = lastUrl.split('/')[1];
          // ensure the reconstructed service tab is actually visible
          if (svcId && serviceVisible.has(svcId.split('?')[0])) {
            goto(lastUrl);
            return;
          }
        }

        let fallbackId = loadState()?.activeId;
        let n = initialPath || fallbackId;
        if (!n || !serviceVisible.has(n)) {
          const first = enabledServices[0];
          n = first ? first.id : "";
        }
        if (n) {
          goto(`/${n}`);
        }
      }
    } catch (e) {
      if (loginId === currentLoginId && !silent) error = e as string;
    } finally {
      if (loginId === currentLoginId) loading = false;
    }
  }

  function switchTab(id: string, event?: MouseEvent) {
    if (!isMobile && (event?.ctrlKey || event?.metaKey)) {
      invoke("fork_process", {
        path: id,
        region,
        profile: authType === "profile" ? selectedProfile : undefined,
      });
      return;
    }
    // Rely completely on SvelteKit routing for top tabs
    goto(`/${id}`);
    saveState();
  }
</script>

<main
  class="absolute inset-0 bg-gray-950 text-white flex flex-col font-sans overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
>
  {#if !isAuthenticated}
    <Login
      {os}
      bind:authType
      bind:accountId
      bind:roleName
      bind:sourceProfile
      bind:selectedProfile
      bind:accessKeyId
      bind:secretAccessKey
      bind:sessionToken
      bind:saveProfileName
      bind:region
      visibleProfiles={allProfiles
        .filter((p) => profileVisible.has(p))
        .sort((a, b) => profileOrder.indexOf(a) - profileOrder.indexOf(b))}
      visibleRegions={ALL_REGIONS.filter((r) => regionVisible.has(r)).sort(
        (a, b) => regionOrder.indexOf(a) - regionOrder.indexOf(b),
      )}
      {loading}
      {error}
      onLogin={() => login()}
      onSwitchAuthType={switchAuthType}
      onProfilesSaved={async () => {
        try {
          allProfiles = await invoke("list_profiles");
        } catch {
          if (!allProfiles.includes("default")) allProfiles = ["default"];
        }
        let newOrder = [...profileOrder];
        for (let p of allProfiles) {
          if (!newOrder.includes(p)) newOrder.push(p);
          profileVisible.add(p);
        }
        profileOrder = newOrder;
        profileVisible = new Set(profileVisible);
        saveState();
      }}
    />
  {:else}
    <div class="flex h-full w-full overflow-hidden relative">
      {#if sideMenuOpen}
        <!-- Overlay for mobile -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity sm:hidden z-[150]"
          onclick={() => (sideMenuOpen = false)}
        ></div>
      {/if}

      <!-- Left Sidebar -->
      <div
        class="absolute sm:static inset-y-0 left-0 z-[160] sm:z-auto w-72 max-w-[85vw] bg-gray-900 shadow-2xl sm:shadow-none flex flex-col border-r border-gray-800 shrink-0 transition-all duration-300 {sideMenuOpen
          ? 'translate-x-0 sm:ml-0'
          : '-translate-x-full sm:-ml-72'}"
      >
        <div
          class="p-3 border-b border-gray-800 flex items-center justify-between bg-gray-950 shrink-0"
        >
          <div class="flex items-center gap-2">
            <img src="/logo.png" alt="CloudDash" class="h-5 w-5" />
            <span class="text-sm font-bold text-gray-100 tracking-tight"
              >CloudDash for AWS</span
            >
            {#if settings.isPro}
              <span class="px-1.5 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] font-black rounded border border-blue-500/30 uppercase tracking-tighter">Pro</span>
            {/if}
          </div>
          <button
            onclick={() => (sideMenuOpen = false)}
            class="p-1.5 rounded-full hover:bg-gray-800 text-gray-400 transition sm:hidden"
          >
            ✕
          </button>
        </div>

        <!-- Services List -->

        <div class="flex-1 overflow-y-auto p-4 space-y-8 pb-10">
          <!-- Services -->
          <div class="space-y-4">
            <div class="space-y-4">
              <div class="px-1 space-y-3">
                {#if !settings.isPro}
                  <a
                    href="/upgrade"
                    onclick={(e) => {
                         e.preventDefault();
                         goto("/upgrade");
                         if (window.innerWidth < 640) sideMenuOpen = false;
                    }}
                    class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-[11px] font-bold py-2 rounded flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all border border-blue-500/50"
                  >
                    <span class="text-sm">👑</span>
                    Upgrade to Pro
                  </a>
                {/if}
                <input
                  type="text"
                  bind:value={searchQuery}
                  placeholder="Search services..."
                  class="w-full bg-black border border-gray-800 rounded p-2.5 text-xs text-white outline-none focus:border-blue-500 transition shadow-inner"
                />
              </div>

              <div class="grid grid-cols-1 gap-1">
                {#each mobileServices as svc, i (svc.id)}
                  <div animate:flip={{ duration: 300 }}>
                    {#if !searchQuery && !svc.isStarred && svc.prevIsStarred}
                      <div class="mt-4 mb-2 px-2 pb-1 border-b border-gray-800">
                        <span
                          class="text-[10px] font-bold text-gray-300 uppercase tracking-widest"
                          >All Services</span
                        >
                      </div>
                    {/if}

                    <div class="space-y-1">
                      <div
                        class="flex items-center justify-between w-full px-1 rounded {activeId ===
                        svc.id
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                          : 'hover:bg-gray-800 text-gray-300 border border-transparent'} transition text-left"
                      >
                        <button
                          onclick={() => {
                            if (!settings.isPro && !["cloudwatch", "s3", "dynamodb"].includes(svc.id)) {
                                goto("/upgrade");
                                if (window.innerWidth < 640) sideMenuOpen = false;
                                return;
                            }
                            switchTab(svc.id);
                            if (window.innerWidth < 640) sideMenuOpen = false;
                          }}
                          class="flex-1 px-2 py-3 text-xs font-semibold text-left flex items-center gap-2"
                        >
                          {svc.label}
                          {#if !settings.isPro && !["cloudwatch", "s3", "dynamodb"].includes(svc.id)}
                            <span class="text-yellow-500 text-[10px]" title="Pro Service">👑</span>
                          {/if}
                          {#if activeId === svc.id}
                            <div class="w-1 h-1 rounded-full bg-blue-500"></div>
                          {/if}
                        </button>
                        <button
                          class="px-3 py-3 text-xs hover:scale-110 transition {svc.isStarred
                            ? 'text-yellow-400'
                            : 'text-gray-700 hover:text-gray-500'}"
                          onclick={(e) => toggleStar(svc.id, e)}
                        >
                          {svc.isStarred ? "★" : "☆"}
                        </button>
                      </div>

                      {#if activeId === svc.id && serviceTabs.length > 1}
                        <div
                          class="ml-4 flex flex-col border-l border-gray-800 bg-gray-900/30 rounded-r"
                        >
                          {#each serviceTabs as tab}
                            <button
                              onclick={() => {
                                handleServiceTabChange(tab.id);
                                if (window.innerWidth < 640)
                                  sideMenuOpen = false;
                              }}
                              class="w-full text-left px-4 py-2.5 text-[11px] transition {serviceActiveTab ===
                                tab.id ||
                              (tab.id &&
                                serviceActiveTab.startsWith(tab.id + '/'))
                                ? 'text-blue-400 font-bold bg-blue-500/10'
                                : 'text-gray-300 hover:text-white hover:bg-gray-800'}"
                            >
                              {tab.label}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}

                {#if mobileServices.length === 0}
                  <div class="p-8 text-center">
                    <div class="text-gray-600 text-xs italic">
                      No services found matching "{searchQuery}"
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <!-- Account & Region Footer -->
        <div
          class="p-2 border-t border-gray-800 bg-gray-950/80 backdrop-blur-sm space-y-4 shrink-0"
        >
          <div class="grid grid-cols-1 gap-3">
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <span class="text-[10px] text-gray-300 px-1">Profile</span>
                {#if authType === "profile"}
                  <select
                    bind:value={selectedProfile}
                    onchange={() => {
                      if (selectedProfile === "__add_profile__") {
                        selectedProfile = visibleProfiles[0] || "default";
                        isAuthenticated = false;
                        if (window.innerWidth < 640) sideMenuOpen = false;
                        return;
                      }
                      login();
                      if (window.innerWidth < 640) sideMenuOpen = false;
                    }}
                    class="w-full bg-gray-800 text-[11px] p-2 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
                  >
                    {#each visibleProfiles as p}<option value={p}>{p}</option
                      >{/each}
                    <option
                      value="__add_profile__"
                      class="font-bold text-green-400">+ Add Profile...</option
                    >
                  </select>
                {:else}
                  <div
                    class="w-full bg-gray-800 text-[11px] p-2 rounded text-blue-400 font-mono border border-gray-700 truncate"
                  >
                    🔑 Custom
                  </div>
                {/if}
              </div>

              <div class="space-y-1">
                <span class="text-[10px] text-gray-300 px-1">Region</span>
                <select
                  bind:value={region}
                  onchange={() => {
                    login();
                    if (window.innerWidth < 640) sideMenuOpen = false;
                  }}
                  class="w-full bg-gray-800 text-[11px] p-2 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
                >
                  {#each visibleRegions as r}<option value={r}>{r}</option
                    >{/each}
                </select>
              </div>
            </div>

            <div class="flex gap-2">
              <button
                onclick={() => {
                  refreshKey++;
                  if (window.innerWidth < 640) sideMenuOpen = false;
                }}
                class="flex-1 bg-gray-900 hover:bg-gray-800 p-2 rounded text-[11px] font-semibold border border-gray-800 transition flex items-center justify-center gap-1.5 text-white"
                title="Refresh data"
              >
                <span>⟳</span>
              </button>
              <button
                onclick={() => {
                  showSettings = true;
                  settingsTab = "profiles";
                  if (window.innerWidth < 640) sideMenuOpen = false;
                }}
                class="flex-1 bg-gray-900 hover:bg-gray-800 p-2 rounded text-[11px] font-semibold border border-gray-800 transition flex items-center justify-center gap-1.5 text-white"
                title="Settings"
              >
                <span>⚙</span>
              </button>
              {#if !isMobile}
                <button
                  onclick={() => {
                    invoke("fork_process", {
                      path: activeId,
                      region,
                      profile:
                        authType === "profile" ? selectedProfile : undefined,
                    });
                    if (window.innerWidth < 640) sideMenuOpen = false;
                  }}
                  class="flex-[2] bg-blue-600 hover:bg-blue-500 p-2 rounded text-[11px] font-bold transition flex items-center justify-center gap-1.5 text-white shadow-lg"
                  title="Fork to new window"
                >
                  <span>⧉</span> Fork
                </button>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        <!-- Unified Top Bar -->
        <header
          class="flex items-center bg-gray-900 border-b border-gray-800 shrink-0 px-3 py-2 gap-3"
        >
          <div class="flex items-center gap-1">
            <button
              onclick={() => (sideMenuOpen = !sideMenuOpen)}
              class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition"
              title="Toggle Sidebar"
            >
              <span class="text-xl">☰</span>
            </button>
          </div>

          <div class="sm:hidden flex items-center">
            {#if titleService.parts.length > 1}
              <BackButton
                href={titleService.parts[titleService.parts.length - 2].href}
              />
            {/if}
          </div>

          <div
            class="flex items-center gap-1.5 text-sm font-bold truncate flex-1 text-white min-w-0"
          >
            {#if titleService.parts.length === 0}
              <span>CloudDash for AWS</span>
            {:else}
              {#each titleService.parts as part, i}
                {#if i > 0}
                  <span class="text-gray-600 shrink-0 hidden sm:inline">/</span>
                {/if}
                <a
                  href={part.href || "javascript:void(0)"}
                  class="hover:text-blue-400 transition-colors truncate {i <
                  titleService.parts.length - 1
                    ? 'hidden sm:inline text-gray-500 font-medium'
                    : ''}"
                  onclick={(e) => {
                    if (!part.href) e.preventDefault();
                  }}
                >
                  {part.label}
                </a>
              {/each}
            {/if}
          </div>

          <button
            onclick={() => (rightPanelOpen = !rightPanelOpen)}
            class="p-1.5 rounded transition {bookmarks.isBookmarked
              ? 'text-yellow-400'
              : 'text-gray-400'} hover:bg-gray-800"
            title="Bookmarks"
          >
            {#if bookmarks.isBookmarked}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
            {/if}
          </button>
        </header>

        {#if error}
          <div
            class="bg-red-500/20 text-red-300 px-3 py-1.5 text-xs border-b border-red-500/30 shrink-0"
          >
            {error}
          </div>
        {/if}

        <div class="flex-1 overflow-hidden relative flex flex-col min-w-0">
          <ServiceLayout
            title={serviceTitle}
            tabs={serviceTabs}
            activeTab={serviceActiveTab}
            onTabChange={handleServiceTabChange}
          >
            <div class="absolute inset-0">
              {#key refreshKey}
                {@render children()}
              {/key}
            </div>
          </ServiceLayout>
        </div>
      </div>

      {#if rightPanelOpen}
        <!-- Right Panel Overlay -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm z-[200]"
          onclick={() => (rightPanelOpen = false)}
          transition:fade={{ duration: 200 }}
        ></div>

        <!-- Right Sliding Panel -->
        <div
          class="absolute inset-y-0 right-0 w-80 max-w-[90vw] bg-gray-900 border-l border-gray-800 shadow-2xl z-[210] flex flex-col overflow-hidden"
          transition:fly={{ x: 320, duration: 300 }}
        >
          <div
            class="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/50"
          >
            <h2 class="font-bold text-gray-100 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark text-yellow-400"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
              Bookmarks
            </h2>
            <button
              onclick={() => (rightPanelOpen = false)}
              class="p-2 rounded-full hover:bg-gray-800 text-gray-400 transition"
            >
              ✕
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <button
              onclick={() => {
                let label = serviceTitle;
                if (serviceActiveTab) label += ` - ${serviceActiveTab}`;
                bookmarks.toggle(label);
              }}
              class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition shadow-lg shrink-0"
            >
              <span class={bookmarks.isBookmarked ? "text-yellow-300" : ""}>
                {#if bookmarks.isBookmarked}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                {/if}
              </span>
              <span>
                {bookmarks.isBookmarked
                  ? "Remove Current Page"
                  : "Bookmark Current Page"}
              </span>
            </button>

            <div class="grid grid-cols-1 gap-2 mt-4">
              {#each bookmarks.all as bkm}
                <div
                  class="group flex items-center w-full bg-gray-800/50 border border-gray-800 rounded hover:border-blue-500/50 hover:bg-gray-800 transition overflow-hidden"
                >
                  <button
                    onclick={() => {
                      goto(bkm.url);
                      rightPanelOpen = false;
                    }}
                    class="flex-1 px-3 py-3 text-left transition"
                  >
                    <span
                      class="text-xs text-blue-400 font-medium break-words leading-snug block"
                      >{bkm.label}</span
                    >
                  </button>
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      bookmarks.remove(bkm.id);
                    }}
                    class="p-3 text-gray-600 hover:text-red-400 transition"
                    title="Remove bookmark"
                  >
                    ✕
                  </button>
                </div>
              {/each}
              {#if bookmarks.all.length === 0}
                <div class="py-12 text-center">
                  <div class="text-gray-600 text-sm italic mb-2">
                    No bookmarks yet.
                  </div>
                  <div class="text-gray-700 text-[10px]">
                    Add pages to quickly access them later.
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <SettingsDialog
      bind:open={showSettings}
      bind:profileOrder
      bind:profileVisible
      bind:regionOrder
      bind:regionVisible
      bind:serviceOrder
      bind:serviceVisible
      services={services as any}
      onChange={saveState}
    />
  {/if}
  <ToastContainer />
</main>
