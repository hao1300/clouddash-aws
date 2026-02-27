<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { onMount } from "svelte";

    interface Alarm {
        name: string;
        state: string;
        description: string;
    }
    let data = $state<Alarm[]>([]);
    let loading = $state(true);
    let error = $state("");

    onMount(() => refresh());

    async function refresh() {
        try {
            loading = true;
            error = "";
            data = await invoke("fetch_alarms");
        } catch (e) {
            error = e as string;
        } finally {
            loading = false;
        }
    }
</script>

{#if loading}
    <div class="flex items-center justify-center py-16">
        <div
            class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
        ></div>
    </div>
{:else if error}
    <div class="bg-red-500/20 text-red-300 p-2 rounded text-xs">{error}</div>
{:else}
    <div class="space-y-2">
        {#each data as alarm}
            <div
                class="bg-gray-900 p-3 rounded-lg flex items-center justify-between border-l-4 {alarm.state ===
                'ALARM'
                    ? 'border-red-500'
                    : 'border-green-500'}"
            >
                <div class="min-w-0 mr-3">
                    <h3 class="font-semibold text-sm text-gray-100 truncate">
                        {alarm.name}
                    </h3>
                    <p class="text-gray-500 text-xs truncate">
                        {alarm.description || "No description"}
                    </p>
                </div>
                <span
                    class="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold {alarm.state ===
                    'ALARM'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-green-500/20 text-green-400'}">{alarm.state}</span
                >
            </div>
        {/each}
        {#if data.length === 0}
            <div class="text-gray-600 text-center py-16 text-sm">
                No CloudWatch alarms found.
            </div>
        {/if}
    </div>
{/if}
