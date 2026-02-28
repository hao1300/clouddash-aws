<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { services, type ServiceDef } from "$lib/services/registry";

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

  let allProfiles = $state<string[]>([]);
  let selectedProfile = $state("default");
  let region = $state("us-east-1");
  let authType = $state<"profile" | "manual" | "sso">("profile");

  // Custom API Keys
  let accessKeyId = $state("");
  let secretAccessKey = $state("");
  let sessionToken = $state("");
  let saveProfileChecked = $state(false);
  let saveProfileName = $state("");

  // SSO Login
  let ssoProfileName = $state("");
  let ssoStartUrl = $state("");
  let ssoRegion = $state("");
  let ssoAccountId = $state("");
  let ssoRoleName = $state("");

  let isAuthenticated = $state(false);
  let loading = $state(false);
  let error = $state("");

  // Ordered + visibility lists  (ids/strings stored in order, with a visibility set)
  let profileOrder = $state<string[]>([]);
  let profileVisible = $state<Set<string>>(new Set());
  let regionOrder = $state<string[]>([...ALL_REGIONS]);
  let regionVisible = $state<Set<string>>(new Set(ALL_REGIONS));
  let serviceOrder = $state<string[]>(services.map((s) => s.id));
  let serviceVisible = $state<Set<string>>(new Set(services.map((s) => s.id)));

  let activeId = $state(services[0]?.id ?? "");
  let refreshKey = $state(0);
  let currentLoginId = $state(0);

  // Settings dialog
  let showSettings = $state(false);
  type SettingsTab = "profiles" | "regions" | "services";
  let settingsTab = $state<SettingsTab>("profiles");

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
  let enabledServices = $derived(
    orderedServices.filter((s) => serviceVisible.has(s.id)),
  );
  let activeService = $derived(services.find((s) => s.id === activeId));

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
        activeId,
        authType,
        accessKeyId,
        secretAccessKey,
        sessionToken,
        saveProfileChecked,
        saveProfileName,
        ssoProfileName,
        ssoStartUrl,
        ssoRegion,
        ssoAccountId,
        ssoRoleName,
      }),
    );
  }

  onMount(async () => {
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
    else
      serviceVisible = new Set(
        services.filter((s) => s.defaultEnabled).map((s) => s.id),
      );

    // Restore active tab
    if (saved?.activeId && serviceVisible.has(saved.activeId))
      activeId = saved.activeId;
    else {
      const first = enabledServices[0];
      if (first) activeId = first.id;
    }

    // Restore profile/region and auto-login
    if (saved?.authType) authType = saved.authType;
    if (saved?.accessKeyId) accessKeyId = saved.accessKeyId;
    if (saved?.secretAccessKey) secretAccessKey = saved.secretAccessKey;
    if (saved?.sessionToken) sessionToken = saved.sessionToken;
    if (saved?.saveProfileChecked)
      saveProfileChecked = saved.saveProfileChecked;
    if (saved?.saveProfileName) saveProfileName = saved.saveProfileName;
    if (saved?.ssoProfileName) ssoProfileName = saved.ssoProfileName;
    if (saved?.ssoStartUrl) ssoStartUrl = saved.ssoStartUrl;
    if (saved?.ssoRegion) ssoRegion = saved.ssoRegion;
    if (saved?.ssoAccountId) ssoAccountId = saved.ssoAccountId;
    if (saved?.ssoRoleName) ssoRoleName = saved.ssoRoleName;

    if (saved?.profile && allProfiles.includes(saved.profile))
      selectedProfile = saved.profile;
    else if (allProfiles.length > 0) selectedProfile = allProfiles[0];
    if (saved?.region) region = saved.region;

    // Auto connect only if we have explicit manual keys, or if profile is explicitly something
    // other than 'default', OR if we have actively saved 'default' as a known working profile previously
    let shouldAutoConnect = false;
    if (authType === "manual" && accessKeyId && secretAccessKey) {
      shouldAutoConnect = true;
    } else if (authType === "profile" && selectedProfile) {
      if (selectedProfile !== "default" || saved?.profile === "default") {
        shouldAutoConnect = true;
      }
    }

    if (shouldAutoConnect) {
      await login(true);
    }
  });

  function switchAuthType(type: "profile" | "manual" | "sso") {
    authType = type;
    currentLoginId++;
    loading = false;
    error = "";
  }

  async function login(silent = false) {
    const loginId = ++currentLoginId;
    try {
      loading = true;
      error = "";

      if (authType === "sso") {
        if (
          !ssoProfileName ||
          !ssoStartUrl ||
          !ssoRegion ||
          !ssoAccountId ||
          !ssoRoleName
        ) {
          if (loginId !== currentLoginId) return;
          error = "All SSO fields are required to establish a session.";
          loading = false;
          return;
        }

        await invoke("save_sso_profile", {
          name: ssoProfileName,
          startUrl: ssoStartUrl,
          ssoRegion,
          accountId: ssoAccountId,
          roleName: ssoRoleName,
          region,
        });

        try {
          allProfiles = await invoke("list_profiles");
        } catch {}

        if (!profileOrder.includes(ssoProfileName)) {
          profileOrder = [...profileOrder, ssoProfileName];
        }
        profileVisible.add(ssoProfileName);
        selectedProfile = ssoProfileName;
        authType = "profile";
      }

      await invoke("authenticate", {
        payload: {
          auth_type: authType,
          profile: authType === "profile" ? selectedProfile : undefined,
          region,
          access_key_id: authType === "manual" ? accessKeyId : undefined,
          secret_access_key:
            authType === "manual" ? secretAccessKey : undefined,
          session_token: authType === "manual" ? sessionToken : undefined,
        },
      });

      if (loginId !== currentLoginId) return;

      isAuthenticated = true;
      error = "";
      refreshKey++;
      saveState();
    } catch (e) {
      if (loginId === currentLoginId && !silent) error = e as string;
    } finally {
      if (loginId === currentLoginId) loading = false;
    }
  }

  function switchTab(id: string) {
    activeId = id;
    refreshKey++;
    saveState();
  }

  // Generic reorder helpers
  function moveItem<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
    const n = idx + dir;
    if (n < 0 || n >= arr.length) return arr;
    const copy = [...arr];
    [copy[idx], copy[n]] = [copy[n], copy[idx]];
    return copy;
  }

  function toggleInSet(s: Set<string>, id: string, minSize = 1): Set<string> {
    const next = new Set(s);
    if (next.has(id)) {
      if (next.size > minSize) next.delete(id);
    } else next.add(id);
    return next;
  }

  // Profile
  function moveProfile(idx: number, dir: -1 | 1) {
    profileOrder = moveItem(profileOrder, idx, dir);
    saveState();
  }
  function toggleProfile(id: string) {
    profileVisible = toggleInSet(profileVisible, id, 1);
    saveState();
  }

  // Region
  function moveRegion(idx: number, dir: -1 | 1) {
    regionOrder = moveItem(regionOrder, idx, dir);
    saveState();
  }
  function toggleRegion(id: string) {
    regionVisible = toggleInSet(regionVisible, id, 1);
    saveState();
  }

  // Service
  function moveService(idx: number, dir: -1 | 1) {
    serviceOrder = moveItem(serviceOrder, idx, dir);
    saveState();
  }
  function toggleService(id: string) {
    serviceVisible = toggleInSet(serviceVisible, id, 1);
    if (!serviceVisible.has(activeId)) {
      const first = serviceOrder.find((sid) => serviceVisible.has(sid));
      if (first) {
        activeId = first;
        refreshKey++;
      }
    }
    saveState();
  }
</script>

<main
  class="absolute inset-0 bg-gray-950 text-white flex flex-col font-sans overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
>
  {#if !isAuthenticated}
    <div class="flex items-center justify-center flex-1 p-4">
      <div
        class="w-full max-w-sm bg-gray-900 p-6 rounded-xl shadow-2xl border border-gray-800"
      >
        <h1 class="text-xl font-bold mb-4 text-blue-400">AWS Console</h1>
        {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 rounded mb-3 text-xs"
          >
            {error}
          </div>{/if}
        <div class="space-y-3">
          <div>
            <div
              class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
            >
              Login Method
            </div>
            <div class="flex gap-2" role="group" aria-label="Login Method">
              <button
                onclick={() => switchAuthType("profile")}
                class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                'profile'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
                >Profile</button
              >
              <button
                onclick={() => switchAuthType("manual")}
                class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                'manual'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
                >API Keys</button
              >
              <button
                onclick={() => switchAuthType("sso")}
                class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                'sso'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
                >AWS SSO</button
              >
            </div>
          </div>

          {#if authType === "profile"}
            <div>
              <label
                for="profileSelect"
                class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                >Profile</label
              >
              <select
                id="profileSelect"
                bind:value={selectedProfile}
                class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500"
              >
                {#each visibleProfiles as p}<option value={p}>{p}</option
                  >{/each}
              </select>
            </div>
          {:else if authType === "manual"}
            <div>
              <label
                for="akInput"
                class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                >Access Key ID</label
              >
              <input
                id="akInput"
                type="text"
                bind:value={accessKeyId}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
              />
            </div>
            <div>
              <label
                for="skInput"
                class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                >Secret Access Key</label
              >
              <input
                id="skInput"
                type="password"
                bind:value={secretAccessKey}
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
              />
            </div>
            <div>
              <label class="flex items-center gap-2 cursor-pointer mt-2 mb-1">
                <input
                  type="checkbox"
                  bind:checked={saveProfileChecked}
                  class="accent-blue-500 rounded bg-gray-900 border-gray-700"
                />
                <span class="text-xs text-gray-300"
                  >Save as Profile in ~/.aws</span
                >
              </label>
              {#if saveProfileChecked}
                <input
                  type="text"
                  bind:value={saveProfileName}
                  placeholder="Profile name (e.g. prod-admin)"
                  class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                />
              {/if}
            </div>
            <div class="mt-2">
              <label
                for="stInput"
                class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                >Session Token <span class="text-[10px] opacity-70"
                  >(Optional)</span
                ></label
              >
              <textarea
                id="stInput"
                bind:value={sessionToken}
                rows="2"
                placeholder="IQoJb3JpZ2luX2VjEBs..."
                class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono resize-none"
              ></textarea>
            </div>
          {:else if authType === "sso"}
            <div
              class="bg-blue-500/10 border border-blue-500/20 p-3 rounded text-xs text-blue-300 mb-4 leading-relaxed"
            >
              <strong>SSO Web Login:</strong> This will create an AWS SSO
              profile in your <code>~/.aws/config</code> and execute
              <code>aws sso login</code>, which securely opens your web browser
              to authenticate.
            </div>
            <div>
              <label
                for="ssoProfileInput"
                class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                >Profile Name</label
              >
              <input
                id="ssoProfileInput"
                type="text"
                bind:value={ssoProfileName}
                placeholder="my-sso-admin"
                class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
              />
            </div>
            <div>
              <label
                for="ssoUrlInput"
                class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                >Start URL</label
              >
              <input
                id="ssoUrlInput"
                type="text"
                bind:value={ssoStartUrl}
                placeholder="https://d-12345.awsapps.com/start"
                class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
              />
            </div>
            <div class="flex flex-col sm:flex-row gap-2">
              <div class="flex-1">
                <label
                  for="ssoRegInput"
                  class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                  >SSO Region</label
                >
                <input
                  id="ssoRegInput"
                  type="text"
                  bind:value={ssoRegion}
                  placeholder="us-east-1"
                  class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                />
              </div>
              <div class="flex-1">
                <label
                  for="ssoAccInput"
                  class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                  >Account ID</label
                >
                <input
                  id="ssoAccInput"
                  type="text"
                  bind:value={ssoAccountId}
                  placeholder="123456789012"
                  class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                />
              </div>
            </div>
            <div>
              <label
                for="ssoRoleInput"
                class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                >Role Name</label
              >
              <input
                id="ssoRoleInput"
                type="text"
                bind:value={ssoRoleName}
                placeholder="AdministratorAccess"
                class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
              />
            </div>
          {/if}
          <div>
            <label
              for="regionSelect"
              class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
              >Region</label
            >
            <select
              id="regionSelect"
              bind:value={region}
              class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500"
            >
              {#each visibleRegions as r}<option value={r}>{r}</option>{/each}
            </select>
          </div>
          <button
            onclick={() => login()}
            class="w-full bg-blue-600 hover:bg-blue-500 p-2.5 rounded font-bold text-sm shadow-lg transition"
            >{loading ? "Connecting..." : "Connect"}</button
          >
        </div>
      </div>
    </div>
  {:else}
    <header
      class="flex flex-col sm:flex-row sm:items-center bg-gray-900 border-b border-gray-800 shrink-0"
    >
      <!-- Profile/Region Controls (Top on mobile, Right on desktop) -->
      <div
        class="flex items-center gap-1.5 sm:ml-auto w-full sm:w-auto order-1 sm:order-2 shrink-0 border-b sm:border-0 border-gray-800 px-2 sm:px-3 py-1.5 overflow-x-auto scrollbar-hide"
      >
        {#if authType === "profile"}
          <select
            bind:value={selectedProfile}
            onchange={() => login()}
            class="bg-gray-800 text-xs p-1.5 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500 shrink-0 max-w-[120px] sm:max-w-none"
          >
            {#each visibleProfiles as p}<option value={p}>{p}</option>{/each}
          </select>
        {:else}
          <div
            class="bg-gray-800 text-xs p-1.5 rounded text-blue-400 font-mono border border-gray-700 shrink-0"
            title="Logged in with API Keys"
          >
            🔑 Custom Keys
          </div>
        {/if}
        <select
          bind:value={region}
          onchange={() => login()}
          class="bg-gray-800 text-xs p-1.5 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500 shrink-0 max-w-[100px] sm:max-w-none"
        >
          {#each visibleRegions as r}<option value={r}>{r}</option>{/each}
        </select>
        <button
          onclick={() => refreshKey++}
          class="bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded text-xs font-semibold border border-gray-700 transition shrink-0 ml-auto sm:ml-0"
          >⟳</button
        >
        <button
          onclick={() => {
            showSettings = true;
            settingsTab = "profiles";
          }}
          class="px-2.5 py-1.5 rounded text-xs transition text-gray-500 hover:text-gray-300 hover:bg-gray-800 shrink-0"
          title="Settings">⚙</button
        >
      </div>

      <!-- Services List (Bottom on mobile, Left on desktop) -->
      <div
        class="flex items-center min-w-0 flex-1 order-2 sm:order-1 px-2 sm:px-3 py-1.5"
      >
        <nav
          class="flex gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide snap-x"
        >
          {#each enabledServices as svc}
            <button
              onclick={() => switchTab(svc.id)}
              class="px-3 py-1.5 rounded flex-none text-xs font-semibold transition shrink-0 snap-start {activeId ===
              svc.id
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
              >{svc.label}</button
            >
          {/each}
        </nav>
      </div>
    </header>

    {#if error}<div
        class="bg-red-500/20 text-red-300 px-3 py-1.5 text-xs border-b border-red-500/30"
      >
        {error}
      </div>{/if}

    <!-- Settings Modal -->
    {#if showSettings}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4"
        onclick={(e) => {
          if (e.target === e.currentTarget) showSettings = false;
        }}
      >
        <div
          class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-xl flex flex-col sm:flex-row overflow-hidden"
          style="height: 480px; max-height: 90vh;"
        >
          <!-- Left tabs -->
          <div
            class="w-full sm:w-36 bg-gray-950 border-b sm:border-b-0 sm:border-r border-gray-800 flex sm:flex-col p-2 sm:py-2 shrink-0 overflow-x-auto scrollbar-hide"
          >
            {#each [["profiles", "Profiles"], ["regions", "Regions"], ["services", "Services"]] as const as [key, label]}
              <button
                onclick={() => (settingsTab = key)}
                class="px-4 py-2.5 text-left text-xs font-semibold transition whitespace-nowrap {settingsTab ===
                key
                  ? 'bg-gray-800 text-blue-400 border-b-2 sm:border-b-0 sm:border-r-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900 border-b-2 border-transparent sm:border-transparent'}"
              >
                {label}
              </button>
            {/each}
            <div class="hidden sm:block flex-1"></div>
            <button
              onclick={() => (showSettings = false)}
              class="hidden sm:block px-4 py-2 text-xs text-gray-600 hover:text-gray-400 transition text-left"
              >Close</button
            >
          </div>

          <!-- Right content -->
          <div class="flex-1 p-3 sm:p-4 overflow-auto relative">
            <!-- Mobile Close Button (top right inside) -->
            <button
              onclick={() => (showSettings = false)}
              class="absolute top-3 right-3 sm:hidden w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white"
              >✕</button
            >
            {#if settingsTab === "profiles"}
              <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                Profiles — show, hide & reorder
              </h3>
              <div class="space-y-1">
                {#each profileOrder as id, idx}
                  <div
                    class="flex items-center gap-2 px-3 py-2 rounded border border-gray-800 bg-gray-800/30 hover:bg-gray-800/60 transition"
                  >
                    <div class="flex flex-col gap-0.5">
                      <button
                        onclick={() => moveProfile(idx, -1)}
                        disabled={idx === 0}
                        class="text-gray-600 hover:text-gray-400 text-[10px] leading-none disabled:opacity-30"
                        >▲</button
                      >
                      <button
                        onclick={() => moveProfile(idx, 1)}
                        disabled={idx === profileOrder.length - 1}
                        class="text-gray-600 hover:text-gray-400 text-[10px] leading-none disabled:opacity-30"
                        >▼</button
                      >
                    </div>
                    <span class="flex-1 text-sm font-mono text-gray-200"
                      >{id}</span
                    >
                    <button
                      onclick={() => toggleProfile(id)}
                      aria-label="Toggle {id}"
                      class="w-9 h-5 rounded-full relative transition-colors {profileVisible.has(
                        id,
                      )
                        ? 'bg-blue-600'
                        : 'bg-gray-700'}"
                    >
                      <span
                        class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {profileVisible.has(
                          id,
                        )
                          ? 'left-[18px]'
                          : 'left-0.5'}"
                      ></span>
                    </button>
                  </div>
                {/each}
              </div>
            {:else if settingsTab === "regions"}
              <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                Regions — show, hide & reorder
              </h3>
              <div class="space-y-1">
                {#each regionOrder as id, idx}
                  <div
                    class="flex items-center gap-2 px-3 py-1.5 rounded border border-gray-800 bg-gray-800/30 hover:bg-gray-800/60 transition"
                  >
                    <div class="flex flex-col gap-0.5">
                      <button
                        onclick={() => moveRegion(idx, -1)}
                        disabled={idx === 0}
                        class="text-gray-600 hover:text-gray-400 text-[10px] leading-none disabled:opacity-30"
                        >▲</button
                      >
                      <button
                        onclick={() => moveRegion(idx, 1)}
                        disabled={idx === regionOrder.length - 1}
                        class="text-gray-600 hover:text-gray-400 text-[10px] leading-none disabled:opacity-30"
                        >▼</button
                      >
                    </div>
                    <span class="flex-1 text-sm font-mono text-gray-200"
                      >{id}</span
                    >
                    <button
                      onclick={() => toggleRegion(id)}
                      aria-label="Toggle {id}"
                      class="w-9 h-5 rounded-full relative transition-colors {regionVisible.has(
                        id,
                      )
                        ? 'bg-blue-600'
                        : 'bg-gray-700'}"
                    >
                      <span
                        class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {regionVisible.has(
                          id,
                        )
                          ? 'left-[18px]'
                          : 'left-0.5'}"
                      ></span>
                    </button>
                  </div>
                {/each}
              </div>
            {:else if settingsTab === "services"}
              <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                Services — show, hide & reorder
              </h3>
              <div class="space-y-1">
                {#each serviceOrder as id, idx}
                  {@const svc = services.find((s) => s.id === id)}
                  {#if svc}
                    <div
                      class="flex items-center gap-2 px-3 py-2 rounded border border-gray-800 bg-gray-800/30 hover:bg-gray-800/60 transition"
                    >
                      <div class="flex flex-col gap-0.5">
                        <button
                          onclick={() => moveService(idx, -1)}
                          disabled={idx === 0}
                          class="text-gray-600 hover:text-gray-400 text-[10px] leading-none disabled:opacity-30"
                          >▲</button
                        >
                        <button
                          onclick={() => moveService(idx, 1)}
                          disabled={idx === serviceOrder.length - 1}
                          class="text-gray-600 hover:text-gray-400 text-[10px] leading-none disabled:opacity-30"
                          >▼</button
                        >
                      </div>
                      <span class="flex-1 text-sm text-gray-200"
                        >{svc.label}</span
                      >
                      <button
                        onclick={() => toggleService(id)}
                        aria-label="Toggle {svc.label}"
                        class="w-9 h-5 rounded-full relative transition-colors {serviceVisible.has(
                          id,
                        )
                          ? 'bg-blue-600'
                          : 'bg-gray-700'}"
                      >
                        <span
                          class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {serviceVisible.has(
                            id,
                          )
                            ? 'left-[18px]'
                            : 'left-0.5'}"
                        ></span>
                      </button>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Dynamic Content -->
    <div class="flex-1 overflow-hidden relative">
      <div class="absolute inset-0">
        {#if activeService}
          {#key refreshKey}
            {@const Comp = activeService.component}
            <Comp />
          {/key}
        {/if}
      </div>
    </div>
  {/if}
</main>
