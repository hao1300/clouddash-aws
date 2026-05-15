<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading } from "@mdi/js";

    import {
        DescribeSecurityGroupsCommand,
        CreateSecurityGroupCommand,
        DeleteSecurityGroupCommand,
    } from "@aws-sdk/client-ec2";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { confirmDialog } from "$lib/services/confirm.svelte";
    import { goto } from "$app/navigation";

    let sgs = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let showCreateModal = $state(false);
    let sgName = $state("");
    let description = $state("");
    let vpcId = $state("");
    let creating = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.ec2 && !__initLoaded) {
            __initLoaded = true;
            loadSgs();
        }
    });

    async function loadSgs() {
        if (!aws.ec2) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ec2.send(
                new DescribeSecurityGroupsCommand({}),
            );
            sgs = (res.SecurityGroups ?? []).map((sg) => ({
                id: sg.GroupId,
                name: sg.GroupName,
                description: sg.Description,
                vpc: sg.VpcId || "-",
                owner: sg.OwnerId,
            }));
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreate() {
        if (!aws.ec2 || !sgName || !description) return;
        try {
            creating = true;
            await aws.ec2.send(
                new CreateSecurityGroupCommand({
                    GroupName: sgName,
                    Description: description,
                    VpcId: vpcId || undefined,
                }),
            );
            actionMsg = `Security group ${sgName} created.`;
            showCreateModal = false;
            loadSgs();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(id: string) {
        if (!aws.ec2) return;
        if (!(await confirmDialog({ message: `Delete security group ${id}?`, confirmText: "Delete", destructive: true }))) return;
        try {
            loading = true;
            await aws.ec2.send(new DeleteSecurityGroupCommand({ GroupId: id }));
            actionMsg = `Security group ${id} deleted.`;
            loadSgs();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>
<div class="h-full flex flex-col overflow-hidden">
<TabBar
    tabs={[
        { id: "instances", label: "Instances", href: "/ec2/instances" },
        { id: "amis", label: "AMIs", href: "/ec2/amis" },
        { id: "volumes", label: "Volumes", href: "/ec2/volumes" },
        { id: "snapshots", label: "Snapshots", href: "/ec2/snapshots" },
        { id: "security-groups", label: "Security Groups", href: "/ec2/security-groups" },
        { id: "key-pairs", label: "Key Pairs", href: "/ec2/key-pairs" },
        { id: "elastic-ips", label: "Elastic IPs", href: "/ec2/elastic-ips" },
    ]}
    activeTab="security-groups"
/>
<div class="flex-1 overflow-hidden relative">
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
        items={sgs}
        {loading}
        onRefresh={loadSgs}
        columns={[
            {
                label: "Name",
                key: "name",
                onClick: (item) => goto(`/ec2/security-groups/${item.id}`),
            },
            { label: "Security Group ID", key: "id" },
            { label: "Description", key: "description" },
            { label: "VPC ID", key: "vpc" },
            { label: "Owner", key: "owner" },
        ]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showCreateModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Create Security Group</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => handleDelete(item.id)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Delete</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Security Group">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                for="sg-name"
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Group Name</label
            >
            <input
                id="sg-name"
                type="text"
                bind:value={sgName}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                for="sg-desc"
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Description</label
            >
            <input
                id="sg-desc"
                type="text"
                bind:value={description}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                for="sg-vpc"
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >VPC ID (Optional)</label
            >
            <input
                id="sg-vpc"
                type="text"
                bind:value={vpcId}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleCreate}
                disabled={creating}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if creating}<Icon path={mdiLoading} size={14} class="animate-spin" />{/if} Create
            </button>
        </div>
    </div>
</Modal>
</div>
</div>
