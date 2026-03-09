<script lang="ts">
  import "../app.css";
  import { invoke } from "@tauri-apps/api/core";
  import { onMount, type Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import SettingsDialog from "$lib/components/SettingsDialog.svelte";
  import Login from "$lib/components/Login.svelte";
  import { aws } from "$lib/services/aws.svelte";
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
  let searchQuery = $state("");
  let filteredServices = $derived(
    services.filter((s) =>
      s.label.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  function toggleStar(id: string, e: MouseEvent) {
    e.stopPropagation();
    const next = new Set(serviceVisible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    serviceVisible = next;
    saveState();
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

    if (saved?.profile && allProfiles.includes(saved.profile))
      selectedProfile = saved.profile;
    else if (allProfiles.length > 0) selectedProfile = allProfiles[0];
    if (saved?.region) region = saved.region;

    // Auto connect
    let shouldAutoConnect = false;
    if (authType === "manual" && accessKeyId && secretAccessKey) {
      shouldAutoConnect = true;
    } else if (authType === "profile" && selectedProfile) {
      if (selectedProfile !== "default" || saved?.profile === "default") {
        shouldAutoConnect = true;
      }
    }

    if (shouldAutoConnect) {
      await login(true, saved?.activeId);
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

  function switchTab(id: string) {
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
  {:else}
    <header
      class="flex flex-col sm:flex-row sm:items-center bg-gray-900 border-b border-gray-800 shrink-0"
    >
      <!-- Profile/Region Controls -->
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

      <!-- Services List (SvelteKit routes) -->
      <div
        class="flex items-center min-w-0 flex-1 order-2 sm:order-1 px-2 sm:px-3 py-1.5 gap-2"
      >
        <BackButton />
        <!-- Service Dropdown Button -->
        <div class="relative shrink-0">
          <button
            onclick={() => (dropdownOpen = !dropdownOpen)}
            class="px-3 py-1.5 rounded flex items-center gap-2 text-xs font-bold transition whitespace-nowrap {dropdownOpen
              ? 'bg-blue-600 text-white shadow'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'}"
          >
            <span class="text-blue-400">☰</span> Services
          </button>

          {#if dropdownOpen}
            <!-- Click outside overlay -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="fixed inset-0 z-[90] bg-transparent"
              onclick={() => (dropdownOpen = false)}
            ></div>

            <div
              class="absolute top-full left-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl z-[100] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150"
            >
              <div class="p-2 border-b border-gray-800 bg-gray-900/50">
                <input
                  type="text"
                  bind:value={searchQuery}
                  placeholder="Search services..."
                  class="w-full bg-black border border-gray-800 rounded p-1.5 text-xs text-white outline-none focus:border-blue-500 transition"
                  onclick={(e) => e.stopPropagation()}
                />
              </div>
              <div class="max-h-80 overflow-y-auto p-1 py-2 space-y-0.5">
                {#each filteredServices as svc}
                  <div
                    role="button"
                    tabindex="0"
                    class="group flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-gray-800 cursor-pointer transition text-left"
                    onclick={() => {
                      switchTab(svc.id);
                      dropdownOpen = false;
                    }}
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        switchTab(svc.id);
                        dropdownOpen = false;
                      }
                    }}
                  >
                    <span
                      class="text-xs font-medium text-gray-300 group-hover:text-white"
                      >{svc.label}</span
                    >
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        toggleStar(svc.id, e);
                      }}
                      class="text-xs p-1 rounded hover:bg-gray-700 transition {serviceVisible.has(
                        svc.id,
                      )
                        ? 'text-yellow-400'
                        : 'text-gray-600 hover:text-gray-400'}"
                      title={serviceVisible.has(svc.id) ? "Unstar" : "Star"}
                    >
                      {serviceVisible.has(svc.id) ? "★" : "☆"}
                    </button>
                  </div>
                {/each}
                {#if filteredServices.length === 0}
                  <div
                    class="px-3 py-4 text-center text-xs text-gray-500 italic"
                  >
                    No services found
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <nav
          class="flex gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide snap-x pt-0.5"
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
      services={services as any}
      onChange={saveState}
    />

    <!-- Dynamic SvelteKit Content Slot -->
    <div class="flex-1 overflow-hidden relative">
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
  {/if}
</main>
