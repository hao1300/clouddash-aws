<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { onMount } from "svelte";

    interface SqsQueue {
        name: string;
        url: string;
        messages_available: string;
        messages_in_flight: string;
    }
    let data = $state<SqsQueue[]>([]);
    let loading = $state(true);
    let error = $state("");

    onMount(() => refresh());

    async function refresh() {
        try {
            loading = true;
            error = "";
            data = await invoke("fetch_sqs_queues");
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
    <div
        class="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800"
    >
        {#each data as queue}
            <div
                class="p-3 flex items-center justify-between hover:bg-gray-800/50 transition"
            >
                <div class="min-w-0 mr-3">
                    <span
                        class="text-sm font-semibold text-gray-200 truncate block"
                        >{queue.name}</span
                    >
                    <span class="text-xs text-gray-600 truncate block"
                        >{queue.url}</span
                    >
                </div>
                <div class="flex gap-3 shrink-0">
                    <div class="text-center">
                        <div class="text-xs text-gray-500">Avail</div>
                        <div class="text-sm font-bold text-blue-400">
                            {queue.messages_available}
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="text-xs text-gray-500">Flight</div>
                        <div class="text-sm font-bold text-yellow-400">
                            {queue.messages_in_flight}
                        </div>
                    </div>
                </div>
            </div>
        {/each}
        {#if data.length === 0}
            <div class="p-8 text-center text-gray-600 text-sm">
                No SQS queues found.
            </div>
        {/if}
    </div>
{/if}
