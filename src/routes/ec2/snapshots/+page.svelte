<script lang="ts">
    import { DescribeSnapshotsCommand, CreateSnapshotCommand, DeleteSnapshotCommand } from "@aws-sdk/client-ec2";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let snapshots = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let showCreateModal = $state(false);
    let volumeId = $state("");
    let description = $state("");
    let creating = $state(false);

    $effect(() => {
        if (aws.ec2 && snapshots.length === 0) {
            loadSnapshots();
        }
    });

    async function loadSnapshots() {
        if (!aws.ec2) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ec2.send(new DescribeSnapshotsCommand({ OwnerIds: ["self"] }));
            snapshots = (res.Snapshots ?? []).map(snap => ({
                id: snap.SnapshotId,
                description: snap.Description || "-",
                size: snap.VolumeSize + " GiB",
                state: snap.State,
                volume: snap.VolumeId,
                start: snap.StartTime?.toLocaleString() ?? "-"
            }));
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreate() {
        if (!aws.ec2 || !volumeId) return;
        try {
            creating = true;
            await aws.ec2.send(new CreateSnapshotCommand({ VolumeId: volumeId, Description: description }));
            actionMsg = `Snapshot creation initiated for ${volumeId}.`;
            showCreateModal = false;
            loadSnapshots();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(id: string) {
        if (!aws.ec2 || !confirm(`Delete snapshot ${id}?`)) return;
        try {
            loading = true;
            await aws.ec2.send(new DeleteSnapshotCommand({ SnapshotId: id }));
            actionMsg = `Snapshot ${id} deleted.`;
            loadSnapshots();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}

    <PaginatedTable
        items={snapshots}
        {loading}
        onRefresh={loadSnapshots}
        columns={[
            { label: "Snapshot ID", key: "id" },
            { label: "Description", key: "description" },
            { label: "Size", key: "size" },
            { label: "State", key: "state" },
            { label: "Volume ID", key: "volume" },
            { label: "Started", key: "start" },
        ]}
    >
        {#snippet headerActionsSnippet()}
            <button onclick={() => showCreateModal = true} class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow">Create Snapshot</button>
        {#/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button onclick={() => handleDelete(item.id)} class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow">Delete</button>
            </div>
        {#/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Snapshot">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Volume ID</label>
            <input type="text" bind:value={volumeId} class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white" />
        </div>
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Description (Optional)</label>
            <input type="text" bind:value={description} class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white" />
        </div>
        <div class="flex justify-end pt-2">
            <button onclick={handleCreate} disabled={creating} class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2">
                {#if creating}<span class="animate-spin">⟳</span>{/if} Create
            </button>
        </div>
    </div>
</Modal>
