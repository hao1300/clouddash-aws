<script lang="ts">
    import { onMount } from "svelte";
    import {
        S3Client,
        ListBucketsCommand,
        ListObjectsV2Command,
        GetObjectCommand,
        GetBucketLocationCommand,
        PutObjectCommand,
        DeleteObjectCommand,
        CreateBucketCommand,
        DeleteBucketCommand,
    } from "@aws-sdk/client-s3";
    import { fetch } from "@tauri-apps/plugin-http";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    // --- Service Layout State ---
    const tabs = [{ id: "buckets", label: "Buckets" }];
    let activeTab = $state("buckets");

    // --- Shared State ---
    let error = $state("");
    let loading = $state(false);
    let s3Client: S3Client | null = null;

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

    // --- Modals & Uploads ---
    let showCreateBucket = $state(false);
    let newBucketName = $state("");
    let newBucketLoading = $state(false);

    let showCreateFolder = $state(false);
    let newFolderName = $state("");
    let newFolderLoading = $state(false);

    let uploadFileInput = $state<HTMLInputElement | null>(null);
    let uploadLoading = $state(false);

    let showDeleteConfirm = $state(false);
    let itemToDelete = $state<{
        type: "bucket" | "file" | "folder";
        key: string;
        name: string;
    } | null>(null);
    let deleteLoading = $state(false);

    function makeS3Client(region: string, creds: any): S3Client {
        return new S3Client({
            region,
            credentials: {
                accessKeyId: creds.access_key_id,
                secretAccessKey: creds.secret_access_key,
                ...(creds.session_token
                    ? { sessionToken: creds.session_token }
                    : {}),
            },
            requestHandler: {
                handle: async (request: any) => {
                    const proto =
                        request.protocol?.replace(/:$/, "") || "https";
                    let url = request.hostname
                        ? `${proto}://${request.hostname}${request.port ? ":" + request.port : ""}${request.path}`
                        : request.path;

                    // Append query parameters from Smithy request
                    if (
                        request.query &&
                        Object.keys(request.query).length > 0
                    ) {
                        const qs = Object.entries(request.query)
                            .map(([k, v]) => {
                                if (Array.isArray(v)) {
                                    return v
                                        .map(
                                            (vi) =>
                                                `${encodeURIComponent(k)}=${encodeURIComponent(String(vi))}`,
                                        )
                                        .join("&");
                                }
                                return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
                            })
                            .join("&");
                        url += (url.includes("?") ? "&" : "?") + qs;
                    }

                    const headers: Record<string, string> = {};
                    if (request.headers) {
                        for (const [key, value] of Object.entries(
                            request.headers,
                        )) {
                            headers[key] = String(value);
                        }
                    }

                    // Don't send body for GET/HEAD - it breaks SigV4
                    const hasBody =
                        request.method !== "GET" &&
                        request.method !== "HEAD" &&
                        request.body != null;

                    const resp = await fetch(url, {
                        method: request.method,
                        headers,
                        body: hasBody ? request.body : undefined,
                    });

                    const respHeaders: Record<string, string> = {};
                    resp.headers.forEach((value: string, key: string) => {
                        respHeaders[key] = value;
                    });

                    const bodyBytes = new Uint8Array(await resp.arrayBuffer());

                    // Create a ReadableStream so Smithy's transformToByteArray() works
                    const bodyStream = new ReadableStream({
                        start(controller) {
                            controller.enqueue(bodyBytes);
                            controller.close();
                        },
                    });

                    return {
                        response: new (
                            await import("@smithy/protocol-http")
                        ).HttpResponse({
                            statusCode: resp.status,
                            headers: respHeaders,
                            body: bodyStream,
                        }),
                    };
                },
            } as any,
        });
    }

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            s3Client = makeS3Client(creds.region || "us-east-1", creds);
            await loadBuckets();
        } catch (e) {
            error = String(e);
        }
    });

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

    async function clientForBucket(bucket: string): Promise<S3Client> {
        if (!s3Client) throw new Error("S3 not initialized");
        try {
            const loc = await s3Client.send(
                new GetBucketLocationCommand({ Bucket: bucket }),
            );
            let region = loc.LocationConstraint || "us-east-1";
            if (!region) region = "us-east-1";

            const creds = await getAwsCredentials();
            return makeS3Client(region, creds);
        } catch {
            return s3Client;
        }
    }

    async function createBucket() {
        if (!newBucketName || !s3Client) return;
        try {
            newBucketLoading = true;
            error = "";
            await s3Client.send(
                new CreateBucketCommand({ Bucket: newBucketName }),
            );
            showCreateBucket = false;
            newBucketName = "";
            await loadBuckets();
        } catch (e) {
            error = String(e);
        } finally {
            newBucketLoading = false;
        }
    }

    async function deleteBucket(name: string) {
        if (!s3Client) return;
        try {
            deleteLoading = true;
            error = "";
            await s3Client.send(new DeleteBucketCommand({ Bucket: name }));
            showDeleteConfirm = false;
            itemToDelete = null;
            await loadBuckets();
        } catch (e) {
            error = String(e);
        } finally {
            deleteLoading = false;
        }
    }

    async function loadBuckets() {
        if (!s3Client) return;
        try {
            loading = true;
            error = "";
            const resp = await s3Client.send(new ListBucketsCommand({}));
            buckets = (resp.Buckets || []).map((b) => ({
                name: b.Name || "Unknown",
                creation_date: b.CreationDate
                    ? b.CreationDate.toISOString()
                    : null,
            }));
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

    async function createFolder() {
        if (!newFolderName || !selectedBucket) return;
        try {
            newFolderLoading = true;
            error = "";
            let folderKey = prefix + newFolderName;
            if (!folderKey.endsWith("/")) folderKey += "/";

            const bc = await clientForBucket(selectedBucket);
            await bc.send(
                new PutObjectCommand({
                    Bucket: selectedBucket,
                    Key: folderKey,
                    Body: new Uint8Array(0),
                }),
            );
            showCreateFolder = false;
            newFolderName = "";
            await loadObjects();
        } catch (e) {
            error = String(e);
        } finally {
            newFolderLoading = false;
        }
    }

    async function deleteObject(key: string) {
        if (!selectedBucket) return;
        try {
            deleteLoading = true;
            error = "";
            const bc = await clientForBucket(selectedBucket);
            await bc.send(
                new DeleteObjectCommand({
                    Bucket: selectedBucket,
                    Key: key,
                }),
            );
            showDeleteConfirm = false;
            itemToDelete = null;
            if (previewKey === key) previewKey = "";
            await loadObjects();
        } catch (e) {
            error = String(e);
        } finally {
            deleteLoading = false;
        }
    }

    async function onFileUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        try {
            uploadLoading = true;
            error = "";

            const buffer = await file.arrayBuffer();
            const body = new Uint8Array(buffer);

            const bc = await clientForBucket(selectedBucket);
            await bc.send(
                new PutObjectCommand({
                    Bucket: selectedBucket,
                    Key: prefix + file.name,
                    Body: body,
                    ContentType: file.type || "application/octet-stream",
                }),
            );

            input.value = ""; // Reset
            await loadObjects();
        } catch (e) {
            error = String(e);
        } finally {
            uploadLoading = false;
        }
    }

    async function loadObjects(token?: string) {
        try {
            objLoading = true;
            error = "";

            const bc = await clientForBucket(selectedBucket);
            const resp = await bc.send(
                new ListObjectsV2Command({
                    Bucket: selectedBucket,
                    Prefix: prefix || undefined,
                    Delimiter: "/",
                    MaxKeys: 100,
                    ContinuationToken: token || undefined,
                }),
            );

            const newItems: any[] = [];
            // Add folders (common prefixes) only on the first page
            if (!token) {
                const cps = resp.CommonPrefixes || [];
                for (const cp of cps) {
                    newItems.push({
                        type: "folder",
                        key: cp.Prefix || "",
                        name: (cp.Prefix || "").slice(prefix.length),
                        size: null,
                        lastModified: null,
                    });
                }
            }
            // Add files
            for (const o of resp.Contents || []) {
                const key = o.Key || "";
                if (!key || key === prefix) continue;
                newItems.push({
                    type: "file",
                    key,
                    name: key.slice(prefix.length),
                    size: o.Size ?? 0,
                    lastModified: o.LastModified
                        ? o.LastModified.toISOString()
                        : null,
                });
            }
            objects = newItems;
            pushToken(objTokenMap, resp.NextContinuationToken || undefined);
            objCurrentToken = resp.NextContinuationToken || undefined;
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
            const bc = await clientForBucket(selectedBucket);
            const resp = await bc.send(
                new GetObjectCommand({
                    Bucket: selectedBucket,
                    Key: key,
                }),
            );
            const contentType = resp.ContentType || "application/octet-stream";
            const body = resp.Body;

            if (!body) {
                previewContent = "(empty)";
                previewType = "text";
                return;
            }

            const bytes = await body.transformToByteArray();
            const isText =
                contentType.startsWith("text/") ||
                contentType.includes("json") ||
                contentType.includes("xml") ||
                contentType.includes("yaml") ||
                contentType.includes("javascript") ||
                contentType.includes("csv");

            if (isText) {
                previewType = "text";
                previewContent = new TextDecoder().decode(bytes);
            } else {
                previewType = "binary";
                previewContent = "";
            }
        } catch (e) {
            error = String(e);
            previewContent = String(e);
            previewType = "text";
        } finally {
            previewLoading = false;
        }
    }

    async function downloadFile(key: string) {
        try {
            const bc = await clientForBucket(selectedBucket);
            const resp = await bc.send(
                new GetObjectCommand({
                    Bucket: selectedBucket,
                    Key: key,
                }),
            );
            const contentType = resp.ContentType || "application/octet-stream";
            const body = resp.Body;
            if (!body) return;

            const bytes = await body.transformToByteArray();
            const blob = new Blob([bytes], { type: contentType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = key.split("/").pop() ?? key;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            error = String(e);
        }
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

    <!-- Modals -->
    {#if showCreateBucket}
        <div
            class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
            <div
                class="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-2xl"
            >
                <h3 class="text-lg font-semibold text-white mb-4">
                    Create Bucket
                </h3>
                <input
                    type="text"
                    bind:value={newBucketName}
                    placeholder="Bucket name"
                    class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 text-gray-200 transition-colors mb-4"
                />
                <div class="flex justify-end gap-2">
                    <button
                        onclick={() => {
                            showCreateBucket = false;
                            newBucketName = "";
                        }}
                        class="px-4 py-2 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
                        >Cancel</button
                    >
                    <button
                        onclick={createBucket}
                        disabled={!newBucketName || newBucketLoading}
                        class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-bold transition shadow"
                    >
                        {newBucketLoading ? "Creating..." : "Create"}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showCreateFolder}
        <div
            class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
            <div
                class="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-2xl"
            >
                <h3 class="text-lg font-semibold text-white mb-4">
                    Create Folder
                </h3>
                <p class="text-xs text-gray-400 mb-4">
                    Creates an empty 0-byte object with a trailing slash in
                    <span class="font-mono text-blue-300"
                        >{selectedBucket}/{prefix}</span
                    >
                </p>
                <input
                    type="text"
                    bind:value={newFolderName}
                    placeholder="Folder name"
                    class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 text-gray-200 transition-colors mb-4"
                />
                <div class="flex justify-end gap-2">
                    <button
                        onclick={() => {
                            showCreateFolder = false;
                            newFolderName = "";
                        }}
                        class="px-4 py-2 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
                        >Cancel</button
                    >
                    <button
                        onclick={createFolder}
                        disabled={!newFolderName || newFolderLoading}
                        class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-bold transition shadow"
                    >
                        {newFolderLoading ? "Creating..." : "Create Folder"}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showDeleteConfirm && itemToDelete}
        <div
            class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
            <div
                class="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-2xl"
            >
                <h3 class="text-lg font-semibold text-red-400 mb-4">
                    Confirm Deletion
                </h3>
                <p class="text-sm text-gray-300 mb-4 break-all">
                    Are you sure you want to delete the
                    <strong class="text-white">{itemToDelete.type}</strong>:
                    <br />
                    <span class="font-mono text-red-300 mt-2 block"
                        >{itemToDelete.name}</span
                    >
                </p>
                {#if itemToDelete.type === "bucket"}
                    <p class="text-xs text-yellow-500 mb-4">
                        Warning: Bucket must be empty before it can be deleted!
                    </p>
                {/if}
                {#if itemToDelete.type === "folder"}
                    <p class="text-xs text-yellow-500 mb-4">
                        Warning: Deleting a folder only deletes its marker
                        object. The contents are not deleted!
                    </p>
                {/if}
                <div class="flex justify-end gap-2">
                    <button
                        onclick={() => {
                            showDeleteConfirm = false;
                            itemToDelete = null;
                        }}
                        class="px-4 py-2 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
                        >Cancel</button
                    >
                    <button
                        onclick={() => {
                            if (!itemToDelete) return;
                            if (itemToDelete.type === "bucket") {
                                deleteBucket(itemToDelete.name);
                            } else {
                                deleteObject(itemToDelete.key);
                            }
                        }}
                        disabled={deleteLoading}
                        class="bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-bold transition shadow"
                    >
                        {deleteLoading ? "Deleting..." : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <div class="h-full {error ? 'pt-8' : ''}">
        <!-- Hidden file input for uploads -->
        <input
            type="file"
            class="hidden"
            bind:this={uploadFileInput}
            onchange={onFileUpload}
        />

        {#if previewKey}
            <!-- Preview View -->
            <div class="h-full flex flex-col p-4 pr-1 bg-gray-950">
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
                    class="flex-1 overflow-auto bg-gray-900 rounded-lg border border-gray-800 text-sm shadow-inner p-4 pr-1 relative"
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
                        {#snippet headerActionsSnippet()}
                            <button
                                onclick={() => uploadFileInput?.click()}
                                disabled={uploadLoading}
                                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-semibold shadow transition"
                            >
                                {uploadLoading ? "Uploading..." : "⬆ Upload File"}
                            </button>
                            <button
                                onclick={() => {
                                    newFolderName = "";
                                    showCreateFolder = true;
                                }}
                                class="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-3 py-1.5 rounded text-xs font-semibold transition shadow"
                            >
                                📁 Create Folder
                            </button>
                        {/snippet}
                        {#snippet actionsSnippet(item)}
                            <div class="flex justify-end gap-2">
                                {#if item.type !== "folder"}
                                    <button
                                        onclick={() => downloadFile(item.key)}
                                        class="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-xs transition"
                                        title="Download"
                                        >⬇</button
                                    >
                                {/if}
                                <button
                                    onclick={() => {
                                        itemToDelete = {
                                            type: item.type,
                                            key: item.key,
                                            name: item.name,
                                        };
                                        showDeleteConfirm = true;
                                    }}
                                    class="text-red-400 hover:text-white bg-red-900/30 hover:bg-red-800 px-3 py-1 rounded text-xs transition"
                                    title="Delete"
                                    >🗑</button
                                >
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
                    <button
                        onclick={() => {
                            newBucketName = "";
                            showCreateBucket = true;
                        }}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-semibold shadow transition"
                    >
                        + Create Bucket
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <div class="flex justify-end gap-2">
                        <button
                            onclick={() => {
                                itemToDelete = {
                                    type: "bucket",
                                    key: item.name,
                                    name: item.name,
                                };
                                showDeleteConfirm = true;
                            }}
                            class="text-red-400 hover:text-white bg-red-900/30 hover:bg-red-800 px-3 py-1 rounded text-xs transition"
                            title="Delete Bucket"
                            >🗑</button
                        >
                    </div>
                {/snippet}
            </PaginatedTable>
        {/if}
    </div>
</ServiceLayout>
