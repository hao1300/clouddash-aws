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
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import hljs from 'highlight.js';
    import 'highlight.js/styles/github-dark.css';

    let bucket = $derived($page.params.bucketName || "");
    let prefix = $derived($page.url.searchParams.get("prefix") || "");

    let objects = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);
    let openDropdown = $state<string | null>(null);

    let previewKey = $state("");
    let previewContent = $state("");
    let previewHtml = $state("");
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

    $effect(() => {
        const resources = [
            { name: bucket, href: `/s3/bucket/${encodeURIComponent(bucket)}/objects` }
        ];
        if (prefix) {
            const parts = prefix.split('/').filter(Boolean);
            let currentPrefix = '';
            for (const part of parts) {
                currentPrefix += part + '/';
                resources.push({
                    name: part,
                    href: `/s3/bucket/${encodeURIComponent(bucket)}/objects?prefix=${encodeURIComponent(currentPrefix)}`
                });
            }
        }
        titleService.setResources(resources);
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
                const ext = key.split('.').pop()?.toLowerCase() || '';
                
                if (ext && hljs.getLanguage(ext)) {
                    previewHtml = hljs.highlight(previewContent, { language: ext }).value;
                } else {
                    previewHtml = hljs.highlightAuto(previewContent).value;
                }
            }
        } catch (e: any) {
            previewContent =
                "Error loading preview: " + (e.message || String(e));
            previewHtml = previewContent;
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
        const url = new URL($page.url);
        url.searchParams.set("prefix", key);
        goto(url.toString());
    }
</script>
<svelte:window onclick={() => (openDropdown = null)} />

<div class="h-full relative overflow-hidden flex flex-col bg-gray-950">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div class="flex-1 min-h-0 bg-gray-950 {error ? 'pt-8' : ''}">
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
                    onClick: (item) =>
                        item.type === "folder"
                            ? navigateToFolder(item.key)
                            : handlePreview(item.key),
                },
                { label: "Size", key: "size" },
                { label: "Last Modified", key: "lastModified" },
            ]}
        >
            {#snippet headerActionsSnippet()}
                <input
                    type="file"
                    bind:this={uploadInput}
                    onchange={handleUpload}
                    class="hidden"
                />
                <button
                    onclick={() => uploadInput?.click()}
                    disabled={uploading}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-[10px] font-bold transition flex items-center gap-1 shadow"
                >
                    {#if uploading}<span class="animate-spin">⟳</span>{/if} Upload
                </button>
                <button
                    onclick={() => (showCreateFolder = true)}
                    class="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded text-[10px] font-bold transition shadow"
                    >New Folder</button
                >
            {/snippet}
            {#snippet actionsSnippet(item)}
                <div class="flex justify-end relative">
                    <button
                        onclick={(e) => {
                            e.stopPropagation();
                            openDropdown = openDropdown === item.key ? null : item.key;
                        }}
                        class="text-xs text-gray-400 hover:text-white px-2 py-1 border border-transparent hover:border-gray-700 rounded transition"
                    >
                        ⋮
                    </button>
                    {#if openDropdown === item.key}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            onclick={(e) => e.stopPropagation()}
                            class="absolute right-0 top-[100%] mt-1 w-32 bg-gray-900 border border-gray-700 rounded shadow-lg z-50 overflow-hidden"
                        >
                            {#if item.type === "file"}
                                <button
                                    onclick={() => {
                                        openDropdown = null;
                                        handlePreview(item.key);
                                    }}
                                    class="w-full text-left px-3 py-2 text-[11px] text-blue-400 hover:bg-gray-800 transition block border-b border-gray-800"
                                    >View</button
                                >
                                <button
                                    onclick={() => {
                                        openDropdown = null;
                                        handleDownload(item.key);
                                    }}
                                    class="w-full text-left px-3 py-2 text-[11px] text-green-400 hover:bg-gray-800 transition block border-b border-gray-800"
                                    >Download</button
                                >
                            {/if}
                            <button
                                onclick={() => {
                                    openDropdown = null;
                                    handleDelete(item.key);
                                }}
                                class="w-full text-left px-3 py-2 text-[11px] text-red-400 hover:bg-gray-800 transition block"
                                >Delete</button
                            >
                        </div>
                    {/if}
                </div>
            {/snippet}
        </PaginatedTable>
    </div>
</div>

<Modal
    bind:open={showPreview}
    title="File Preview: {previewKey}"
    maxWidth="max-w-4xl"
>
    <div class="h-[70vh] flex flex-col bg-gray-950 rounded-lg overflow-hidden">
        {#if previewLoading}
            <div
                class="flex-1 flex items-center justify-center text-blue-400 animate-pulse font-bold tracking-widest uppercase text-xs"
            >
                Loading Content...
            </div>
        {:else}
            <pre class="flex-1 bg-black border border-gray-800 p-4 rounded text-[10px] font-mono text-gray-300 overflow-auto whitespace-pre-wrap hljs">{@html previewHtml}</pre>
        {/if}
    </div>
</Modal>

<Modal bind:open={showCreateFolder} title="New Folder">
    <div class="space-y-4 text-gray-300">
        <div>
            <label
                for="folderName"
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Folder Name</label
            >
            <input
                id="folderName"
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
