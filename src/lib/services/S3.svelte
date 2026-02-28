<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";

    let buckets = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");

    // Object browsing
    let selectedBucket = $state("");
    let objects = $state<any[]>([]);
    let commonPrefixes = $state<string[]>([]);
    let objNextToken = $state<string | null>(null);
    let objLoading = $state(false);
    let prefix = $state("");
    let prefixHistory = $state<string[]>([]);

    // File preview
    let previewKey = $state("");
    let previewContent = $state("");
    let previewLoading = $state(false);
    let previewType = $state(""); // "text" | "binary"

    onMount(() => loadBuckets());

    async function loadBuckets() {
        try {
            loading = true;
            error = "";
            const resp: any = await invoke("s3", {
                action: "list_buckets",
                params: {},
            });
            buckets = resp.items;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    function navigateToPrefix(newPrefix: string) {
        prefixHistory = [...prefixHistory, prefix];
        prefix = newPrefix;
        objects = [];
        commonPrefixes = [];
        objNextToken = null;
        loadObjects();
    }

    function goBack() {
        if (prefixHistory.length > 0) {
            prefix = prefixHistory.pop()!;
            prefixHistory = [...prefixHistory];
            objects = [];
            commonPrefixes = [];
            objNextToken = null;
            loadObjects();
        }
    }

    async function browseBucket(name: string) {
        selectedBucket = name;
        prefix = "";
        prefixHistory = [];
        objects = [];
        commonPrefixes = [];
        objNextToken = null;
        previewKey = "";
        await loadObjects();
    }

    async function loadObjects(append = false) {
        try {
            objLoading = true;
            error = "";
            const resp: any = await invoke("s3", {
                action: "list_objects",
                params: {
                    bucket: selectedBucket,
                    prefix: prefix,
                    delimiter: "/",
                    next_token: append ? objNextToken : null,
                },
            });
            const newItems = resp.items.map((o: any) => ({
                ...o,
                name: o.key.slice(prefix.length),
            }));
            objects = append ? [...objects, ...newItems] : newItems;
            if (!append) commonPrefixes = resp.common_prefixes ?? [];
            objNextToken = resp.next_token;
        } catch (e) {
            error = String(e);
        } finally {
            objLoading = false;
        }
    }

    async function previewFile(key: string) {
        previewKey = key;
        previewContent = "";
        previewLoading = true;
        try {
            const resp: any = await invoke("s3", {
                action: "get_object",
                params: { bucket: selectedBucket, key },
            });
            previewType = resp.type;
            previewContent = resp.content;
        } catch (e) {
            previewContent = String(e);
            previewType = "text";
        } finally {
            previewLoading = false;
        }
    }

    function downloadFile(key: string) {
        // Trigger get_object and download
        invoke("s3", {
            action: "get_object",
            params: { bucket: selectedBucket, key },
        })
            .then((resp: any) => {
                let blob: Blob;
                if (resp.type === "binary") {
                    const binary = atob(resp.content);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++)
                        bytes[i] = binary.charCodeAt(i);
                    blob = new Blob([bytes], { type: resp.content_type });
                } else {
                    blob = new Blob([resp.content], {
                        type: resp.content_type || "text/plain",
                    });
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = key.split("/").pop() ?? key;
                a.click();
                URL.revokeObjectURL(url);
            })
            .catch((e) => {
                error = String(e);
            });
    }

    function formatSize(b: number) {
        if (b === 0) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }
</script>

{#if error}<div class="bg-red-500/20 text-red-300 p-2 rounded text-xs mb-2">
        {error}
    </div>{/if}

{#if previewKey}
    <!-- File Preview -->
    <div class="mb-3">
        <div class="flex items-center gap-2 mb-2">
            <button
                onclick={() => {
                    previewKey = "";
                }}
                class="text-xs text-blue-400 hover:underline">← Back</button
            >
            <span class="text-sm text-gray-300 font-mono truncate"
                >{previewKey}</span
            >
            <button
                onclick={() => downloadFile(previewKey)}
                class="ml-auto bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-xs font-bold"
                >Download</button
            >
        </div>
        {#if previewLoading}
            <div class="flex justify-center py-8">
                <div
                    class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                ></div>
            </div>
        {:else if previewType === "text"}
            <pre
                class="bg-gray-900 p-3 rounded-lg border border-gray-800 text-xs text-gray-300 overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">{previewContent}</pre>
        {:else}
            <div
                class="bg-gray-900 p-6 rounded-lg border border-gray-800 text-center text-gray-500 text-sm"
            >
                <p class="mb-3">Binary file — click Download to save.</p>
                <button
                    onclick={() => downloadFile(previewKey)}
                    class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-xs font-bold text-white"
                    >Download File</button
                >
            </div>
        {/if}
    </div>
{:else if selectedBucket}
    <!-- Object Browser -->
    <div class="flex items-center gap-2 mb-3">
        <button
            onclick={() => {
                if (prefix && prefixHistory.length > 0) goBack();
                else {
                    selectedBucket = "";
                    objects = [];
                }
            }}
            class="text-xs text-blue-400 hover:underline">←</button
        >
        <button
            onclick={() => {
                selectedBucket = "";
                objects = [];
                prefix = "";
                prefixHistory = [];
            }}
            class="text-xs text-gray-500 hover:text-gray-300">Buckets</button
        >
        <span class="text-gray-600">/</span>
        <span class="text-sm text-gray-400 font-mono truncate"
            >{selectedBucket}/{prefix}</span
        >
    </div>
    <div
        class="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800"
    >
        {#if prefix}
            <button
                onclick={goBack}
                class="p-2 flex items-center gap-2 text-xs text-gray-400 hover:bg-gray-800/50 w-full text-left"
            >
                <span class="text-blue-400">📁</span> ..
            </button>
        {/if}
        {#each commonPrefixes as cp}
            <button
                onclick={() => navigateToPrefix(cp)}
                class="p-2 flex items-center gap-2 text-xs hover:bg-gray-800/50 transition w-full text-left"
            >
                <span class="text-blue-400">📁</span>
                <span class="text-gray-200 font-mono"
                    >{cp.slice(prefix.length)}</span
                >
            </button>
        {/each}
        {#each objects as obj}
            <div
                class="p-2 flex items-center gap-2 text-xs hover:bg-gray-800/50 transition group"
            >
                <span class="text-gray-500">📄</span>
                <button
                    onclick={() => previewFile(obj.key)}
                    class="text-gray-200 font-mono truncate flex-1 text-left hover:text-blue-400"
                    >{obj.name}</button
                >
                <span class="text-gray-600 shrink-0"
                    >{formatSize(obj.size)}</span
                >
                <button
                    onclick={() => downloadFile(obj.key)}
                    class="text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition shrink-0"
                    title="Download">⬇</button
                >
            </div>
        {/each}
        {#if !objLoading && objects.length === 0 && commonPrefixes.length === 0}<div
                class="p-6 text-center text-gray-600 text-sm"
            >
                Empty.
            </div>{/if}
    </div>
    {#if objLoading}<div class="flex justify-center py-3">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>{/if}
    {#if objNextToken && !objLoading}<button
            onclick={() => loadObjects(true)}
            class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
            >Load More</button
        >{/if}
{:else}
    <!-- Bucket List -->
    <div
        class="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800"
    >
        {#each buckets as b}
            <button
                onclick={() => browseBucket(b.name)}
                class="p-3 flex justify-between items-center hover:bg-gray-800/50 transition w-full text-left"
            >
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-blue-400">🪣</span>
                    <span class="text-sm text-gray-200 truncate">{b.name}</span>
                </div>
                <span class="text-xs text-gray-500 shrink-0 ml-2"
                    >{b.creation_date
                        ? new Date(b.creation_date).toLocaleDateString()
                        : ""}</span
                >
            </button>
        {/each}
        {#if !loading && buckets.length === 0}<div
                class="p-8 text-center text-gray-600 text-sm"
            >
                No S3 buckets found.
            </div>{/if}
    </div>
    {#if loading}<div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>{/if}
{/if}
