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
        DeleteVolumeCommand,
        DeleteSnapshotCommand,
        DeleteSecurityGroupCommand,
        DeleteKeyPairCommand,
        ReleaseAddressCommand,
        DeregisterImageCommand,
        CreateSecurityGroupCommand,
        CreateKeyPairCommand,
        AllocateAddressCommand,
        CreateVolumeCommand,
        CreateSnapshotCommand,
        DescribeAvailabilityZonesCommand,
        DescribeNetworkInterfacesCommand,
        DescribePlacementGroupsCommand,
        CreatePlacementGroupCommand,
        DeletePlacementGroupCommand,
        DescribeSubnetsCommand,
        RunInstancesCommand,
        CreateTagsCommand,
    } from "@aws-sdk/client-ec2";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";

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

    let networkInterfaces = $state<any[]>([]);
    let enisLoading = $state(false);
    let enisLoaded = $state(false);
    let eniTokenMap = $state<string[]>([]);
    let eniCurrentToken = $state<string | undefined>(undefined);

    let placementGroups = $state<any[]>([]);
    let pgLoading = $state(false);
    let pgLoaded = $state(false);

    // --- Edit State ---
    let editInstanceNameMode = $state(false);
    let newInstanceName = $state("");

    // --- Create State ---
    let launchModalOpen = $state(false);
    let launchName = $state("");
    let launchAmi = $state("");
    let launchType = $state("t2.micro");
    let launchKey = $state("");
    let launchSubnet = $state("");
    let launchSg = $state("");
    let availableSubnets = $state<any[]>([]);

    let createSgModalOpen = $state(false);
    let createSgName = $state("");
    let createSgDesc = $state("");
    let createSgVpc = $state(""); // Optional

    let createKpModalOpen = $state(false);
    let createKpName = $state("");
    let createKpMaterialModalOpen = $state(false);
    let createKpMaterial = $state("");

    let createVolModalOpen = $state(false);
    let createVolSize = $state(8);
    let createVolAz = $state("");
    let availableAzs = $state<string[]>([]);

    let createSnapModalOpen = $state(false);
    let createSnapVolId = $state("");
    let createSnapDesc = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "instances", label: "Instances" },
        { id: "amis", label: "AMIs" },
        { id: "volumes", label: "Volumes" },
        { id: "snapshots", label: "Snapshots" },
        { id: "network-interfaces", label: "Network Interfaces" },
        { id: "security-groups", label: "Security Groups" },
        { id: "key-pairs", label: "Key Pairs" },
        { id: "elastic-ips", label: "Elastic IPs" },
        { id: "placement-groups", label: "Placement Groups" }
    ];
    let activeTab = $state("instances");
    let selectedInstance = $state<any>(null);

    $effect(() => {
        if (!client) return;
        if (activeTab === "instances" && !itemsLoaded) load();
        else if (activeTab === "amis" && !amisLoaded) loadAmis();
        else if (activeTab === "volumes" && !volumesLoaded) loadVolumes();
        else if (activeTab === "snapshots" && !snapshotsLoaded) loadSnapshots();
        else if (activeTab === "network-interfaces" && !enisLoaded) loadNetworkInterfaces();
        else if (activeTab === "security-groups" && !sgLoaded) loadSecurityGroups();
        else if (activeTab === "key-pairs" && !kpLoaded) loadKeyPairs();
        else if (activeTab === "elastic-ips" && !eipLoaded) loadElasticIps();
        else if (activeTab === "placement-groups" && !pgLoaded) loadPlacementGroups();
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

    async function loadNetworkInterfaces(token?: string) {
        if (!client) return;
        try {
            enisLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribeNetworkInterfacesCommand({
                    MaxResults: 50,
                    NextToken: token,
                }),
            );
            networkInterfaces = (resp.NetworkInterfaces ?? []).map((eni) => {
                const nameTag = eni.TagSet?.find((t) => t.Key === "Name");
                return {
                    id: eni.NetworkInterfaceId ?? "Unknown",
                    name: nameTag?.Value ?? "-",
                    subnet_id: eni.SubnetId ?? "-",
                    vpc_id: eni.VpcId ?? "-",
                    private_ip: eni.PrivateIpAddress ?? "-",
                    status: eni.Status ?? "Unknown",
                    attachment_id: eni.Attachment?.AttachmentId ?? "-",
                    instance_id: eni.Attachment?.InstanceId ?? "-",
                };
            });
            pushToken(eniTokenMap, resp.NextToken);
            eniCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            enisLoading = false;
            enisLoaded = true;
        }
    }

    async function loadPlacementGroups() {
        if (!client) return;
        try {
            pgLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new DescribePlacementGroupsCommand({}),
            );
            placementGroups = (resp.PlacementGroups ?? []).map((pg) => {
                return {
                    name: pg.GroupName ?? "Unknown",
                    strategy: pg.Strategy ?? "-",
                    state: pg.State ?? "-",
                    partition_count: pg.PartitionCount ?? "-",
                };
            });
        } catch (e) {
            error = String(e);
        } finally {
            pgLoading = false;
            pgLoaded = true;
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

    async function loadAzs() {
        if (!client || availableAzs.length > 0) return;
        try {
            const resp = await client.send(
                new DescribeAvailabilityZonesCommand({}),
            );
            availableAzs = (resp.AvailabilityZones ?? [])
                .map((z) => z.ZoneName ?? "")
                .filter((n) => n.length > 0);
            if (availableAzs.length > 0) createVolAz = availableAzs[0];
        } catch (e) {
            console.error(e);
        }
    }

    async function loadSubnets() {
        if (!client || availableSubnets.length > 0) return;
        try {
            const resp = await client.send(new DescribeSubnetsCommand({}));
            availableSubnets = resp.Subnets ?? [];
        } catch (e) {
            console.error(e);
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

    async function updateInstanceName() {
        if (!client || !selectedInstance) return;
        try {
            error = "";
            actionMsg = "";
            await client.send(new CreateTagsCommand({
                Resources: [selectedInstance.id],
                Tags: [{ Key: "Name", Value: newInstanceName }]
            }));
            actionMsg = `Instance name updated to ${newInstanceName}.`;
            selectedInstance.name = newInstanceName;
            editInstanceNameMode = false;
            // Update in items list as well
            const idx = items.findIndex(i => i.id === selectedInstance.id);
            if (idx >= 0) {
                items[idx].name = newInstanceName;
            }
        } catch (e) {
            error = String(e);
        }
    }

    async function submitLaunchInstance() {
        if (!client) return;
        try {
            error = "";
            actionMsg = "";
            const params: any = {
                ImageId: launchAmi,
                InstanceType: launchType,
                MinCount: 1,
                MaxCount: 1,
            };

            if (launchKey) params.KeyName = launchKey;
            if (launchSubnet) params.SubnetId = launchSubnet;
            if (launchSg) params.SecurityGroupIds = [launchSg];

            if (launchName) {
                params.TagSpecifications = [{
                    ResourceType: "instance",
                    Tags: [{ Key: "Name", Value: launchName }]
                }];
            }

            const res = await client.send(new RunInstancesCommand(params));
            const instanceId = res.Instances?.[0]?.InstanceId ?? "Unknown";
            actionMsg = `Instance ${instanceId} launched successfully.`;
            launchModalOpen = false;

            // Reset form
            launchName = "";
            launchAmi = "";
            launchType = "t2.micro";
            launchKey = "";
            launchSubnet = "";
            launchSg = "";

            setTimeout(() => load(), 2000);
        } catch (e) {
            error = String(e);
        }
    }

    async function submitCreatePg() {
        if (!client) return;
        const name = prompt("Enter Placement Group Name:");
        if (!name) return;
        try {
            error = "";
            actionMsg = "";
            await client.send(new CreatePlacementGroupCommand({
                GroupName: name,
                Strategy: "cluster" // Defaulting to cluster for simplicity, could add select
            }));
            actionMsg = `Placement Group ${name} created successfully.`;
            setTimeout(() => loadPlacementGroups(), 1000);
        } catch (e) {
            error = String(e);
        }
    }

    async function deleteAction(type: string, id: string, name?: string) {
        if (!client) return;
        const displayName = name && name !== "-" ? `${name} (${id})` : id;
        if (!confirm(`Are you sure you want to delete/release ${type} ${displayName}?`)) return;

        try {
            error = "";
            actionMsg = "";
            if (type === "Volume") {
                await client.send(new DeleteVolumeCommand({ VolumeId: id }));
                setTimeout(() => loadVolumes(volCurrentToken), 1000);
            } else if (type === "Snapshot") {
                await client.send(new DeleteSnapshotCommand({ SnapshotId: id }));
                setTimeout(() => loadSnapshots(snapshotCurrentToken), 1000);
            } else if (type === "Security Group") {
                await client.send(new DeleteSecurityGroupCommand({ GroupId: id }));
                setTimeout(() => loadSecurityGroups(sgCurrentToken), 1000);
            } else if (type === "Key Pair") {
                await client.send(new DeleteKeyPairCommand({ KeyPairId: id }));
                setTimeout(() => loadKeyPairs(), 1000);
            } else if (type === "Elastic IP") {
                await client.send(new ReleaseAddressCommand({ AllocationId: id }));
                setTimeout(() => loadElasticIps(), 1000);
            } else if (type === "AMI") {
                await client.send(new DeregisterImageCommand({ ImageId: id }));
                setTimeout(() => loadAmis(amiCurrentToken), 1000);
            } else if (type === "Placement Group") {
                await client.send(new DeletePlacementGroupCommand({ GroupName: id }));
                setTimeout(() => loadPlacementGroups(), 1000);
            }
            actionMsg = `${type} ${id} deleted successfully.`;
        } catch (e) {
            error = String(e);
        }
    }

    async function submitCreateSg() {
        if (!client) return;
        try {
            error = "";
            actionMsg = "";
            await client.send(new CreateSecurityGroupCommand({
                GroupName: createSgName,
                Description: createSgDesc,
                VpcId: createSgVpc || undefined
            }));
            actionMsg = `Security Group ${createSgName} created successfully.`;
            createSgModalOpen = false;
            createSgName = "";
            createSgDesc = "";
            createSgVpc = "";
            setTimeout(() => loadSecurityGroups(sgCurrentToken), 1000);
        } catch (e) {
            error = String(e);
        }
    }

    async function submitCreateKp() {
        if (!client) return;
        try {
            error = "";
            actionMsg = "";
            const res = await client.send(new CreateKeyPairCommand({
                KeyName: createKpName
            }));
            actionMsg = `Key Pair ${createKpName} created successfully.`;
            createKpModalOpen = false;
            createKpName = "";
            createKpMaterial = res.KeyMaterial ?? "No key material returned.";
            createKpMaterialModalOpen = true;
            setTimeout(() => loadKeyPairs(), 1000);
        } catch (e) {
            error = String(e);
        }
    }

    async function submitCreateVol() {
        if (!client) return;
        try {
            error = "";
            actionMsg = "";
            await client.send(new CreateVolumeCommand({
                Size: createVolSize,
                AvailabilityZone: createVolAz
            }));
            actionMsg = `Volume creation initiated.`;
            createVolModalOpen = false;
            setTimeout(() => loadVolumes(volCurrentToken), 1000);
        } catch (e) {
            error = String(e);
        }
    }

    async function submitCreateSnap() {
        if (!client) return;
        try {
            error = "";
            actionMsg = "";
            await client.send(new CreateSnapshotCommand({
                VolumeId: createSnapVolId,
                Description: createSnapDesc
            }));
            actionMsg = `Snapshot creation initiated for volume ${createSnapVolId}.`;
            createSnapModalOpen = false;
            createSnapVolId = "";
            createSnapDesc = "";
            setTimeout(() => loadSnapshots(snapshotCurrentToken), 1000);
        } catch (e) {
            error = String(e);
        }
    }

    async function allocateEip() {
        if (!client) return;
        try {
            error = "";
            actionMsg = "";
            await client.send(new AllocateAddressCommand({
                Domain: "vpc"
            }));
            actionMsg = `Elastic IP allocated successfully.`;
            setTimeout(() => loadElasticIps(), 1000);
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

    const eniColumns = [
        { key: "name", label: "Name" },
        { key: "id", label: "Network interface ID" },
        { key: "subnet_id", label: "Subnet ID" },
        { key: "vpc_id", label: "VPC ID" },
        { key: "private_ip", label: "Private IPv4 address" },
        { key: "status", label: "Status",
            format: (v: string) => {
                if (v === "in-use") return "🟢 in-use";
                if (v === "available") return "🔵 available";
                return `🟡 ${v}`;
            }
        },
        { key: "instance_id", label: "Instance ID" },
    ];

    const pgColumns = [
        { key: "name", label: "Name" },
        { key: "strategy", label: "Strategy" },
        { key: "partition_count", label: "Partition Count" },
        { key: "state", label: "State",
            format: (v: string) => {
                if (v === "available") return "🟢 available";
                if (v === "pending") return "🟡 pending";
                return `🔴 ${v}`;
            }
        },
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
                    <div class="flex-1 flex items-center gap-2">
                        {#if editInstanceNameMode}
                            <input
                                type="text"
                                bind:value={newInstanceName}
                                class="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500"
                                onkeydown={(e) => { if (e.key === 'Enter') updateInstanceName(); if (e.key === 'Escape') editInstanceNameMode = false; }}
                            />
                            <button onclick={updateInstanceName} class="text-xs text-green-400 hover:text-green-300">Save</button>
                            <button onclick={() => editInstanceNameMode = false} class="text-xs text-gray-400 hover:text-gray-300">Cancel</button>
                        {:else}
                            <span class="text-sm font-bold text-gray-200 truncate">
                                {selectedInstance.name || "Unnamed"}
                                <button onclick={() => { newInstanceName = selectedInstance.name; editInstanceNameMode = true; }} class="ml-2 text-xs text-blue-400 hover:text-blue-300">✎ Edit</button>
                            </span>
                        {/if}
                        <span class="text-gray-500 font-normal ml-2">{selectedInstance.id}</span>
                    </div>
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
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={async () => {
                            if (keyPairs.length === 0) loadKeyPairs();
                            if (securityGroups.length === 0) loadSecurityGroups();
                            loadSubnets();
                            launchModalOpen = true;
                        }}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Launch Instance
                    </button>
                {/snippet}
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
            >
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={() => deleteAction("AMI", item.id, item.name)}
                        class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                        >Deregister</button
                    >
                {/snippet}
            </PaginatedTable>
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
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={async () => {
                            await loadAzs();
                            createVolModalOpen = true;
                        }}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Volume
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <div class="flex gap-1 justify-end">
                        <button
                            onclick={() => {
                                createSnapVolId = item.id;
                                createSnapModalOpen = true;
                            }}
                            class="text-blue-400 hover:text-blue-300 bg-blue-900/40 hover:bg-blue-800/60 px-2 py-1 rounded text-xs transition"
                            >Snapshot</button
                        >
                        <button
                            onclick={() => deleteAction("Volume", item.id, item.name)}
                            class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                            >Delete</button
                        >
                    </div>
                {/snippet}
            </PaginatedTable>
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
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => createSnapModalOpen = true}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Snapshot
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={() => deleteAction("Snapshot", item.id, item.description)}
                        class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                        >Delete</button
                    >
                {/snippet}
            </PaginatedTable>
        {:else if activeTab === "network-interfaces"}
            <PaginatedTable
                items={networkInterfaces}
                loading={enisLoading}
                hasNext={!!eniCurrentToken}
                hasPrev={eniTokenMap.length > 0}
                onNext={() => loadNetworkInterfaces(eniCurrentToken)}
                onPrev={() => loadNetworkInterfaces(popToken(eniTokenMap))}
                onRefresh={() => {
                    eniTokenMap = [];
                    enisLoaded = false;
                    loadNetworkInterfaces();
                }}
                columns={eniColumns}
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
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => createSgModalOpen = true}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Security Group
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={() => deleteAction("Security Group", item.id, item.name)}
                        class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                        >Delete</button
                    >
                {/snippet}
            </PaginatedTable>
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
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => createKpModalOpen = true}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Key Pair
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={() => deleteAction("Key Pair", item.id, item.name)}
                        class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                        >Delete</button
                    >
                {/snippet}
            </PaginatedTable>
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
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={allocateEip}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Allocate Elastic IP
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={() => deleteAction("Elastic IP", item.id, item.name)}
                        class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                        >Release</button
                    >
                {/snippet}
            </PaginatedTable>
        {:else if activeTab === "placement-groups"}
            <PaginatedTable
                items={placementGroups}
                loading={pgLoading}
                hasNext={false}
                hasPrev={false}
                onRefresh={() => {
                    pgLoaded = false;
                    loadPlacementGroups();
                }}
                columns={pgColumns}
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={submitCreatePg}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Placement Group
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={() => deleteAction("Placement Group", item.name, item.name)}
                        class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                        >Delete</button
                    >
                {/snippet}
            </PaginatedTable>
        {/if}
    </div>
</ServiceLayout>

<!-- Modals -->
<Modal bind:open={launchModalOpen} title="Launch Instance" maxWidth="max-w-2xl">
    <div class="flex flex-col gap-4">
        <div>
            <label for="launchName" class="block text-xs text-gray-400 mb-1">Name</label>
            <input id="launchName" type="text" bind:value={launchName} placeholder="e.g. WebServer-1" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div>
            <label for="launchAmi" class="block text-xs text-gray-400 mb-1">AMI ID <span class="text-red-500">*</span></label>
            <input id="launchAmi" type="text" bind:value={launchAmi} placeholder="e.g. ami-0c55b159cbfafe1f0 (Amazon Linux 2)" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div>
            <label for="launchType" class="block text-xs text-gray-400 mb-1">Instance Type <span class="text-red-500">*</span></label>
            <input id="launchType" type="text" bind:value={launchType} placeholder="e.g. t2.micro" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div>
            <label for="launchKey" class="block text-xs text-gray-400 mb-1">Key Pair (Login)</label>
            <select id="launchKey" bind:value={launchKey} class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                <option value="">Proceed without a key pair (Not recommended)</option>
                {#each keyPairs as kp}
                    <option value={kp.name}>{kp.name}</option>
                {/each}
            </select>
        </div>
        <div>
            <label for="launchSubnet" class="block text-xs text-gray-400 mb-1">Subnet (Optional)</label>
            <select id="launchSubnet" bind:value={launchSubnet} class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                <option value="">No preference (default subnet in any AZ)</option>
                {#each availableSubnets as subnet}
                    <option value={subnet.SubnetId}>{subnet.SubnetId} ({subnet.AvailabilityZone}) - {subnet.CidrBlock}</option>
                {/each}
            </select>
        </div>
        <div>
            <label for="launchSg" class="block text-xs text-gray-400 mb-1">Security Group (Optional)</label>
            <select id="launchSg" bind:value={launchSg} class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                <option value="">Create new security group</option>
                {#each securityGroups as sg}
                    <option value={sg.id}>{sg.name} ({sg.id})</option>
                {/each}
            </select>
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button onclick={() => launchModalOpen = false} class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onclick={submitLaunchInstance} disabled={!launchAmi || !launchType} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm transition font-medium">Launch instance</button>
        </div>
    </div>
</Modal>
<Modal bind:open={createSgModalOpen} title="Create Security Group">
    <div class="flex flex-col gap-4">
        <div>
            <label for="createSgName" class="block text-xs text-gray-400 mb-1">Security Group Name</label>
            <input id="createSgName" type="text" bind:value={createSgName} placeholder="e.g. web-server-sg" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div>
            <label for="createSgDesc" class="block text-xs text-gray-400 mb-1">Description</label>
            <input id="createSgDesc" type="text" bind:value={createSgDesc} placeholder="e.g. Allow web traffic" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div>
            <label for="createSgVpc" class="block text-xs text-gray-400 mb-1">VPC ID (Optional)</label>
            <input id="createSgVpc" type="text" bind:value={createSgVpc} placeholder="Leave blank for default VPC" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button onclick={() => createSgModalOpen = false} class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onclick={submitCreateSg} disabled={!createSgName || !createSgDesc} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm transition font-medium">Create</button>
        </div>
    </div>
</Modal>

<Modal bind:open={createKpModalOpen} title="Create Key Pair">
    <div class="flex flex-col gap-4">
        <div>
            <label for="createKpName" class="block text-xs text-gray-400 mb-1">Key Pair Name</label>
            <input id="createKpName" type="text" bind:value={createKpName} placeholder="e.g. my-key-pair" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
            <p class="text-xs text-gray-500 mt-2">The private key material will be displayed once created. You must copy it immediately as it cannot be retrieved again.</p>
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button onclick={() => createKpModalOpen = false} class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onclick={submitCreateKp} disabled={!createKpName} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm transition font-medium">Create</button>
        </div>
    </div>
</Modal>

<Modal bind:open={createKpMaterialModalOpen} title="Private Key Material" maxWidth="max-w-2xl">
    <div class="flex flex-col gap-4">
        <p class="text-sm text-yellow-400 bg-yellow-900/20 p-3 rounded border border-yellow-900/50">Save this key material now! You will not be able to retrieve it again after closing this window.</p>
        <div class="bg-gray-950 p-4 rounded border border-gray-800">
            <pre class="text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">{createKpMaterial}</pre>
        </div>
        <div class="flex justify-end mt-4">
            <button onclick={() => createKpMaterialModalOpen = false} class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm transition font-medium">I have copied the key</button>
        </div>
    </div>
</Modal>

<Modal bind:open={createVolModalOpen} title="Create Volume">
    <div class="flex flex-col gap-4">
        <div>
            <label for="createVolSize" class="block text-xs text-gray-400 mb-1">Size (GiB)</label>
            <input id="createVolSize" type="number" min="1" bind:value={createVolSize} class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div>
            <label for="createVolAz" class="block text-xs text-gray-400 mb-1">Availability Zone</label>
            {#if availableAzs.length > 0}
                <select id="createVolAz" bind:value={createVolAz} class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                    {#each availableAzs as az}
                        <option value={az}>{az}</option>
                    {/each}
                </select>
            {:else}
                <input id="createVolAz" type="text" bind:value={createVolAz} placeholder="e.g. us-east-1a" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
            {/if}
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button onclick={() => createVolModalOpen = false} class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onclick={submitCreateVol} disabled={!createVolSize || !createVolAz} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm transition font-medium">Create</button>
        </div>
    </div>
</Modal>

<Modal bind:open={createSnapModalOpen} title="Create Snapshot">
    <div class="flex flex-col gap-4">
        <div>
            <label for="createSnapVolId" class="block text-xs text-gray-400 mb-1">Volume ID</label>
            <input id="createSnapVolId" type="text" bind:value={createSnapVolId} placeholder="e.g. vol-0123456789abcdef0" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div>
            <label for="createSnapDesc" class="block text-xs text-gray-400 mb-1">Description (Optional)</label>
            <input id="createSnapDesc" type="text" bind:value={createSnapDesc} placeholder="Snapshot description" class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button onclick={() => createSnapModalOpen = false} class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button onclick={submitCreateSnap} disabled={!createSnapVolId} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm transition font-medium">Create</button>
        </div>
    </div>
</Modal>
