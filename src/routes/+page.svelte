<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { services, type ServiceDef } from "$lib/services/registry";

  let profiles = $state<string[]>([]);
  let selectedProfile = $state("default");
  let region = $state("us-east-1");
  let isAuthenticated = $state(false);
  let loading = $state(false);
  let error = $state("");

  // Service enable/disable (persisted in localStorage)
  let enabledIds = $state<Set<string>>(new Set());
  let activeId = $state(services[0]?.id ?? "");
  let refreshKey = $state(0);
  let showSettings = $state(false);

  onMount(async () => {
    // Load enabled services from localStorage
    const saved = localStorage.getItem("aws_enabled_services");
    if (saved) {
      enabledIds = new Set(JSON.parse(saved));
    } else {
      enabledIds = new Set(
        services.filter((s) => s.defaultEnabled).map((s) => s.id),
      );
    }
    // Make sure active is enabled
    if (!enabledIds.has(activeId)) {
      const first = services.find((s) => enabledIds.has(s.id));
      if (first) activeId = first.id;
    }

    try {
      profiles = await invoke("list_profiles");
      if (profiles.length > 0) selectedProfile = profiles[0];
    } catch (e) {
      console.error(e);
      profiles = ["default"];
    }
  });

  function toggleService(id: string) {
    const next = new Set(enabledIds);
    if (next.has(id)) {
      if (next.size > 1) {
        next.delete(id);
        if (activeId === id) {
          activeId = [...next][0];
          refreshKey++;
        }
      }
    } else {
      next.add(id);
    }
    enabledIds = next;
    localStorage.setItem("aws_enabled_services", JSON.stringify([...next]));
  }

  async function login() {
    try {
      loading = true;
      await invoke("authenticate", {
        payload: { profile: selectedProfile, region },
      });
      isAuthenticated = true;
      error = "";
      refreshKey++;
    } catch (e) {
      error = e as string;
    } finally {
      loading = false;
    }
  }

  function switchTab(id: string) {
    activeId = id;
    refreshKey++;
  }

  let enabledServices = $derived(services.filter((s) => enabledIds.has(s.id)));
  let activeService = $derived(services.find((s) => s.id === activeId));
</script>

<main
  class="h-screen bg-gray-950 text-white flex flex-col font-sans overflow-hidden"
>
  {#if !isAuthenticated}
    <div class="flex items-center justify-center flex-1">
      <div
        class="w-full max-w-sm bg-gray-900 p-6 rounded-xl shadow-2xl border border-gray-800"
      >
        <h1 class="text-xl font-bold mb-4 text-blue-400">AWS Connect</h1>
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
              {#each profiles as p}<option value={p}>{p}</option>{/each}
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
              <option value="us-east-1">us-east-1</option>
              <option value="us-east-2">us-east-2</option>
              <option value="us-west-1">us-west-1</option>
              <option value="us-west-2">us-west-2</option>
              <option value="eu-west-1">eu-west-1</option>
              <option value="eu-central-1">eu-central-1</option>
              <option value="ap-southeast-1">ap-southeast-1</option>
              <option value="ap-southeast-2">ap-southeast-2</option>
              <option value="ap-northeast-1">ap-northeast-1</option>
            </select>
          </div>
          <button
            onclick={login}
            class="w-full bg-blue-600 hover:bg-blue-500 p-2.5 rounded font-bold text-sm shadow-lg transition"
            >{loading ? "Connecting..." : "Connect"}</button
          >
        </div>
      </div>
    </div>
  {:else}
    <!-- Top Bar: Tabs left, selectors right -->
    <header
      class="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0"
    >
      <nav class="flex gap-1">
        {#each enabledServices as svc}
          <button
            onclick={() => switchTab(svc.id)}
            class="px-3 py-1.5 rounded text-xs font-semibold transition {activeId ===
            svc.id
              ? 'bg-blue-600 text-white shadow'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
            >{svc.label}</button
          >
        {/each}
        <!-- Settings gear -->
        <button
          onclick={() => (showSettings = !showSettings)}
          class="px-2 py-1.5 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition ml-1"
          title="Manage services">⚙</button
        >
      </nav>
      <div class="flex items-center gap-2">
        <select
          bind:value={selectedProfile}
          onchange={login}
          class="bg-gray-800 text-xs p-1.5 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
        >
          {#each profiles as p}<option value={p}>{p}</option>{/each}
        </select>
        <select
          bind:value={region}
          onchange={login}
          class="bg-gray-800 text-xs p-1.5 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
        >
          <option value="us-east-1">us-east-1</option>
          <option value="us-east-2">us-east-2</option>
          <option value="us-west-1">us-west-1</option>
          <option value="us-west-2">us-west-2</option>
          <option value="eu-west-1">eu-west-1</option>
          <option value="eu-central-1">eu-central-1</option>
          <option value="ap-southeast-1">ap-southeast-1</option>
          <option value="ap-southeast-2">ap-southeast-2</option>
          <option value="ap-northeast-1">ap-northeast-1</option>
        </select>
        <button
          onclick={() => refreshKey++}
          class="bg-gray-800 hover:bg-gray-700 px-2.5 py-1.5 rounded text-xs font-semibold border border-gray-700 transition"
          >⟳</button
        >
      </div>
    </header>

    <!-- Service Settings Dropdown -->
    {#if showSettings}
      <div
        class="bg-gray-900 border-b border-gray-800 px-3 py-2 flex flex-wrap gap-2"
      >
        {#each services as svc}
          <button
            onclick={() => toggleService(svc.id)}
            class="px-3 py-1 rounded text-xs font-semibold border transition {enabledIds.has(
              svc.id,
            )
              ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
              : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'}"
            >{svc.label}</button
          >
        {/each}
      </div>
    {/if}

    {#if error}<div
        class="bg-red-500/20 text-red-300 px-3 py-1.5 text-xs border-b border-red-500/30"
      >
        {error}
      </div>{/if}

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
