<script lang="ts">
    import { onMount } from "svelte";
    import {
        S3Client,
        ListBucketsCommand,
        ListObjectsV2Command,
    } from "@aws-sdk/client-s3";
    import { getAwsCredentials } from "./aws-creds";

    let buckets = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let client: S3Client | null = null;

    // Object browsing
    let selectedBucket = $state("");
    let objects = $state<any[]>([]);
    let objNextToken = $state<string | undefined>(undefined);
    let objLoading = $state(false);
    let prefix = $state("");

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new S3Client({
                region: creds.region || "us-east-1",
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            });
            await loadBuckets();
        } catch (e) {
            error = String(e);
        }
    });

    async function loadBuckets() {
        if (!client) return;
        try {
            loading = true;
            error = "";
            const resp = await client.send(new ListBucketsCommand({}));
            buckets = (resp.Buckets ?? []).map((b) => ({
                name: b.Name ?? "Unknown",
                creation_date: b.CreationDate?.toISOString() ?? null,
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
        objects = [];
        objNextToken = undefined;
        await loadObjects();
    }

    async function loadObjects(append = false) {
        if (!client) return;
        try {
            objLoading = true;
            error = "";
            const resp = await client.send(
                new ListObjectsV2Command({
                    Bucket: selectedBucket,
                    Prefix: prefix || undefined,
                    MaxKeys: 100,
                    ContinuationToken: append ? objNextToken : undefined,
                }),
            );
            const newItems = (resp.Contents ?? []).map((o) => ({
                key: o.Key ?? "",
                size: o.Size ?? 0,
                last_modified: o.LastModified?.toISOString() ?? null,
            }));
            objects = append ? [...objects, ...newItems] : newItems;
            objNextToken = resp.NextContinuationToken;
        } catch (e) {
            error = String(e);
        } finally {
            objLoading = false;
        }
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

{#if selectedBucket}
    <div class="flex items-center gap-2 mb-3">
        <button
            onclick={() => {
                selectedBucket = "";
                objects = [];
            }}
            class="text-xs text-blue-400 hover:underline">← Buckets</button
        >
        <span class="text-sm text-gray-400 font-mono">{selectedBucket}</span>
        <span class="text-gray-600">/</span>
        <input
            bind:value={prefix}
            placeholder="prefix/"
            class="flex-1 bg-gray-900 text-xs p-1.5 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
        />
        <button
            onclick={() => loadObjects()}
            class="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs rounded border border-gray-700"
            >Go</button
        >
    </div>
    <div
        class="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800"
    >
        {#each objects as obj}
            <div class="p-2 flex justify-between items-center text-xs">
                <span class="text-gray-200 truncate font-mono">{obj.key}</span>
                <span class="text-gray-500 shrink-0 ml-2"
                    >{formatSize(obj.size)}</span
                >
            </div>
        {/each}
        {#if !objLoading && objects.length === 0}<div
                class="p-6 text-center text-gray-600 text-sm"
            >
                No objects found.
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
    <div
        class="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800"
    >
        {#each buckets as b}
            <button
                onclick={() => browseBucket(b.name)}
                class="p-3 flex justify-between items-center hover:bg-gray-800/50 transition w-full text-left"
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
