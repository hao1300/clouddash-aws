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
  import ServiceLayout from "$lib/components/ServiceLayout.svelte";
  import BackButton from "$lib/components/BackButton.svelte";

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

  // We are stripping the component classes from the registry since components will be
  // rendered by SvelteKit's route mechanism now. We only need IDs and Labels.
  const services = [
    { id: "cloudwatch", label: "CloudWatch", defaultEnabled: true },
    { id: "ec2", label: "EC2", defaultEnabled: true },
    { id: "s3", label: "S3", defaultEnabled: true },
    { id: "dynamodb", label: "DynamoDB", defaultEnabled: true },
    { id: "sqs", label: "SQS", defaultEnabled: true },
    { id: "cloudfront", label: "CloudFront", defaultEnabled: true },
    { id: "stepfunctions", label: "Step Functions", defaultEnabled: true },
    { id: "lambda", label: "Lambda", defaultEnabled: true },
    { id: "sns", label: "SNS", defaultEnabled: true },
    { id: "iam", label: "IAM", defaultEnabled: true },
    { id: "secretsmanager", label: "Secrets Manager", defaultEnabled: true },
    {
      id: "elasticbeanstalk",
      label: "Elastic Beanstalk",
      defaultEnabled: true,
    },
    { id: "cloudformation", label: "CloudFormation", defaultEnabled: true },
    { id: "ses", label: "SES", defaultEnabled: true },
  ];

  let allProfiles = $state<string[]>([]);
  let selectedProfile = $state("default");
  let region = $state("us-east-1");
  let authType = $state<"profile" | "manual" | "qr">("profile");

  // Custom API Keys
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

  // Settings dialog
  let showSettings = $state(false);
  type SettingsTab = "profiles" | "regions" | "services";
  let settingsTab = $state<SettingsTab>("profiles");

  // Service Dropdown
  let dropdownOpen = $state(false);
  let sideMenuOpen = $state(false);
  let rightSidebarOpen = $state(false);
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
  let enabledServices = $derived(
    orderedServices.filter((s) => serviceVisible.has(s.id)),
  );

  // To highlight active tab on top
  let activeId = $derived($page.url.pathname.split("/")[1] || "");
  let serviceTitle = $derived(
    services.find((s) => s.id === activeId)?.label || "",
  );
  let serviceTabs = $derived($page.data.tabs || []);
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
        accessKeyId,
        secretAccessKey,
        sessionToken,
        saveProfileChecked,
        saveProfileName,
        activeId: activeId, // Save last active route to redirect later
      }),
    );
  }

  onMount(async () => {
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
    if (saved?.authType) authType = saved.authType;
    if (saved?.accessKeyId) accessKeyId = saved.accessKeyId;
    if (saved?.secretAccessKey) secretAccessKey = saved.secretAccessKey;
    if (saved?.sessionToken) sessionToken = saved.sessionToken;
    if (saved?.saveProfileChecked)
      saveProfileChecked = saved.saveProfileChecked;
    if (saved?.saveProfileName) saveProfileName = saved.saveProfileName;

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
      await login(true, initialState.path || saved?.activeId);
    }
  });

  function switchAuthType(type: "profile" | "manual" | "qr") {
    authType = type;
    currentLoginId++;
    loading = false;
    error = "";
  }

  async function login(silent = false, initialPath?: string) {
    const loginId = ++currentLoginId;
    try {
      loading = true;
      error = "";

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
      await aws.refresh();
      refreshKey++;
      saveState();

      // Auto redirect to last saved service if we are at root
      if ($page.url.pathname === "/") {
        let n = initialPath;
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
    if (event?.ctrlKey || event?.metaKey) {
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
      bind:authType
      bind:selectedProfile
      bind:accessKeyId
      bind:secretAccessKey
      bind:sessionToken
      bind:saveProfileChecked
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
    />
  {:else}<div class="flex h-full w-full overflow-hidden">
      {#if sideMenuOpen}
        <!-- Overlay for mobile -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity sm:hidden z-[150]"
          onclick={() => (sideMenuOpen = false)}
        ></div>
      {/if}

      <!-- Left Sidebar -->
      <div
        class="fixed sm:static inset-y-0 left-0 z-[160] sm:z-auto w-72 max-w-[85vw] bg-gray-900 shadow-2xl sm:shadow-none flex flex-col border-r border-gray-800 shrink-0 transition-transform duration-300 {sideMenuOpen
          ? 'translate-x-0'
          : '-translate-x-full sm:translate-x-0'}"
      >
        <div
          class="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950 shrink-0 sm:hidden"
        >
          <div class="flex items-center gap-2">
            <img src="/logo.png" alt="CloudDash" class="h-6 w-6" />
            <span class="font-bold text-gray-100">CloudDash for AWS</span>
          </div>
          <button
            onclick={() => (sideMenuOpen = false)}
            class="p-2 rounded-full hover:bg-gray-800 text-gray-400 transition sm:hidden"
          >
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-8 pb-10">
          <!-- Services -->
          <div class="space-y-4">
            <div class="space-y-4">
              <div class="px-1">
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
                          class="text-[10px] font-bold text-gray-600 uppercase tracking-widest"
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
                            switchTab(svc.id);
                            if (window.innerWidth < 640) sideMenuOpen = false;
                          }}
                          class="flex-1 px-2 py-3 text-xs font-semibold text-left flex items-center gap-2"
                        >
                          {svc.label}
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

                      {#if activeId === svc.id && serviceTabs.length > 0}
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
                              tab.id
                                ? 'text-blue-400 font-bold bg-blue-500/10'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}"
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
                <span class="text-[10px] text-gray-600 px-1">Profile</span>
                {#if authType === "profile"}
                  <select
                    bind:value={selectedProfile}
                    onchange={() => {
                      login();
                      if (window.innerWidth < 640) sideMenuOpen = false;
                    }}
                    class="w-full bg-gray-800 text-[11px] p-2 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
                  >
                    {#each visibleProfiles as p}<option value={p}>{p}</option
                      >{/each}
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
                <span class="text-[10px] text-gray-600 px-1">Region</span>
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
          <button
            onclick={() => (sideMenuOpen = !sideMenuOpen)}
            class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition sm:hidden"
            title="Toggle Sidebar"
          >
            <span class="text-xl">☰</span>
          </button>

          <BackButton />

          <span class="text-sm font-bold truncate flex-1 text-white"
            >{serviceTitle || "AWS Console"}</span
          >

          <button
            onclick={() => (rightSidebarOpen = !rightSidebarOpen)}
            class="px-3 py-1.5 rounded-full hover:bg-gray-800 transition border border-transparent hover:border-gray-700 {rightSidebarOpen
              ? 'text-blue-400 bg-gray-800 border-gray-700'
              : 'text-gray-400'}"
            title="Bookmarks"
          >
            <span
              class="text-sm font-semibold tracking-wider flex items-center gap-2"
            >
              <span
                class={bookmarks.isBookmarked
                  ? "text-yellow-400"
                  : "text-gray-500"}
              >
                {bookmarks.isBookmarked ? "★" : "☆"}
              </span>
              Bookmarks
            </span>
          </button>
        </header>

        {#if error}<div
            class="bg-red-500/20 text-red-300 px-3 py-1.5 text-xs border-b border-red-500/30 shrink-0"
          >
            {error}
          </div>{/if}

        <div class="flex-1 flex overflow-hidden relative">
          <!-- Dynamic SvelteKit Content Slot -->
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

          {#if rightSidebarOpen}
            <!-- Bookmarks Sidebar -->
            <!-- Overlay for mobile -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              transition:fade={{ duration: 200 }}
              class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity sm:hidden z-[150]"
              onclick={() => (rightSidebarOpen = false)}
            ></div>

            <div
              transition:fly={{ x: 300, duration: 300 }}
              class="fixed sm:static inset-y-0 right-0 z-[160] sm:z-auto w-72 max-w-[85vw] bg-gray-900 shadow-2xl sm:shadow-none flex flex-col border-l border-gray-800 shrink-0"
            >
              <div
                class="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950 shrink-0"
              >
                <div class="flex items-center gap-2">
                  <span class="text-yellow-500 text-lg">★</span>
                  <span class="font-bold text-gray-100">Bookmarks</span>
                </div>
                <button
                  onclick={() => (rightSidebarOpen = false)}
                  class="p-2 rounded-full hover:bg-gray-800 text-gray-400 transition"
                >
                  ✕
                </button>
              </div>

              <div
                class="p-3 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm shrink-0"
              >
                <button
                  onclick={() => {
                    let label = serviceTitle;
                    if (serviceActiveTab) label += ` - ${serviceActiveTab}`;
                    bookmarks.toggle(label);
                  }}
                  class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-semibold border border-gray-700 transition"
                >
                  <span
                    class={bookmarks.isBookmarked
                      ? "text-yellow-400"
                      : "text-gray-400"}
                  >
                    {bookmarks.isBookmarked ? "★" : "☆"}
                  </span>
                  <span>
                    {bookmarks.isBookmarked
                      ? "Remove Current Page"
                      : "Bookmark Current Page"}
                  </span>
                </button>
              </div>

              <div class="flex-1 overflow-y-auto p-2 space-y-1">
                {#each bookmarks.all as bkm}
                  <div
                    class="group flex flex-col w-full bg-gray-900 border border-gray-800 rounded hover:border-gray-700 transition overflow-hidden"
                  >
                    <button
                      onclick={() => {
                        goto(bkm.url);
                        rightSidebarOpen = false;
                        if (window.innerWidth < 640) sideMenuOpen = false;
                      }}
                      class="px-3 py-2 text-left hover:bg-gray-800 transition"
                    >
                      <span
                        class="text-xs text-blue-400 font-medium break-words leading-tight block"
                        >{bkm.label}</span
                      >
                      <span
                        class="text-[10px] text-gray-500 font-mono truncate block mt-0.5"
                        >{bkm.url}</span
                      >
                    </button>
                    <div
                      class="flex border-t border-gray-800 divide-x divide-gray-800 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-950 lg:opacity-100"
                    >
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          bookmarks.remove(bkm.id);
                        }}
                        class="flex-1 p-1.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-900/20 uppercase tracking-wider font-semibold transition"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                {/each}
                {#if bookmarks.all.length === 0}
                  <div class="p-6 text-center">
                    <div class="text-gray-500 text-xs italic">
                      No bookmarks yet.
                    </div>
                  </div>
                {/if}
              </div>

            </div>
          {/if}
        </div>
      </div>
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
</main>
