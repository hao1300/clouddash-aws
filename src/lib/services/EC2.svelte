<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { onMount } from "svelte";

    interface Instance {
        id: string;
        state: string;
        instance_type: string;
    }
    let data = $state<Instance[]>([]);
    let loading = $state(true);
    let error = $state("");

    onMount(() => refresh());

    async function refresh() {
        try {
            loading = true;
            error = "";
            data = await invoke("fetch_ec2_instances");
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
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
        {#each data as instance}
            <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
                <div class="flex justify-between items-center mb-2">
                    <span
                        class="font-mono text-xs text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded truncate"
                        >{instance.id}</span
                    >
                    <span
                        class="w-2 h-2 rounded-full shrink-0 ml-2 {instance.state.toLowerCase() ===
                        'running'
                            ? 'bg-green-500'
                            : 'bg-yellow-500'}"
                    ></span>
                </div>
                <div class="flex justify-between text-xs">
                    <span class="text-gray-500">Type</span><span
                        class="text-gray-300">{instance.instance_type}</span
                    >
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <span class="text-gray-500">State</span><span
                        class="text-gray-300 uppercase">{instance.state}</span
                    >
                </div>
            </div>
        {/each}
        {#if data.length === 0}
            <div class="col-span-full text-gray-600 text-center py-16 text-sm">
                No EC2 instances found.
            </div>
        {/if}
    </div>
{/if}
