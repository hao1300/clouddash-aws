<script lang="ts">
    import { onMount } from "svelte";
    import {
        EC2Client,
        DescribeInstancesCommand,
        StartInstancesCommand,
        StopInstancesCommand,
        RebootInstancesCommand,
        TerminateInstancesCommand,
        DescribeVolumesCommand,
        DescribeSecurityGroupsCommand,
        DescribeKeyPairsCommand,
        DescribeAddressesCommand,
        DescribeImagesCommand,
        DescribeSnapshotsCommand,
    } from "@aws-sdk/client-ec2";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let items = $state<any[]>([]);
    let loading = $state(false);
    let itemsLoaded = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let client: EC2Client | null = null;

    // --- Resources State ---
    let volumes = $state<any[]>([]);
    let volumesLoading = $state(false);
    let volumesLoaded = $state(false);
    let volTokenMap = $state<string[]>([]);
    let volCurrentToken = $state<string | undefined>(undefined);

    let securityGroups = $state<any[]>([]);
    let sgLoading = $state(false);
    let sgLoaded = $state(false);
    let sgTokenMap = $state<string[]>([]);
    let sgCurrentToken = $state<string | undefined>(undefined);

    let keyPairs = $state<any[]>([]);
    let kpLoading = $state(false);
    let kpLoaded = $state(false);

    let elasticIps = $state<any[]>([]);
    let eipLoading = $state(false);
    let eipLoaded = $state(false);

    let amis = $state<any[]>([]);
    let amisLoading = $state(false);
    let amisLoaded = $state(false);
    let amiTokenMap = $state<string[]>([]);
    let amiCurrentToken = $state<string | undefined>(undefined);

    let snapshots = $state<any[]>([]);
    let snapshotsLoading = $state(false);
    let snapshotsLoaded = $state(false);
    let snapshotTokenMap = $state<string[]>([]);
    let snapshotCurrentToken = $state<string | undefined>(undefined);

    // --- Service Layout State ---
    const tabs = [
        { id: "instances", label: "Instances" },
        { id: "amis", label: "AMIs" },
        { id: "volumes", label: "Volumes" },
        { id: "snapshots", label: "Snapshots" },
        { id: "security-groups", label: "Security Groups" },
        { id: "key-pairs", label: "Key Pairs" },
        { id: "elastic-ips", label: "Elastic IPs" }
    ];
    let activeTab = $state("instances");
    let selectedInstance = $state<any>(null);

    $effect(() => {
        if (!client) return;
        if (activeTab === "instances" && !itemsLoaded) load();
        else if (activeTab === "amis" && !amisLoaded) loadAmis();
        else if (activeTab === "volumes" && !volumesLoaded) loadVolumes();
        else if (activeTab === "snapshots" && !snapshotsLoaded) loadSnapshots();
        else if (activeTab === "security-groups" && !sgLoaded) loadSecurityGroups();
        else if (activeTab === "key-pairs" && !kpLoaded) loadKeyPairs();
        else if (activeTab === "elastic-ips" && !eipLoaded) loadElasticIps();
    });

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
                        vpc_id: inst.VpcId ?? "-",
                        subnet_id: inst.SubnetId ?? "-",
                        key_name: inst.KeyName ?? "-",
                        security_groups: inst.SecurityGroups?.map(sg => sg.GroupName).join(", ") ?? "-",
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
            itemsLoaded = true;
        }
    }

    async function loadAmis(token?: string) {
        if (!client) return;
        try {
            amisLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribeImagesCommand({
                    Owners: ["self"],
                    MaxResults: 50,
                    NextToken: token,
                }),
            );
            amis = (resp.Images ?? []).map((img) => {
                return {
                    id: img.ImageId ?? "Unknown",
                    name: img.Name ?? "-",
                    state: img.State ?? "Unknown",
                    created: img.CreationDate ? new Date(img.CreationDate).toLocaleString() : "-",
                    architecture: img.Architecture ?? "-",
                    platform: img.PlatformDetails ?? "-",
                    public: img.Public ? "Yes" : "No",
                };
            });
            pushToken(amiTokenMap, resp.NextToken);
            amiCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            amisLoading = false;
            amisLoaded = true;
        }
    }

    async function loadVolumes(token?: string) {
        if (!client) return;
        try {
            volumesLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribeVolumesCommand({
                    MaxResults: 50,
                    NextToken: token,
                }),
            );
            volumes = (resp.Volumes ?? []).map((v) => {
                const nameTag = v.Tags?.find((t) => t.Key === "Name");
                return {
                    id: v.VolumeId ?? "Unknown",
                    name: nameTag?.Value ?? "-",
                    size: v.Size ?? 0,
                    type: v.VolumeType ?? "Unknown",
                    state: v.State ?? "Unknown",
                    iops: v.Iops ?? "-",
                    encrypted: v.Encrypted ? "Yes" : "No",
                    az: v.AvailabilityZone ?? "-",
                    created: v.CreateTime?.toLocaleString() ?? "-",
                    attachments: v.Attachments?.map(a => a.InstanceId).join(", ") || "-"
                };
            });
            pushToken(volTokenMap, resp.NextToken);
            volCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            volumesLoading = false;
            volumesLoaded = true;
        }
    }

    async function loadSnapshots(token?: string) {
        if (!client) return;
        try {
            snapshotsLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribeSnapshotsCommand({
                    OwnerIds: ["self"],
                    MaxResults: 50,
                    NextToken: token,
                }),
            );
            snapshots = (resp.Snapshots ?? []).map((snap) => {
                return {
                    id: snap.SnapshotId ?? "Unknown",
                    description: snap.Description ?? "-",
                    size: snap.VolumeSize ?? 0,
                    state: snap.State ?? "Unknown",
                    started: snap.StartTime ? snap.StartTime.toLocaleString() : "-",
                    progress: snap.Progress ?? "-",
                    volume_id: snap.VolumeId ?? "-",
                };
            });
            pushToken(snapshotTokenMap, resp.NextToken);
            snapshotCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            snapshotsLoading = false;
            snapshotsLoaded = true;
        }
    }

    async function loadSecurityGroups(token?: string) {
        if (!client) return;
        try {
            sgLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribeSecurityGroupsCommand({
                    MaxResults: 50,
                    NextToken: token,
                }),
            );
            securityGroups = (resp.SecurityGroups ?? []).map((sg) => {
                return {
                    id: sg.GroupId ?? "Unknown",
                    name: sg.GroupName ?? "-",
                    description: sg.Description ?? "-",
                    vpc_id: sg.VpcId ?? "-",
                    inbound_rules: sg.IpPermissions?.length ?? 0,
                    outbound_rules: sg.IpPermissionsEgress?.length ?? 0
                };
            });
            pushToken(sgTokenMap, resp.NextToken);
            sgCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            sgLoading = false;
            sgLoaded = true;
        }
    }

    async function loadKeyPairs() {
        if (!client) return;
        try {
            kpLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribeKeyPairsCommand({}),
            );
            keyPairs = (resp.KeyPairs ?? []).map((kp) => {
                return {
                    id: kp.KeyPairId ?? "Unknown",
                    name: kp.KeyName ?? "-",
                    type: kp.KeyType ?? "-",
                    fingerprint: kp.KeyFingerprint ?? "-",
                    created: kp.CreateTime?.toLocaleString() ?? "-"
                };
            });
        } catch (e) {
            error = String(e);
        } finally {
            kpLoading = false;
            kpLoaded = true;
        }
    }

    async function loadElasticIps() {
        if (!client) return;
        try {
            eipLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribeAddressesCommand({}),
            );
            elasticIps = (resp.Addresses ?? []).map((eip) => {
                const nameTag = eip.Tags?.find((t) => t.Key === "Name");
                return {
                    id: eip.AllocationId ?? "Unknown",
                    name: nameTag?.Value ?? "-",
                    public_ip: eip.PublicIp ?? "-",
                    private_ip: eip.PrivateIpAddress ?? "-",
                    instance_id: eip.InstanceId ?? "-",
                    association_id: eip.AssociationId ?? "-",
                    network_interface_id: eip.NetworkInterfaceId ?? "-",
                };
            });
        } catch (e) {
            error = String(e);
        } finally {
            eipLoading = false;
            eipLoaded = true;
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
        {
            key: "name",
            label: "Name",
            onClick: (item: any) => {
                selectedInstance = item;
            },
        },
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

    const volColumns = [
        { key: "name", label: "Name" },
        { key: "id", label: "Volume ID" },
        { key: "size", label: "Size (GiB)", format: (v: number) => `${v} GiB` },
        { key: "type", label: "Type" },
        {
            key: "state",
            label: "State",
            format: (v: string) => {
                if (v === "in-use") return "🟢 in-use";
                if (v === "available") return "🔵 available";
                return `🟡 ${v}`;
            },
        },
        { key: "attachments", label: "Attached Instance" },
        { key: "iops", label: "IOPS" },
        { key: "az", label: "Availability Zone" },
    ];

    const sgColumns = [
        { key: "name", label: "Name" },
        { key: "id", label: "Group ID" },
        { key: "vpc_id", label: "VPC ID" },
        { key: "description", label: "Description" },
        { key: "inbound_rules", label: "Inbound Rules" },
        { key: "outbound_rules", label: "Outbound Rules" },
    ];

    const kpColumns = [
        { key: "name", label: "Name" },
        { key: "id", label: "Key Pair ID" },
        { key: "type", label: "Type" },
        { key: "fingerprint", label: "Fingerprint" },
        { key: "created", label: "Creation Date" },
    ];

    const eipColumns = [
        { key: "name", label: "Name" },
        { key: "public_ip", label: "Allocated IPv4 address" },
        { key: "id", label: "Allocation ID" },
        { key: "instance_id", label: "Associated instance ID" },
        { key: "private_ip", label: "Private IPv4 address" },
        { key: "network_interface_id", label: "Network interface ID" },
    ];

    const amiColumns = [
        { key: "name", label: "Name" },
        { key: "id", label: "AMI ID" },
        { key: "state", label: "State",
            format: (v: string) => {
                if (v === "available") return "🟢 available";
                if (v === "pending") return "🟡 pending";
                return `🔴 ${v}`;
            }
        },
        { key: "created", label: "Creation Date" },
        { key: "architecture", label: "Architecture" },
        { key: "platform", label: "Platform" },
        { key: "public", label: "Public" },
    ];

    const snapshotColumns = [
        { key: "description", label: "Description" },
        { key: "id", label: "Snapshot ID" },
        { key: "size", label: "Size (GiB)", format: (v: number) => `${v} GiB` },
        { key: "state", label: "State",
            format: (v: string) => {
                if (v === "completed") return "🟢 completed";
                if (v === "pending") return "🟡 pending";
                return `🔴 ${v}`;
            }
        },
        { key: "started", label: "Start Time" },
        { key: "progress", label: "Progress" },
        { key: "volume_id", label: "Volume ID" },
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
        {#if selectedInstance}
            <div
                class="h-full flex flex-col p-4 pr-1 bg-gray-950 overflow-auto text-sm"
            >
                <div
                    class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
                >
                    <button
                        onclick={() => {
                            selectedInstance = null;
                        }}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back to Instances</button
                    >
                    <span
                        class="text-sm font-bold text-gray-200 truncate flex-1"
                        >{selectedInstance.name || "Unnamed"}
                        <span class="text-gray-500 font-normal ml-2"
                            >{selectedInstance.id}</span
                        ></span
                    >
                </div>

                <div
                    class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 shrink-0"
                >
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Instance State
                        </div>
                        <div
                            class="text-base font-bold capitalize {selectedInstance.state ===
                            'running'
                                ? 'text-green-400'
                                : selectedInstance.state === 'stopped'
                                  ? 'text-red-400'
                                  : 'text-yellow-400'}"
                        >
                            {selectedInstance.state}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Instance Type
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedInstance.instance_type}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Public IP
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedInstance.public_ip}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Private IP
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedInstance.private_ip}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            VPC ID
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedInstance.vpc_id}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Subnet ID
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedInstance.subnet_id}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Key Name
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedInstance.key_name}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Security Groups
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedInstance.security_groups}
                        </div>
                    </div>
                </div>
            </div>
        {:else if activeTab === "instances"}
            <PaginatedTable
                {items}
                {loading}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={() => load(currentToken)}
                onPrev={() => load(popToken(tokenMap))}
                onRefresh={() => {
                    tokenMap = [];
                    itemsLoaded = false;
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
        {:else if activeTab === "amis"}
            <PaginatedTable
                items={amis}
                loading={amisLoading}
                hasNext={!!amiCurrentToken}
                hasPrev={amiTokenMap.length > 0}
                onNext={() => loadAmis(amiCurrentToken)}
                onPrev={() => loadAmis(popToken(amiTokenMap))}
                onRefresh={() => {
                    amiTokenMap = [];
                    amisLoaded = false;
                    loadAmis();
                }}
                columns={amiColumns}
            />
        {:else if activeTab === "volumes"}
            <PaginatedTable
                items={volumes}
                loading={volumesLoading}
                hasNext={!!volCurrentToken}
                hasPrev={volTokenMap.length > 0}
                onNext={() => loadVolumes(volCurrentToken)}
                onPrev={() => loadVolumes(popToken(volTokenMap))}
                onRefresh={() => {
                    volTokenMap = [];
                    volumesLoaded = false;
                    loadVolumes();
                }}
                columns={volColumns}
            />
        {:else if activeTab === "snapshots"}
            <PaginatedTable
                items={snapshots}
                loading={snapshotsLoading}
                hasNext={!!snapshotCurrentToken}
                hasPrev={snapshotTokenMap.length > 0}
                onNext={() => loadSnapshots(snapshotCurrentToken)}
                onPrev={() => loadSnapshots(popToken(snapshotTokenMap))}
                onRefresh={() => {
                    snapshotTokenMap = [];
                    snapshotsLoaded = false;
                    loadSnapshots();
                }}
                columns={snapshotColumns}
            />
        {:else if activeTab === "security-groups"}
            <PaginatedTable
                items={securityGroups}
                loading={sgLoading}
                hasNext={!!sgCurrentToken}
                hasPrev={sgTokenMap.length > 0}
                onNext={() => loadSecurityGroups(sgCurrentToken)}
                onPrev={() => loadSecurityGroups(popToken(sgTokenMap))}
                onRefresh={() => {
                    sgTokenMap = [];
                    sgLoaded = false;
                    loadSecurityGroups();
                }}
                columns={sgColumns}
            />
        {:else if activeTab === "key-pairs"}
            <PaginatedTable
                items={keyPairs}
                loading={kpLoading}
                hasNext={false}
                hasPrev={false}
                onRefresh={() => {
                    kpLoaded = false;
                    loadKeyPairs();
                }}
                columns={kpColumns}
            />
        {:else if activeTab === "elastic-ips"}
            <PaginatedTable
                items={elasticIps}
                loading={eipLoading}
                hasNext={false}
                hasPrev={false}
                onRefresh={() => {
                    eipLoaded = false;
                    loadElasticIps();
                }}
                columns={eipColumns}
            />
        {/if}
    </div>
</ServiceLayout>
