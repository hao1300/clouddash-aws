<script lang="ts">
    import {
        ListBucketsCommand,
        CreateBucketCommand,
        DeleteBucketCommand,
        DeleteObjectsCommand,
        ListObjectsV2Command,
    } from "@aws-sdk/client-s3";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";

    let buckets = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let openDropdown = $state<string | null>(null);

    let showCreateModal = $state(false);
    let newName = $state("");
    let region = $state("us-east-1");
    let creating = $state(false);

    let __loadBuckets_loaded = false;
    $effect(() => {
        if (aws.s3 && !__loadBuckets_loaded) {
            __loadBuckets_loaded = true;
            loadBuckets();
        }
    });

    $effect(() => {
        titleService.setResource("", undefined, $page.url.pathname);
    });
    async function loadBuckets() {
        if (!aws.s3) return;
        try {
            loading = true;
            error = "";
            const res = await aws.s3.send(new ListBucketsCommand({}));
            const raw = res.Buckets || [];
            buckets = raw.map((b: any) => ({
                name: b.Name,
                creation: b.CreationDate?.toLocaleString() ?? "-",
                region: b.BucketRegion || "-",
            }));
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreate() {
        if (!aws.s3 || !newName) return;
        try {
            creating = true;
            const params: any = { Bucket: newName };
            if (region !== "us-east-1") {
                params.CreateBucketConfiguration = {
                    LocationConstraint: region,
                };
            }
            await aws.s3.send(new CreateBucketCommand(params));
            actionMsg = `Bucket ${newName} created.`;
            showCreateModal = false;
            newName = "";
            loadBuckets();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(name: string) {
        if (!aws.s3 || !confirm(`Delete bucket ${name}?`)) return;
        try {
            loading = true;
            const s3Client = await aws.getS3ClientForBucket(name);
            if (!s3Client) throw new Error("Unable to obtain S3 client for region.");
            await s3Client.send(new DeleteBucketCommand({ Bucket: name }));
            actionMsg = `Bucket ${name} deleted.`;
            loadBuckets();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleEmpty(name: string) {
        if (
            !aws.s3 ||
            !confirm(`Empty bucket ${name}? All objects will be deleted.`)
        )
            return;
        try {
            loading = true;
            actionMsg = `Emptying bucket ${name}...`;
            const s3Client = await aws.getS3ClientForBucket(name);
            if (!s3Client) throw new Error("Unable to obtain S3 client for region.");
            
            let token: string | undefined;
            do {
                const res: any = await s3Client.send(
                    new ListObjectsV2Command({
                        Bucket: name,
                        ContinuationToken: token,
                    }),
                );
                const objects = res.Contents || [];
                if (objects.length > 0) {
                    await s3Client.send(
                        new DeleteObjectsCommand({
                            Bucket: name,
                            Delete: {
                                Objects: objects.map((o: any) => ({
                                    Key: o.Key,
                                })),
                                Quiet: true,
                            },
                        }),
                    );
                }
                token = res.NextContinuationToken;
            } while (token);
            actionMsg = `Bucket ${name} emptied.`;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleSelectBucket(name: string) {
        goto(`/s3/bucket/${encodeURIComponent(name)}/objects`);
    }
</script>

<svelte:window onclick={() => (openDropdown = null)} />

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}
    {#if actionMsg}<div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30"
        >
            {actionMsg}
        </div>{/if}

    <div class="flex-1 min-h-0 {error || actionMsg ? 'pt-8' : ''}">
        <PaginatedTable
            items={buckets}
            {loading}
            onRefresh={loadBuckets}
            columns={[
                {
                    label: "Bucket Name",
                    key: "name",
                    onClick: (item) => handleSelectBucket(item.name),
                    format: (v) => "🪣 " + v,
                },
                { label: "Creation Date", key: "creation" },
            ]}
        >
            {#snippet headerActionsSnippet()}
                <button
                    onclick={() => (showCreateModal = true)}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                    >Create Bucket</button
                >
            {/snippet}
            {#snippet actionsSnippet(item)}
                <div class="flex justify-end relative">
                    <button
                        onclick={(e) => {
                            e.stopPropagation();
                            openDropdown =
                                openDropdown === item.name ? null : item.name;
                        }}
                        class="text-xs text-gray-400 hover:text-white px-2 py-1 border border-transparent hover:border-gray-700 rounded transition"
                    >
                        ⋮
                    </button>
                    {#if openDropdown === item.name}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            onclick={(e) => e.stopPropagation()}
                            class="absolute right-0 top-[100%] mt-1 w-32 bg-gray-900 border border-gray-700 rounded shadow-lg z-50 overflow-hidden"
                        >
                            <button
                                onclick={() => {
                                    openDropdown = null;
                                    handleEmpty(item.name);
                                }}
                                class="w-full text-left px-3 py-2 text-[11px] text-yellow-400 hover:bg-gray-800 transition block border-b border-gray-800"
                                >Empty</button
                            >
                            <button
                                onclick={() => {
                                    openDropdown = null;
                                    handleDelete(item.name);
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

<Modal bind:open={showCreateModal} title="Create Bucket">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                for="bucketName"
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Bucket Name</label
            >
            <input
                id="bucketName"
                type="text"
                bind:value={newName}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                for="bucketRegion"
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Region</label
            >
            <select
                id="bucketRegion"
                bind:value={region}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            >
                <option value="us-east-1">us-east-1 (N. Virginia)</option>
                <option value="us-east-2">us-east-2 (Ohio)</option>
                <option value="us-west-1">us-west-1 (N. California)</option>
                <option value="us-west-2">us-west-2 (Oregon)</option>
                <option value="eu-west-1">eu-west-1 (Ireland)</option>
                <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
                <option value="ap-southeast-1"
                    >ap-southeast-1 (Singapore)</option
                >
                <option value="ap-southeast-2">ap-southeast-2 (Sydney)</option>
                <option value="ap-northeast-1">ap-northeast-1 (Tokyo)</option>
            </select>
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleCreate}
                disabled={creating}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if creating}<span class="animate-spin">⟳</span>{/if} Create
            </button>
        </div>
    </div>
</Modal>
