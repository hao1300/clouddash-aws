<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    // --- Service Layout State ---
    const tabs = [{ id: "buckets", label: "Buckets" }];
    let activeTab = $state("buckets");

    // --- Shared State ---
    let error = $state("");
    let loading = $state(false);

    // --- Buckets ---
    let buckets = $state<any[]>([]);

    // --- Object Browsing ---
    let selectedBucket = $state("");
    let objLoading = $state(false);
    let objects = $state<any[]>([]);
    let prefix = $state("");
    let prefixHistory = $state<string[]>([]);

    // Pagination for current prefix
    let objTokenMap = $state<string[]>([]);
    let objCurrentToken = $state<string | undefined>(undefined);

    // --- File Preview ---
    let previewKey = $state("");
    let previewContent = $state("");
    let previewLoading = $state(false);
    let previewType = $state("");

    onMount(() => loadBuckets());

    // --- Pagination Shared Helpers ---
    function pushToken(history: string[], currentNextToken?: string) {
        if (!currentNextToken) return;
        if (history[history.length - 1] !== currentNextToken)
            history.push(currentNextToken);
    }
    function popToken(history: string[]) {
        history.pop();
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    async function loadBuckets() {
        try {
            loading = true;
            error = "";
            const resp: any = await invoke("s3", {
                action: "list_buckets",
                params: {},
            });
            buckets = resp.items || [];
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function browseBucket(name: string) {
        selectedBucket = name;
        prefix = "";
        prefixHistory = [];
        objTokenMap = [];
        previewKey = "";
        await loadObjects();
    }

    function navigateToPrefix(newPrefix: string) {
        prefixHistory = [...prefixHistory, prefix];
        prefix = newPrefix;
        objTokenMap = [];
        loadObjects();
    }

    function goBackPrefix() {
        if (prefixHistory.length > 0) {
            prefix = prefixHistory.pop()!;
            prefixHistory = [...prefixHistory];
            objTokenMap = [];
            loadObjects();
        } else {
            selectedBucket = "";
        }
    }

    async function loadObjects(token?: string) {
        try {
            objLoading = true;
            error = "";
            const resp: any = await invoke("s3", {
                action: "list_objects",
                params: {
                    bucket: selectedBucket,
                    prefix,
                    delimiter: "/",
                    next_token: token || null,
                },
            });
            const newItems: any[] = [];
            // Add folders (common prefixes) only on the first page
            if (!token) {
                const cps = resp.common_prefixes || [];
                for (const cp of cps) {
                    newItems.push({
                        type: "folder",
                        key: cp,
                        name: cp.slice(prefix.length),
                        size: null,
                        lastModified: null,
                    });
                }
            }
            // Add files
            for (const o of resp.items || []) {
                newItems.push({
                    type: "file",
                    key: o.key,
                    name: o.key.slice(prefix.length),
                    size: o.size,
                    lastModified: o.last_modified,
                });
            }
            objects = newItems;
            pushToken(objTokenMap, resp.next_token);
            objCurrentToken = resp.next_token;
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
        error = "";
        try {
            const resp: any = await invoke("s3", {
                action: "get_object",
                params: { bucket: selectedBucket, key },
            });
            previewType = resp.type;
            previewContent = resp.content;
        } catch (e) {
            error = String(e);
            previewContent = String(e);
            previewType = "text";
        } finally {
            previewLoading = false;
        }
    }

    function downloadFile(key: string) {
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

    function formatSize(b: number | null) {
        if (b === null || b === undefined) return "-";
        if (b === 0) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }

    const bucketColumns = [
        {
            key: "name",
            label: "Bucket Name",
            format: (v: string) => `🪣 ${v}`,
            onClick: (item: any) => browseBucket(item.name),
        },
        {
            key: "creation_date",
            label: "Creation Date",
            format: (v: string) => (v ? new Date(v).toLocaleString() : "-"),
        },
    ];

    const objectColumns = [
        {
            key: "name",
            label: "Name",
            format: (v: string, item: any) =>
                `${item.type === "folder" ? "📁" : "📄"} ${v}`,
            onClick: (item: any) =>
                item.type === "folder"
                    ? navigateToPrefix(item.key)
                    : previewFile(item.key),
        },
        { key: "size", label: "Size", format: (v: number) => formatSize(v) },
        {
            key: "lastModified",
            label: "Last Modified",
            format: (v: string) => (v ? new Date(v).toLocaleString() : "-"),
        },
    ];
</script>

<ServiceLayout title="S3" {tabs} bind:activeTab>
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30 shadow"
        >
            {error}
        </div>{/if}

    <div class="h-full {error ? 'pt-8' : ''}">
        {#if previewKey}
            <!-- Preview View -->
            <div class="h-full flex flex-col p-4 bg-gray-950">
                <div
                    class="flex items-center gap-3 mb-4 shrink-0 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm"
                >
                    <button
                        onclick={() => (previewKey = "")}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back to Bucket</button
                    >
                    <span
                        class="text-sm font-mono text-gray-200 truncate flex-1"
                        >{previewKey}</span
                    >
                    <button
                        onclick={() => downloadFile(previewKey)}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow"
                        >⬇ Download</button
                    >
                </div>

                <div
                    class="flex-1 overflow-auto bg-gray-900 rounded-lg border border-gray-800 text-sm shadow-inner p-4 relative"
                >
                    {#if previewLoading}
                        <div
                            class="h-full flex items-center justify-center text-gray-500"
                        >
                            <span class="animate-spin text-2xl mr-3">⟳</span> Loading
                            preview...
                        </div>
                    {:else if previewType === "text"}
                        <pre
                            class="text-gray-300 whitespace-pre-wrap break-all font-mono text-xs">{previewContent}</pre>
                    {:else}
                        <div
                            class="h-full flex flex-col items-center justify-center text-gray-500 space-y-4"
                        >
                            <span class="text-4xl">📦</span>
                            <p>Binary file preview not supported.</p>
                            <button
                                onclick={() => downloadFile(previewKey)}
                                class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-bold shadow transition"
                                >Download File</button
                            >
                        </div>
                    {/if}
                </div>
            </div>
        {:else if selectedBucket}
            <!-- Object Browser View -->
            <div class="h-full flex flex-col bg-gray-950 overflow-hidden">
                <div
                    class="flex items-center gap-2 p-3 bg-gray-900 border-b border-gray-800 shrink-0"
                >
                    <button
                        onclick={goBackPrefix}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        title="Go Up/Back">← Back</button
                    >
                    <span class="text-gray-600 ml-1">/</span>
                    <button
                        onclick={() => browseBucket(selectedBucket)}
                        class="text-sm font-bold text-gray-300 hover:text-white transition"
                        >🪣 {selectedBucket}</button
                    >
                    {#if prefix}
                        <span class="text-gray-600">/</span>
                        <span class="text-sm font-mono text-blue-300 truncate"
                            >{prefix}</span
                        >
                    {/if}
                </div>

                <div class="flex-1 min-h-0 bg-gray-950">
                    <PaginatedTable
                        items={objects}
                        loading={objLoading}
                        hasNext={!!objCurrentToken}
                        hasPrev={objTokenMap.length > 0}
                        onNext={() => loadObjects(objCurrentToken)}
                        onPrev={() => loadObjects(popToken(objTokenMap))}
                        onRefresh={() => {
                            objTokenMap = [];
                            loadObjects();
                        }}
                        columns={objectColumns}
                    >
                        {#snippet actionsSnippet(item)}
                            <div class="flex justify-end gap-2">
                                {#if item.type !== "folder"}
                                    <button
                                        onclick={() => downloadFile(item.key)}
                                        class="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-xs transition"
                                        >⬇</button
                                    >
                                {/if}
                            </div>
                        {/snippet}
                    </PaginatedTable>
                </div>
            </div>
        {:else}
            <!-- Bucket List View -->
            <PaginatedTable
                items={buckets}
                {loading}
                hasNext={false}
                hasPrev={false}
                onRefresh={() => loadBuckets()}
                columns={bucketColumns}
            >
                {#snippet headerActionsSnippet()}
                    <span class="text-xs text-gray-500 italic mr-2"
                        >List limit 1000</span
                    >
                {/snippet}
            </PaginatedTable>
        {/if}
    </div>
</ServiceLayout>
