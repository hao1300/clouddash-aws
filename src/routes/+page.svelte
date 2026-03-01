<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { services, type ServiceDef } from "$lib/services/registry";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import Login from "$lib/components/Login.svelte";

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
</script>

<main
  class="absolute inset-0 bg-gray-950 text-white flex flex-col font-sans overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
>
  {#if !isAuthenticated}
    <Login
      bind:authType
      bind:selectedProfile
      bind:accessKeyId
      bind:secretAccessKey
      bind:sessionToken
      bind:saveProfileChecked
      bind:saveProfileName
      bind:ssoProfileName
      bind:ssoStartUrl
      bind:ssoRegion
      bind:ssoAccountId
      bind:ssoRoleName
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
    />
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

    <SettingsDialog
      bind:open={showSettings}
      bind:profileOrder
      bind:profileVisible
      bind:regionOrder
      bind:regionVisible
      bind:serviceOrder
      bind:serviceVisible
      {services}
      onChange={saveState}
    />

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
