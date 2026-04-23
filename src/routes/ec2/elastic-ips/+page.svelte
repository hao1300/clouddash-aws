<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import {
        DescribeAddressesCommand,
        ReleaseAddressCommand,
        AllocateAddressCommand,
    } from "@aws-sdk/client-ec2";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let eips = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let __initLoaded = false;
    $effect(() => {
        if (aws.ec2 && !__initLoaded) {
            __initLoaded = true;
            loadEips();
        }
    });

    async function loadEips() {
        if (!aws.ec2) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ec2.send(new DescribeAddressesCommand({}));
            eips = (res.Addresses ?? []).map((eip) => {
                const nameTag = eip.Tags?.find((t) => t.Key === "Name");
                return {
                    id: eip.AllocationId,
                    name: nameTag?.Value ?? "-",
                    publicIp: eip.PublicIp,
                    privateIp: eip.PrivateIpAddress ?? "-",
                    instance: eip.InstanceId ?? "-",
                    networkInterface: eip.NetworkInterfaceId ?? "-",
                };
            });
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleAllocate() {
        if (!aws.ec2) return;
        try {
            loading = true;
            await aws.ec2.send(new AllocateAddressCommand({ Domain: "vpc" }));
            actionMsg = `Elastic IP allocated.`;
            loadEips();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleRelease(id: string, ip: string) {
        if (!aws.ec2 || !confirm(`Release Elastic IP ${ip}?`)) return;
        try {
            loading = true;
            await aws.ec2.send(new ReleaseAddressCommand({ AllocationId: id }));
            actionMsg = `Elastic IP ${ip} released.`;
            loadEips();
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
    activeTab="elastic-ips"
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
        items={eips}
        {loading}
        onRefresh={loadEips}
        columns={[
            { label: "Name", key: "name" },
            { label: "Public IP", key: "publicIp" },
            { label: "Allocation ID", key: "id" },
            { label: "Instance ID", key: "instance" },
            { label: "Private IP", key: "privateIp" },
        ]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={handleAllocate}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Allocate Elastic IP</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => handleRelease(item.id, item.publicIp)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Release</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
</div>
</div>
</div>
