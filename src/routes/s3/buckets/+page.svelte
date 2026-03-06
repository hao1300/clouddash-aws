<script lang="ts">
    import {
        ListBucketsCommand,
        CreateBucketCommand,
        DeleteBucketCommand,
        DeleteObjectsCommand,
        ListObjectsV2Command,
        GetBucketLocationCommand,
    } from "@aws-sdk/client-s3";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let buckets = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let showCreateModal = $state(false);
    let newName = $state("");
    let region = $state("us-east-1");
    let creating = $state(false);

    $effect(() => {
        if (aws.s3 && buckets.length === 0) {
            loadBuckets();
        }
    });

    async function loadBuckets() {
        if (!aws.s3) return;
        try {
            loading = true;
            error = "";
            const res = await aws.s3.send(new ListBucketsCommand({}));
            const raw = res.Buckets || [];
            buckets = raw.map((b) => ({
                name: b.Name,
                creation: b.CreationDate?.toLocaleString() ?? "-",
                region: "Loading...",
            }));

            // Fetch regions in background
            (async () => {
                for (let i = 0; i < buckets.length; i++) {
                    const b = buckets[i];
                    try {
                        const loc = await aws.s3!.send(
                            new GetBucketLocationCommand({ Bucket: b.name }),
                        );
                        b.region = loc.LocationConstraint || "us-east-1";
                        buckets = [...buckets];
                    } catch (e) {
                        b.region = "-";
                    }
                }
            })();
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
            await aws.s3.send(new DeleteBucketCommand({ Bucket: name }));
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
            let token: string | undefined;
            do {
                const res: any = await aws.s3.send(
                    new ListObjectsV2Command({
                        Bucket: name,
                        ContinuationToken: token,
                    }),
                );
                const objects = res.Contents || [];
                if (objects.length > 0) {
                    await aws.s3.send(
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
        goto(`/s3/objects?bucket=${name}`);
    }
</script>

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
            { label: "Region", key: "region" },
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
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => handleEmpty(item.name)}
                    class="text-[10px] bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 px-2 py-1 rounded border border-yellow-500/30 transition shadow"
                    >Empty</button
                >
                <button
                    onclick={() => handleDelete(item.name)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Delete</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
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
