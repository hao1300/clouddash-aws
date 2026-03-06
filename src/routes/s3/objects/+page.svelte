<script lang="ts">
    import {
        ListObjectsV2Command,
        GetObjectCommand,
        PutObjectCommand,
        DeleteObjectCommand,
    } from "@aws-sdk/client-s3";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";

    let bucket = $derived($page.url.searchParams.get("bucket") || "");
    let prefix = $derived($page.url.searchParams.get("prefix") || "");

    let objects = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    let previewKey = $state("");
    let previewContent = $state("");
    let previewLoading = $state(false);
    let showPreview = $state(false);

    let showCreateFolder = $state(false);
    let folderName = $state("");
    let creatingFolder = $state(false);

    let uploadInput = $state<HTMLInputElement | null>(null);
    let uploading = $state(false);

    $effect(() => {
        if (aws.s3 && bucket) {
            loadObjects();
        }
    });

    async function loadObjects(token?: string) {
        if (!aws.s3 || !bucket) return;
        try {
            loading = true;
            error = "";
            const res = await aws.s3.send(
                new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: prefix || undefined,
                    Delimiter: "/",
                    MaxKeys: 100,
                    ContinuationToken: token,
                }),
            );

            const items: any[] = [];
            // Folders
            if (!token) {
                for (const cp of res.CommonPrefixes || []) {
                    items.push({
                        type: "folder",
                        key: cp.Prefix,
                        name: cp.Prefix?.slice(prefix.length) || "",
                        size: "-",
                        lastModified: "-",
                    });
                }
            }
            // Files
            for (const o of res.Contents || []) {
                if (o.Key === prefix) continue;
                items.push({
                    type: "file",
                    key: o.Key,
                    name: o.Key?.slice(prefix.length) || "",
                    size: formatSize(o.Size || 0),
                    lastModified: o.LastModified?.toLocaleString() ?? "-",
                });
            }

            objects = items;
            if (token) history.push(token);
            marker = res.NextContinuationToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function formatSize(b: number) {
        if (b === 0) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }

    async function handlePreview(key: string) {
        previewKey = key;
        showPreview = true;
        previewLoading = true;
        try {
            const res = await aws.s3!.send(
                new GetObjectCommand({ Bucket: bucket, Key: key }),
            );
            const body = res.Body;
            if (body) {
                const bytes = await body.transformToByteArray();
                previewContent = new TextDecoder().decode(bytes);
            }
        } catch (e: any) {
            previewContent =
                "Error loading preview: " + (e.message || String(e));
        } finally {
            previewLoading = false;
        }
    }

    async function handleUpload() {
        if (!uploadInput) return;
        const file = uploadInput.files?.[0];
        if (!file || !aws.s3) return;
        try {
            uploading = true;
            const buffer = await file.arrayBuffer();
            await aws.s3.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: prefix + file.name,
                    Body: new Uint8Array(buffer),
                    ContentType: file.type || "application/octet-stream",
                }),
            );
            loadObjects();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            uploading = false;
        }
    }

    async function handleCreateFolder() {
        if (!aws.s3 || !folderName) return;
        try {
            creatingFolder = true;
            let key = prefix + folderName;
            if (!key.endsWith("/")) key += "/";
            await aws.s3.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: new Uint8Array(0),
                }),
            );
            showCreateFolder = false;
            folderName = "";
            loadObjects();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creatingFolder = false;
        }
    }

    async function handleDelete(key: string) {
        if (!aws.s3 || !confirm(`Delete ${key}?`)) return;
        try {
            loading = true;
            await aws.s3.send(
                new DeleteObjectCommand({ Bucket: bucket, Key: key }),
            );
            loadObjects();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleDownload(key: string) {
        try {
            const res = await aws.s3!.send(
                new GetObjectCommand({ Bucket: bucket, Key: key }),
            );
            const body = res.Body;
            if (body) {
                const bytes = await body.transformToByteArray();
                const blob = new Blob([bytes]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = key.split("/").pop() || "download";
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (e: any) {
            error = e.message || String(e);
        }
    }

    function navigateToFolder(key: string) {
        const url = new URL(window.location.href);
        url.searchParams.set("prefix", key);
        window.history.pushState({}, "", url.toString());
        // Triggers derived re-evaluation if we use $page, but since we are using relative navigation via goto in layout,
        // it's better to just use goto here for consistency.
        import("$app/navigation").then((m) => m.goto(url.toString()));
    }
</script>

{#if bucket}
    <div class="h-full relative overflow-hidden flex flex-col">
        {#if error}<div
                class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
            >
                {error}
            </div>{/if}

        <div
            class="p-2 bg-gray-900 border-b border-gray-800 flex items-center gap-4"
        >
            <div
                class="flex-1 flex items-center gap-1 text-xs text-gray-400 overflow-hidden"
            >
                <span class="text-blue-400 font-bold shrink-0">{bucket}</span>
                <span class="text-gray-600 shrink-0">/</span>
                <span class="truncate">{prefix}</span>
            </div>
            <div class="flex gap-2">
                <input
                    type="file"
                    bind:this={uploadInput}
                    onchange={handleUpload}
                    class="hidden"
                />
                <button
                    onclick={() => uploadInput?.click()}
                    disabled={uploading}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-[10px] font-bold transition flex items-center gap-1"
                >
                    {#if uploading}<span class="animate-spin">⟳</span>{/if} Upload
                </button>
                <button
                    onclick={() => (showCreateFolder = true)}
                    class="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded text-[10px] font-bold transition"
                    >New Folder</button
                >
            </div>
        </div>

        <PaginatedTable
            items={objects}
            {loading}
            onRefresh={() => {
                history = [];
                loadObjects();
            }}
            hasNext={!!marker}
            hasPrev={history.length > 0}
            onNext={() => loadObjects(marker)}
            onPrev={() => {
                history.pop();
                loadObjects(history[history.length - 1]);
            }}
            columns={[
                {
                    label: "Name",
                    key: "name",
                    format: (v, item) =>
                        (item.type === "folder" ? "📁 " : "📄 ") + v,
                },
                { label: "Size", key: "size" },
                { label: "Last Modified", key: "lastModified" },
            ]}
        >
            {#snippet actionsSnippet(item)}
                <div class="flex gap-2 justify-end">
                    {#if item.type === "file"}
                        <button
                            onclick={() => handlePreview(item.key)}
                            class="text-[10px] bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded border border-blue-500/30 transition"
                            >View</button
                        >
                        <button
                            onclick={() => handleDownload(item.key)}
                            class="text-[10px] bg-green-600/20 hover:bg-green-600/40 text-green-400 px-2 py-1 rounded border border-green-500/30 transition"
                            >↓</button
                        >
                    {/if}
                    <button
                        onclick={() => handleDelete(item.key)}
                        class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition"
                        >Delete</button
                    >
                </div>
            {/snippet}
            {#snippet rowClickSnippet(item)}
                {#if item.type === "folder"}
                    <button
                        class="absolute inset-0 z-0 opacity-0"
                        aria-label="Open folder"
                        onclick={() => navigateToFolder(item.key)}
                    ></button>
                {/if}
            {/snippet}
        </PaginatedTable>
    </div>
{:else}
    <div class="p-8 text-gray-500 italic">No bucket selected.</div>
{/if}

<Modal bind:open={showPreview} title="File Preview: {previewKey}">
    <div
        class="h-[70vh] flex flex-col p-4 bg-gray-950 rounded-lg overflow-hidden"
    >
        {#if previewLoading}
            <div
                class="flex-1 flex items-center justify-center text-blue-400 animate-pulse font-bold tracking-widest uppercase text-xs"
            >
                Loading Content...
            </div>
        {:else}
            <pre
                class="flex-1 bg-black border border-gray-800 p-4 rounded text-[10px] font-mono text-gray-300 overflow-auto whitespace-pre-wrap">{previewContent}</pre>
        {/if}
    </div>
</Modal>

<Modal bind:open={showCreateFolder} title="New Folder">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Folder Name</label
            >
            <input
                type="text"
                bind:value={folderName}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleCreateFolder}
                disabled={creatingFolder}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if creatingFolder}<span class="animate-spin">⟳</span>{/if} Create
                Folder
            </button>
        </div>
    </div>
</Modal>
