<script lang="ts">
    import { onMount } from "svelte";
    import {
        EC2Client,
        DescribeInstancesCommand,
        StartInstancesCommand,
        StopInstancesCommand,
        RebootInstancesCommand,
        TerminateInstancesCommand,
    } from "@aws-sdk/client-ec2";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let items = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let client: EC2Client | null = null;

    // --- Service Layout State ---
    const tabs = [{ id: "instances", label: "Instances" }];
    let activeTab = $state("instances");

    // --- Pagination Shared Helpers ---
    function pushToken(history: string[], currentNextToken?: string) {
        if (!currentNextToken) return;
        if (history[history.length - 1] !== currentNextToken) {
            history.push(currentNextToken);
        }
    }
    function popToken(history: string[]) {
        history.pop();
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new EC2Client({
                region: creds.region || "us-east-1",
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            });
            await load();
        } catch (e) {
            error = String(e);
        }
    });

    async function load(token?: string) {
        if (!client) return;
        try {
            loading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribeInstancesCommand({
                    MaxResults: 50,
                    NextToken: token,
                }),
            );
            const newItems: any[] = [];
            for (const res of resp.Reservations ?? []) {
                for (const inst of res.Instances ?? []) {
                    const nameTag = inst.Tags?.find((t) => t.Key === "Name");
                    newItems.push({
                        id: inst.InstanceId ?? "Unknown",
                        name: nameTag?.Value ?? "",
                        state: inst.State?.Name ?? "unknown",
                        instance_type: inst.InstanceType ?? "Unknown",
                        public_ip: inst.PublicIpAddress ?? "-",
                        private_ip: inst.PrivateIpAddress ?? "-",
                        az: inst.Placement?.AvailabilityZone ?? "",
                        launch_time: inst.LaunchTime?.toISOString() ?? "",
                    });
                }
            }
            items = newItems;
            pushToken(tokenMap, resp.NextToken);
            currentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function instanceAction(
        id: string,
        action: "start" | "stop" | "reboot" | "terminate",
    ) {
        if (!client) return;
        const labels: Record<string, string> = {
            start: "Start",
            stop: "Stop",
            reboot: "Reboot",
            terminate: "TERMINATE",
        };
        if (
            !confirm(
                `${labels[action]} instance ${id}?${action === "terminate" ? " This CANNOT be undone!" : ""}`,
            )
        )
            return;
        try {
            error = "";
            actionMsg = "";
            if (action === "start")
                await client.send(
                    new StartInstancesCommand({ InstanceIds: [id] }),
                );
            else if (action === "stop")
                await client.send(
                    new StopInstancesCommand({ InstanceIds: [id] }),
                );
            else if (action === "reboot")
                await client.send(
                    new RebootInstancesCommand({ InstanceIds: [id] }),
                );
            else if (action === "terminate")
                await client.send(
                    new TerminateInstancesCommand({ InstanceIds: [id] }),
                );
            actionMsg = `${labels[action]} request sent for ${id}`;
            setTimeout(() => load(currentToken), 2000); // Reload current page
        } catch (e) {
            error = String(e);
        }
    }

    const columns = [
        { key: "name", label: "Name" },
        { key: "id", label: "Instance ID" },
        {
            key: "state",
            label: "State",
            format: (v: string) => {
                if (v === "running") return "🟢 running";
                if (v === "stopped") return "🔴 stopped";
                if (v === "terminated") return "⚫ terminated";
                return `🟡 ${v}`;
            },
        },
        { key: "instance_type", label: "Instance Type" },
        { key: "public_ip", label: "Public IP" },
        { key: "private_ip", label: "Private IP" },
        { key: "az", label: "Availability Zone" },
    ];
</script>

<ServiceLayout title="EC2" {tabs} bind:activeTab>
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

    <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
        {#if activeTab === "instances"}
            <PaginatedTable
                {items}
                {loading}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={() => load(currentToken)}
                onPrev={() => load(popToken(tokenMap))}
                onRefresh={() => {
                    tokenMap = [];
                    load();
                }}
                {columns}
            >
                {#snippet actionsSnippet(item)}
                    <div class="flex gap-1 justify-end">
                        {#if item.state === "stopped"}
                            <button
                                onclick={() => instanceAction(item.id, "start")}
                                class="text-green-400 hover:text-green-300 bg-green-900/40 hover:bg-green-800/60 px-2 py-1 rounded text-xs transition"
                                >Start</button
                            >
                        {/if}
                        {#if item.state === "running"}
                            <button
                                onclick={() => instanceAction(item.id, "stop")}
                                class="text-yellow-400 hover:text-yellow-300 bg-yellow-900/40 hover:bg-yellow-800/60 px-2 py-1 rounded text-xs transition"
                                >Stop</button
                            >
                            <button
                                onclick={() =>
                                    instanceAction(item.id, "reboot")}
                                class="text-blue-400 hover:text-blue-300 bg-blue-900/40 hover:bg-blue-800/60 px-2 py-1 rounded text-xs transition drop-shadow"
                                >Reboot</button
                            >
                        {/if}
                        {#if item.state !== "terminated"}
                            <button
                                onclick={() =>
                                    instanceAction(item.id, "terminate")}
                                class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                                >Terminate</button
                            >
                        {/if}
                    </div>
                {/snippet}
            </PaginatedTable>
        {/if}
    </div>
</ServiceLayout>
