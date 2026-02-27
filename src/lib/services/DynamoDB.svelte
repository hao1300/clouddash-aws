<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { onMount } from "svelte";

    interface DynamoTable {
        name: string;
        status: string;
        item_count: number;
        size_bytes: number;
    }
    let data = $state<DynamoTable[]>([]);
    let loading = $state(true);
    let error = $state("");

    onMount(() => refresh());

    async function refresh() {
        try {
            loading = true;
            error = "";
            data = await invoke("fetch_dynamo_tables");
        } catch (e) {
            error = e as string;
        } finally {
            loading = false;
        }
    }

    function formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
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
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {#each data as table}
            <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-semibold text-gray-100 truncate"
                        >{table.name}</span
                    >
                    <span
                        class="shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-bold {table.status ===
                        'ACTIVE'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'}"
                        >{table.status}</span
                    >
                </div>
                <div class="flex justify-between text-xs">
                    <span class="text-gray-500">Items</span><span
                        class="text-gray-300"
                        >{table.item_count.toLocaleString()}</span
                    >
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <span class="text-gray-500">Size</span><span
                        class="text-gray-300"
                        >{formatBytes(table.size_bytes)}</span
                    >
                </div>
            </div>
        {/each}
        {#if data.length === 0}
            <div class="col-span-full text-gray-600 text-center py-16 text-sm">
                No DynamoDB tables found.
            </div>
        {/if}
    </div>
{/if}
