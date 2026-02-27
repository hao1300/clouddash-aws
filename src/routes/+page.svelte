<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";

  let profiles = $state<string[]>([]);
  let selectedProfile = $state("default");
  let region = $state("us-east-1");

  let isAuthenticated = $state(false);
  let alarms = $state<{ name: string; state: string; description: string }[]>(
    [],
  );
  let ec2Instances = $state<
    { id: string; state: string; instance_type: string }[]
  >([]);
  let s3Buckets = $state<{ name: string; creation_date: string }[]>([]);
  let error = $state("");

  onMount(async () => {
    try {
      profiles = await invoke("list_profiles");
      if (profiles.length > 0) {
        selectedProfile = profiles[0];
      }
    } catch (e) {
      console.error(e);
      profiles = ["default"];
      selectedProfile = "default";
    }
  });

  async function login() {
    try {
      await invoke("authenticate", {
        payload: { profile: selectedProfile, region },
      });
      isAuthenticated = true;
      error = "";
      refreshDashboard();
    } catch (e) {
      error = e as string;
    }
  }

  async function refreshDashboard() {
    try {
      alarms = await invoke("fetch_alarms");
      ec2Instances = await invoke("fetch_ec2_instances");
      s3Buckets = await invoke("fetch_s3_buckets");
    } catch (e) {
      error = e as string;
    }
  }
</script>

<main class="min-h-screen bg-gray-900 text-white p-6 font-sans">
  {#if !isAuthenticated}
    <!-- 1. Authentication View -->
    <div
      class="max-w-md mx-auto bg-gray-800 p-8 rounded-xl shadow-lg mt-20 border border-gray-700"
    >
      <h1 class="text-2xl font-bold mb-6 text-blue-400">AWS Local Setup</h1>

      {#if error}<div
          class="bg-red-500/20 text-red-300 p-3 rounded mb-4 text-sm font-semibold"
        >
          {error}
        </div>{/if}

      <div class="space-y-4">
        <div>
          <label for="profileSelect" class="block text-sm text-gray-400 mb-1"
            >AWS Profile</label
          >
          <select
            id="profileSelect"
            bind:value={selectedProfile}
            class="w-full bg-gray-700 p-3 rounded text-white outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 appearance-none"
          >
            {#each profiles as profile}
              <option value={profile}>{profile}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="regionInput" class="block text-sm text-gray-400 mb-1"
            >Region</label
          >
          <input
            id="regionInput"
            bind:value={region}
            placeholder="us-east-1"
            class="w-full bg-gray-700 p-3 rounded text-white outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
          />
        </div>
        <button
          onclick={login}
          class="w-full bg-blue-600 hover:bg-blue-500 p-3 rounded font-bold shadow-lg transition duration-200 mt-2"
          >Connect Local Session</button
        >
      </div>
    </div>
  {:else}
    <!-- Dashboard -->
    <div class="max-w-6xl mx-auto mt-6">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold text-white">AWS Dashboard</h1>
          <p class="text-gray-400 text-sm mt-1">
            Region: <span class="text-blue-400 font-mono">{region}</span>
          </p>
        </div>
        <button
          onclick={refreshDashboard}
          class="bg-gray-700 hover:bg-gray-600 px-5 py-2.5 rounded shadow transition font-semibold"
          >Refresh All</button
        >
      </div>

      {#if error}<div
          class="bg-red-500/20 text-red-300 p-3 rounded mb-8 text-sm font-semibold"
        >
          {error}
        </div>{/if}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left Pane: CloudWatch Alarms -->
        <div>
          <h2
            class="text-xl font-bold mb-4 text-gray-200 border-b border-gray-700 pb-2"
          >
            CloudWatch Health
          </h2>
          <div class="space-y-4">
            {#each alarms as alarm}
              <div
                class="bg-gray-800 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between shadow-md border-l-4 transition-transform hover:scale-[1.01] duration-200 {alarm.state ===
                'ALARM'
                  ? 'border-red-500'
                  : 'border-green-500'}"
              >
                <div class="mb-2 sm:mb-0">
                  <h3 class="font-bold text-md text-gray-100">{alarm.name}</h3>
                  <p class="text-gray-400 text-xs mt-1 truncate max-w-xs">
                    {alarm.description ||
                      "No description available for this metric."}
                  </p>
                </div>
                <span
                  class="px-3 py-1 self-start sm:self-auto rounded-full text-xs font-bold tracking-wide {alarm.state ===
                  'ALARM'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : 'bg-green-500/20 text-green-400 border border-green-500/50'}"
                >
                  {alarm.state}
                </span>
              </div>
            {/each}

            {#if alarms.length === 0}
              <div
                class="text-gray-500 text-center py-8 bg-gray-800/50 rounded-lg border border-gray-700 border-dashed text-sm"
              >
                No active CloudWatch alarms found.
              </div>
            {/if}
          </div>
        </div>

        <!-- Right Pane: Resource Explorer (EC2 & S3) -->
        <div class="space-y-8">
          <!-- EC2 Instances -->
          <div>
            <h2
              class="text-xl font-bold mb-4 text-gray-200 border-b border-gray-700 pb-2"
            >
              EC2 Instances ({ec2Instances.length})
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {#each ec2Instances as instance}
                <div
                  class="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700"
                >
                  <div class="flex justify-between items-center mb-2">
                    <span class="font-mono text-sm text-blue-300"
                      >{instance.id}</span
                    >
                    <span
                      class="w-2 h-2 rounded-full {instance.state.toLowerCase() ===
                      'running'
                        ? 'bg-green-500'
                        : 'bg-yellow-500'}"
                    ></span>
                  </div>
                  <div class="text-xs text-gray-400">
                    Type: <span class="text-gray-200 font-semibold"
                      >{instance.instance_type}</span
                    >
                  </div>
                  <div class="text-xs text-gray-400 mt-1">
                    State: <span class="text-gray-200 font-semibold"
                      >{instance.state}</span
                    >
                  </div>
                </div>
              {/each}
              {#if ec2Instances.length === 0}
                <div
                  class="col-span-1 sm:col-span-2 text-gray-500 text-center py-8 bg-gray-800/50 rounded-lg border border-gray-700 border-dashed text-sm"
                >
                  No instances found.
                </div>
              {/if}
            </div>
          </div>

          <!-- S3 Buckets -->
          <div>
            <h2
              class="text-xl font-bold mb-4 text-gray-200 border-b border-gray-700 pb-2"
            >
              S3 Buckets ({s3Buckets.length})
            </h2>
            <ul
              class="bg-gray-800 rounded-lg shadow-md border border-gray-700 divide-y divide-gray-700 max-h-64 overflow-y-auto"
            >
              {#each s3Buckets as bucket}
                <li
                  class="p-3 flex justify-between items-center hover:bg-gray-700 transition"
                >
                  <span
                    class="text-sm font-semibold text-gray-200 truncate pr-4"
                    >{bucket.name}</span
                  >
                  <span class="text-xs text-gray-500 whitespace-nowrap"
                    >{bucket.creation_date
                      ? new Date(bucket.creation_date).toLocaleDateString()
                      : ""}</span
                  >
                </li>
              {/each}
              {#if s3Buckets.length === 0}
                <li class="p-4 text-center text-gray-500 text-sm">
                  No buckets found.
                </li>
              {/if}
            </ul>
          </div>
        </div>
      </div>
    </div>
  {/if}
</main>
