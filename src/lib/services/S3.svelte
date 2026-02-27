<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { onMount } from "svelte";

    interface Bucket {
        name: string;
        creation_date: string;
    }
    let data = $state<Bucket[]>([]);
    let loading = $state(true);
    let error = $state("");

    onMount(() => refresh());

    async function refresh() {
        try {
            loading = true;
            error = "";
            data = await invoke("fetch_s3_buckets");
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
        {#each data as bucket}
            <div
                class="p-3 flex justify-between items-center hover:bg-gray-800/50 transition"
            >
                <div class="flex items-center gap-2 min-w-0">
                    <svg
                        class="w-4 h-4 text-blue-400 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        ><path
                            fill-rule="evenodd"
                            d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                            clip-rule="evenodd"
                        ></path></svg
                    >
                    <span class="text-sm text-gray-200 truncate"
                        >{bucket.name}</span
                    >
                </div>
                <span class="text-xs text-gray-500 shrink-0 ml-2"
                    >{bucket.creation_date
                        ? new Date(bucket.creation_date).toLocaleDateString()
                        : ""}</span
                >
            </div>
        {/each}
        {#if data.length === 0}
            <div class="p-8 text-center text-gray-600 text-sm">
                No S3 buckets found.
            </div>
        {/if}
    </div>
{/if}
