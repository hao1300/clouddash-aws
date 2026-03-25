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
    import { invoke } from "@tauri-apps/api/core";
    import { settings } from "$lib/services/settings.svelte";
    import { toastService } from "$lib/services/toast.svelte";

    let bucket = $derived($page.params.bucketName || "");
    let prefix = $derived($page.url.searchParams.get("prefix") || "");

    let objects = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);
    let openDropdown = $state<string | null>(null);

    let showCreateFolder = $state(false);
    let folderName = $state("");
    let creatingFolder = $state(false);

    let uploadInput = $state<HTMLInputElement | null>(null);
    let uploading = $state(false);

    $effect(() => {
        if (bucket) {
            // we read prefix here so changes to it trigger the effect
            const currentPrefix = prefix;
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
        if (!bucket) return;
        try {
            loading = true;
            error = "";
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            const res = await s3Client.send(
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

    function navigateToDetail(key: string) {
        goto(`/s3/bucket/${encodeURIComponent(bucket)}/objects/detail/${key}`);
    }

    async function handleUpload() {
        if (!uploadInput) return;
        const file = uploadInput.files?.[0];
        if (!file || !bucket) return;
        try {
            uploading = true;
            const buffer = await file.arrayBuffer();
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            await s3Client.send(
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
        if (!bucket || !folderName) return;
        try {
            creatingFolder = true;
            let key = prefix + folderName;
            if (!key.endsWith("/")) key += "/";
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            await s3Client.send(
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
        if (!bucket || !confirm(`Delete ${key}?`)) return;
        try {
            loading = true;
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            await s3Client.send(
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
            const fileName = key.split("/").pop() || "download";
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            const res = await s3Client.send(
                new GetObjectCommand({ Bucket: bucket, Key: key }),
            );
            const body = res.Body;
            if (body) {
                const bytes = await body.transformToByteArray();
                
                if (settings.downloadFolder) {
                    let targetPath = `${settings.downloadFolder}\\${fileName}`;
                    
                    if (settings.downloadConflictMode === "rename") {
                        let counter = 1;
                        const nameParts = fileName.split('.');
                        const ext = nameParts.length > 1 ? `.${nameParts.pop()}` : '';
                        const baseName = nameParts.join('.');
                        
                        while (await invoke("file_exists", { path: targetPath })) {
                            targetPath = `${settings.downloadFolder}\\${baseName} (${counter})${ext}`;
                            counter++;
                        }
                    }

                    await invoke("save_file", { path: targetPath, data: Array.from(bytes) });
                    
                    const finalFileName = targetPath.split('\\').pop() || fileName;
                    toastService.success(`Downloaded ${finalFileName}`, 5000, () => {
                        invoke("open_folder", { path: settings.downloadFolder });
                    });
                } else {
                    const blob = new Blob([bytes]);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                    toastService.success(`Downloaded to your Downloads folder`, 5000);
                }
            }
        } catch (e: any) {
            console.error("Download failed", e);
            error = e.message || String(e);
            toastService.error(`Download failed: ${error}`);
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
                            : navigateToDetail(item.key),
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
                                        navigateToDetail(item.key);
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
