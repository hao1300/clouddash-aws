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

    let items = $state<any[]>([]);
    let nextToken = $state<string | undefined>(undefined);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let client: EC2Client | null = null;

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

    async function load(append = false) {
        if (!client) return;
        try {
            loading = true;
            error = "";
            const resp = await client.send(
                new DescribeInstancesCommand({
                    MaxResults: 50,
                    NextToken: append ? nextToken : undefined,
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
            items = append ? [...items, ...newItems] : newItems;
            nextToken = resp.NextToken;
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
            setTimeout(() => load(), 2000);
        } catch (e) {
            error = String(e);
        }
    }

    function stateColor(s: string) {
        if (s === "running") return "bg-green-500";
        if (s === "stopped") return "bg-red-500";
        if (s === "terminated") return "bg-gray-600";
        return "bg-yellow-500";
    }

    function stateBg(s: string) {
        if (s === "running") return "bg-green-500/10 border-green-500/30";
        if (s === "stopped") return "bg-red-500/10 border-red-500/30";
        if (s === "terminated") return "bg-gray-500/10 border-gray-500/30";
        return "bg-yellow-500/10 border-yellow-500/30";
    }
</script>

{#if error}<div class="bg-red-500/20 text-red-300 p-2 rounded text-xs mb-2">
        {error}
    </div>{/if}
{#if actionMsg}<div
        class="bg-blue-500/20 text-blue-300 p-2 rounded text-xs mb-2"
    >
        {actionMsg}
    </div>{/if}

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {#each items as i}
        <div
            class="bg-gray-900 p-3 rounded-lg border border-gray-800 {stateBg(
                i.state,
            )}"
        >
            <div class="flex justify-between items-center mb-2">
                <div class="min-w-0">
                    {#if i.name}<div
                            class="text-sm font-semibold text-gray-100 truncate"
                        >
                            {i.name}
                        </div>{/if}
                    <span class="font-mono text-xs text-blue-300">{i.id}</span>
                </div>
                <span
                    class="w-2.5 h-2.5 rounded-full shrink-0 ml-2 {stateColor(
                        i.state,
                    )}"
                ></span>
            </div>
            <div class="space-y-1 text-xs mb-3">
                <div class="flex justify-between">
                    <span class="text-gray-500">Type</span><span
                        class="text-gray-300">{i.instance_type}</span
                    >
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">State</span><span
                        class="text-gray-300 uppercase">{i.state}</span
                    >
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">Public IP</span><span
                        class="text-gray-300 font-mono">{i.public_ip}</span
                    >
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">Private IP</span><span
                        class="text-gray-300 font-mono">{i.private_ip}</span
                    >
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-500">AZ</span><span
                        class="text-gray-300">{i.az}</span
                    >
                </div>
            </div>
            <!-- Action buttons -->
            <div class="flex gap-1.5 flex-wrap">
                {#if i.state === "stopped"}
                    <button
                        onclick={() => instanceAction(i.id, "start")}
                        class="bg-green-600/80 hover:bg-green-500 px-2.5 py-1 rounded text-xs font-semibold transition"
                        >Start</button
                    >
                {/if}
                {#if i.state === "running"}
                    <button
                        onclick={() => instanceAction(i.id, "stop")}
                        class="bg-yellow-600/80 hover:bg-yellow-500 px-2.5 py-1 rounded text-xs font-semibold transition"
                        >Stop</button
                    >
                    <button
                        onclick={() => instanceAction(i.id, "reboot")}
                        class="bg-blue-600/80 hover:bg-blue-500 px-2.5 py-1 rounded text-xs font-semibold transition"
                        >Reboot</button
                    >
                {/if}
                {#if i.state !== "terminated"}
                    <button
                        onclick={() => instanceAction(i.id, "terminate")}
                        class="bg-red-600/80 hover:bg-red-500 px-2.5 py-1 rounded text-xs font-semibold transition"
                        >Terminate</button
                    >
                {/if}
            </div>
        </div>
    {/each}
    {#if !loading && items.length === 0}<div
            class="col-span-full text-gray-600 text-center py-16 text-sm"
        >
            No EC2 instances found.
        </div>{/if}
</div>
{#if loading}<div class="flex justify-center py-4">
        <div
            class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
        ></div>
    </div>{/if}
{#if nextToken && !loading}<button
        onclick={() => load(true)}
        class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
        >Load More</button
    >{/if}
