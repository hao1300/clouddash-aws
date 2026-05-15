<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import {
        DescribeImagesCommand,
        DeregisterImageCommand,
    } from "@aws-sdk/client-ec2";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { confirmDialog } from "$lib/services/confirm.svelte";

    let amis = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let __initLoaded = false;
    $effect(() => {
        if (aws.ec2 && !__initLoaded) {
            __initLoaded = true;
            loadAmis();
        }
    });

    async function loadAmis() {
        if (!aws.ec2) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ec2.send(
                new DescribeImagesCommand({ Owners: ["self"] }),
            );
            amis = (res.Images ?? []).map((img) => ({
                id: img.ImageId,
                name: img.Name || img.ImageId,
                state: img.State,
                creation: img.CreationDate
                    ? new Date(img.CreationDate).toLocaleString()
                    : "-",
                arch: img.Architecture,
                visibility: img.Public ? "Public" : "Private",
            }));
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleDeregister(id: string) {
        if (!aws.ec2) return;
        if (!(await confirmDialog({ message: `Deregister AMI ${id}?`, confirmText: "Deregister", destructive: true }))) return;
        try {
            loading = true;
            await aws.ec2.send(new DeregisterImageCommand({ ImageId: id }));
            actionMsg = `AMI ${id} deregistered.`;
            loadAmis();
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
    activeTab="amis"
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
        items={amis}
        {loading}
        onRefresh={loadAmis}
        columns={[
            { label: "Name", key: "name" },
            { label: "AMI ID", key: "id" },
            { label: "State", key: "state" },
            { label: "Creation Date", key: "creation" },
            { label: "Architecture", key: "arch" },
            { label: "Visibility", key: "visibility" },
        ]}
    >
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => handleDeregister(item.id)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Deregister</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
</div>
</div>
</div>
