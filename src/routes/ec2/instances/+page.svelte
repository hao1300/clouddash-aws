<script lang="ts">
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
                { label: "Instance ID", key: "id" },
                { label: "Type", key: "type" },
                {
                    label: "State",
                    key: "state",
                    format: (v) => v.toUpperCase(),
                },
                { label: "Public IP", key: "publicIp" },
                { label: "Private IP", key: "privateIp" },
                { label: "AZ", key: "az" },
            ]}
        >
            {#snippet actionsSnippet(item)}
                <div class="flex gap-2 justify-end">
                    <select
                        class="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 shadow cursor-pointer appearance-none text-center"
                        onchange={(e) => {
                            const action = e.currentTarget.value;
                            if (action) {
                                handleAction(action as any, item.id);
                                e.currentTarget.value = "";
                            }
                        }}
                    >
                        <option value="" disabled selected>Actions ▾</option>
                        {#if item.state === "stopped"}
                            <option value="start">Start</option>
                        {:else if item.state === "running"}
                            <option value="stop">Stop</option>
                            <option value="reboot">Reboot</option>
                        {/if}
                        <option value="terminate">Terminate</option>
                    </select>
                </div>
            {/snippet}
        </PaginatedTable>
    </div>
</div>
