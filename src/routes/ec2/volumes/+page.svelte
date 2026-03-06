<script lang="ts">
    import { DescribeVolumesCommand, CreateVolumeCommand, DeleteVolumeCommand } from "@aws-sdk/client-ec2";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let volumes = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let showCreateModal = $state(false);
    let size = $state(8);
    let az = $state("us-east-1a");
    let creating = $state(false);

    $effect(() => {
        if (aws.ec2 && volumes.length === 0) {
            loadVolumes();
        }
    });

    async function loadVolumes() {
        if (!aws.ec2) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ec2.send(new DescribeVolumesCommand({}));
            volumes = (res.Volumes ?? []).map(vol => {
                const nameTag = vol.Tags?.find(t => t.Key === "Name");
                return {
                    id: vol.VolumeId,
                    name: nameTag?.Value ?? "-",
                    size: vol.Size + " GiB",
                    state: vol.State,
                    type: vol.VolumeType,
                    az: vol.AvailabilityZone,
                    creation: vol.CreateTime?.toLocaleString() ?? "-"
                };
            });
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreate() {
        if (!aws.ec2) return;
        try {
            creating = true;
            await aws.ec2.send(new CreateVolumeCommand({ Size: size, AvailabilityZone: az, VolumeType: "gp3" }));
            actionMsg = `Volume created in ${az}.`;
            showCreateModal = false;
            loadVolumes();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(id: string) {
        if (!aws.ec2 || !confirm(`Delete volume ${id}?`)) return;
        try {
            loading = true;
            await aws.ec2.send(new DeleteVolumeCommand({ VolumeId: id }));
            actionMsg = `Volume ${id} deleted.`;
            loadVolumes();
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
        items={volumes}
        {loading}
        onRefresh={loadVolumes}
        columns={[
            { label: "Name", key: "name" },
            { label: "Volume ID", key: "id" },
            { label: "Size", key: "size" },
            { label: "State", key: "state" },
            { label: "Type", key: "type" },
            { label: "Availability Zone", key: "az" },
            { label: "Created", key: "creation" },
        ]}
    >
        {#snippet headerActionsSnippet()}
            <button onclick={() => showCreateModal = true} class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow">Create Volume</button>
        {#/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button onclick={() => handleDelete(item.id)} class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow">Delete</button>
            </div>
        {#/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Volume">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Size (GiB)</label>
            <input type="number" bind:value={size} class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white" />
        </div>
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Availability Zone</label>
            <input type="text" bind:value={az} class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white" />
        </div>
        <div class="flex justify-end pt-2">
            <button onclick={handleCreate} disabled={creating} class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2">
                {#if creating}<span class="animate-spin">⟳</span>{/if} Create
            </button>
        </div>
    </div>
</Modal>
