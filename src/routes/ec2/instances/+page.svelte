<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import Select from "$lib/components/Select.svelte";
    import { mdiCircle } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    import {
        DescribeInstancesCommand,
        StartInstancesCommand,
        StopInstancesCommand,
        RebootInstancesCommand,
        TerminateInstancesCommand,
    } from "@aws-sdk/client-ec2";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let instances = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let __loadInstances_loaded = false;
    $effect(() => {
        if (aws.ec2 && !__loadInstances_loaded) {
            __loadInstances_loaded = true;
            loadInstances();
        }
    });

    async function loadInstances() {
        if (!aws.ec2) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ec2.send(new DescribeInstancesCommand({}));
            const allInst: any[] = [];
            for (const resv of res.Reservations ?? []) {
                for (const inst of resv.Instances ?? []) {
                    const nameTag = inst.Tags?.find((t) => t.Key === "Name");
                    allInst.push({
                        id: inst.InstanceId,
                        name: nameTag?.Value ?? "Unnamed",
                        type: inst.InstanceType,
                        state: inst.State?.Name ?? "unknown",
                        publicIp: inst.PublicIpAddress ?? "-",
                        privateIp: inst.PrivateIpAddress ?? "-",
                        az: inst.Placement?.AvailabilityZone ?? "-",
                    });
                }
            }
            instances = allInst;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleAction(
        action: "start" | "stop" | "reboot" | "terminate",
        id: string,
    ) {
        if (!aws.ec2) return;
        try {
            loading = true;
            if (action === "start")
                await aws.ec2.send(
                    new StartInstancesCommand({ InstanceIds: [id] }),
                );
            if (action === "stop")
                await aws.ec2.send(
                    new StopInstancesCommand({ InstanceIds: [id] }),
                );
            if (action === "reboot")
                await aws.ec2.send(
                    new RebootInstancesCommand({ InstanceIds: [id] }),
                );
            if (action === "terminate") {
                if (!confirm(`Terminate instance ${id}?`)) return;
                await aws.ec2.send(
                    new TerminateInstancesCommand({ InstanceIds: [id] }),
                );
            }
            actionMsg = `Instance ${id} ${action}ed.`;
            loadInstances();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleSelectInstance(id: string) {
        goto(`/ec2/instances/${id}`);
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
    activeTab="instances"
/>
<div class="flex-1 overflow-hidden relative">
{#snippet stateCell(v: string)}
    <div class="flex items-center gap-1.5">
        <Icon
            path={mdiCircle}
            size={10}
            color={v === "running"
                ? COLORS.SUCCESS
                : v === "stopped"
                  ? COLORS.ERROR
                  : COLORS.WARNING}
        />
        <span class="capitalize">{v}</span>
    </div>
{/snippet}
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
            items={instances}
            {loading}
            onRefresh={loadInstances}
            columns={[
                {
                    label: "Name",
                    key: "name",
                    onClick: (item) => handleSelectInstance(item.id),
                },
                {
                    label: "State",
                    key: "state",
                    renderCell: stateCell,
                },
                { label: "Instance ID", key: "id" },
                { label: "Type", key: "type" },
                { label: "Public IP", key: "publicIp" },
                { label: "Private IP", key: "privateIp" },
                { label: "AZ", key: "az" },
            ]}
        >
            {#snippet actionsSnippet(item)}
                <div class="flex gap-2 justify-end w-32 ml-auto">
                    <Select
                        value=""
                        placeholder="Actions"
                        primary={true}
                        small={true}
                        options={[
                            ...(item.state === 'stopped' ? [{value: 'start', label: 'Start'}] : []),
                            ...(item.state === 'running' ? [{value: 'stop', label: 'Stop'}, {value: 'reboot', label: 'Reboot'}] : []),
                            {value: 'terminate', label: 'Terminate'}
                        ]}
                        onchange={(action) => {
                            if (action) handleAction(action as any, item.id);
                        }}
                    />
                </div>
            {/snippet}
        </PaginatedTable>
    </div>
</div>
</div>
</div>
