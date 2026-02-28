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
    if (saved?.profile && allProfiles.includes(saved.profile))
      selectedProfile = saved.profile;
    else if (allProfiles.length > 0) selectedProfile = allProfiles[0];
    if (saved?.region) region = saved.region;

    if (selectedProfile) await login(true);
  });

  async function login(silent = false) {
    try {
      loading = true;
      await invoke("authenticate", {
        payload: { profile: selectedProfile, region },
      });
      isAuthenticated = true;
      error = "";
      refreshKey++;
      saveState();
    } catch (e) {
      if (!silent) error = e as string;
    } finally {
      loading = false;
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
  class="h-screen bg-gray-950 text-white flex flex-col font-sans overflow-hidden"
>
  {#if !isAuthenticated}
    <div class="flex items-center justify-center flex-1">
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
              {#each visibleProfiles as p}<option value={p}>{p}</option>{/each}
            </select>
          </div>
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
    <!-- Top Bar -->
    <header
      class="flex items-center px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0"
    >
      <nav class="flex gap-1 flex-1 min-w-0 overflow-x-auto">
        {#each enabledServices as svc}
          <button
            onclick={() => switchTab(svc.id)}
            class="px-3 py-1.5 rounded text-xs font-semibold transition shrink-0 {activeId ===
            svc.id
              ? 'bg-blue-600 text-white shadow'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
            >{svc.label}</button
          >
        {/each}
      </nav>
      <div class="flex items-center gap-1.5 ml-2 shrink-0">
        <select
          bind:value={selectedProfile}
          onchange={() => login()}
          class="bg-gray-800 text-xs p-1.5 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
        >
          {#each visibleProfiles as p}<option value={p}>{p}</option>{/each}
        </select>
        <select
          bind:value={region}
          onchange={() => login()}
          class="bg-gray-800 text-xs p-1.5 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
        >
          {#each visibleRegions as r}<option value={r}>{r}</option>{/each}
        </select>
        <button
          onclick={() => refreshKey++}
          class="bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded text-xs font-semibold border border-gray-700 transition"
          >⟳</button
        >
        <button
          onclick={() => {
            showSettings = true;
            settingsTab = "profiles";
          }}
          class="px-2.5 py-1.5 rounded text-xs transition text-gray-500 hover:text-gray-300 hover:bg-gray-800"
          title="Settings">⚙</button
        >
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
        class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
        onclick={(e) => {
          if (e.target === e.currentTarget) showSettings = false;
        }}
      >
        <div
          class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-xl flex overflow-hidden"
          style="height: 480px;"
        >
          <!-- Left tabs -->
          <div
            class="w-36 bg-gray-950 border-r border-gray-800 flex flex-col py-2 shrink-0"
          >
            {#each [["profiles", "Profiles"], ["regions", "Regions"], ["services", "Services"]] as const as [key, label]}
              <button
                onclick={() => (settingsTab = key)}
                class="px-4 py-2.5 text-left text-xs font-semibold transition {settingsTab ===
                key
                  ? 'bg-gray-800 text-blue-400 border-r-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'}"
              >
                {label}
              </button>
            {/each}
            <div class="flex-1"></div>
            <button
              onclick={() => (showSettings = false)}
              class="px-4 py-2 text-xs text-gray-600 hover:text-gray-400 transition"
              >Close</button
            >
          </div>

          <!-- Right content -->
          <div class="flex-1 p-4 overflow-auto">
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

    <!-- Active Service Content -->
    <div class="flex-1 overflow-auto p-3">
      {#if activeService}
        {#key refreshKey}
          {@const Comp = activeService.component}
          <Comp />
        {/key}
      {/if}
    </div>
  {/if}
</main>
