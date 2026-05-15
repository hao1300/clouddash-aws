<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import Select from "$lib/components/Select.svelte";
    import { mdiLoading, mdiPencil, mdiCheck, mdiClose } from "@mdi/js";

    import {
        DescribeInstancesCommand,
        StartInstancesCommand,
        StopInstancesCommand,
        RebootInstancesCommand,
        TerminateInstancesCommand,
        CreateTagsCommand,
    } from "@aws-sdk/client-ec2";
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import MetricChart from "$lib/components/MetricChart.svelte";
    import CopyButton from "$lib/components/CopyButton.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { confirmDialog } from "$lib/services/confirm.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";

    let instanceId = $derived($page.params.id || "");

    $effect(() => {
        const name =
            instance?.name && instance.name !== "Unnamed"
                ? `${instance.name} (${instanceId})`
                : instanceId;
        titleService.setResource(name, undefined, $page.url.pathname);
    });

    let instance = $state<any | null>(null);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let isEditingName = $state(false);
    let editingName = $state("");
    let savingName = $state(false);

    let metricsLoading = $state(false);
    let metricPeriod = $state(86400);
    let metricsData = $state({
        cpu: [] as any[],
        networkIn: [] as any[],
        networkOut: [] as any[],
    });

    $effect(() => {
        if (aws.ec2 && instanceId) {
            loadInstance();
        }
    });

    $effect(() => {
        if (aws.getCWClient() && instanceId) {
            loadMetrics();
        }
    });

    async function loadInstance() {
        if (!aws.ec2 || !instanceId) return;
        try {
            loading = true;
            const res = await aws.ec2.send(
                new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
            );
            const inst = res.Reservations?.[0]?.Instances?.[0];
            if (inst) {
                const nameTag = inst.Tags?.find((t) => t.Key === "Name");
                instance = {
                    id: inst.InstanceId,
                    name: nameTag?.Value ?? "Unnamed",
                    state: inst.State?.Name ?? "unknown",
                    type: inst.InstanceType,
                    publicIp: inst.PublicIpAddress ?? "-",
                    publicDns: inst.PublicDnsName || "-",
                    privateIp: inst.PrivateIpAddress ?? "-",
                    vpcId: inst.VpcId ?? "-",
                    subnetId: inst.SubnetId ?? "-",
                    keyName: inst.KeyName ?? "-",
                    launchTime: inst.LaunchTime?.toLocaleString() ?? "-",
                    arch: inst.Architecture ?? "-",
                    platform: inst.PlatformDetails ?? "-",
                    monitoring: inst.Monitoring?.State ?? "-",
                    securityGroups: inst.SecurityGroups?.map((sg) => ({
                        id: sg.GroupId || "",
                        name: sg.GroupName || "Unnamed",
                    })) ?? [],
                };
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function startEditName() {
        if (!instance) return;
        editingName = instance.name === "Unnamed" ? "" : instance.name;
        isEditingName = true;
    }

    function cancelEditName() {
        isEditingName = false;
        editingName = "";
    }

    async function saveName() {
        if (!aws.ec2 || !instanceId || !instance) return;
        const newName = editingName.trim();
        const currentName = instance.name === "Unnamed" ? "" : instance.name;
        if (newName === currentName) {
            isEditingName = false;
            return;
        }
        try {
            savingName = true;
            error = "";
            await aws.ec2.send(
                new CreateTagsCommand({
                    Resources: [instanceId],
                    Tags: [{ Key: "Name", Value: newName }],
                }),
            );
            isEditingName = false;
            actionMsg = `Instance renamed to ${newName || "Unnamed"}.`;
            await loadInstance();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            savingName = false;
        }
    }

    async function handleAction(
        action: "start" | "stop" | "reboot" | "terminate",
    ) {
        if (!aws.ec2 || !instanceId) return;
        try {
            loading = true;
            if (action === "start")
                await aws.ec2.send(
                    new StartInstancesCommand({ InstanceIds: [instanceId] }),
                );
            if (action === "stop")
                await aws.ec2.send(
                    new StopInstancesCommand({ InstanceIds: [instanceId] }),
                );
            if (action === "reboot")
                await aws.ec2.send(
                    new RebootInstancesCommand({ InstanceIds: [instanceId] }),
                );
            if (action === "terminate") {
                if (!(await confirmDialog({ message: `Terminate instance ${instanceId}?`, confirmText: "Terminate", destructive: true }))) return;
                await aws.ec2.send(
                    new TerminateInstancesCommand({ InstanceIds: [instanceId] }),
                );
            }
            actionMsg = `Instance ${instanceId} ${action}ed.`;
            setTimeout(() => {
                loadInstance();
            }, 1000);
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function loadMetrics() {
        const cwClient = aws.getCWClient();
        if (!cwClient || !instanceId) return;
        try {
            metricsLoading = true;
            const end = new Date();
            const start = new Date(end.getTime() - metricPeriod * 1000);
            const period =
                metricPeriod <= 3600 ? 60 : metricPeriod <= 86400 ? 300 : 3600;

            const fetchMetric = async (metricName: string, stat: string) => {
                const resp = await cwClient.send(
                    new GetMetricStatisticsCommand({
                        Namespace: "AWS/EC2",
                        MetricName: metricName,
                        Dimensions: [
                            { Name: "InstanceId", Value: instanceId },
                        ],
                        StartTime: start,
                        EndTime: end,
                        Period: period,
                        Statistics: [stat as "Average" | "Sum"],
                    }),
                );
                return (resp.Datapoints || []).map((dp) => ({
                    rawTimestamp: dp.Timestamp!,
                    rawAverage: (stat === "Average" ? dp.Average : dp.Sum) || 0,
                }));
            };

            const [cpu, networkIn, networkOut] = await Promise.all([
                fetchMetric("CPUUtilization", "Average"),
                fetchMetric("NetworkIn", "Sum"),
                fetchMetric("NetworkOut", "Sum"),
            ]);

            metricsData = { cpu, networkIn, networkOut };
        } catch (e) {
            console.error("Failed to load metrics:", e);
        } finally {
            metricsLoading = false;
        }
    }

    function formatBytes(b: number) {
        if (b === 0) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-auto p-2 relative">
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

    {#if !instanceId}
        <div
            class="p-8 text-gray-500 italic text-xs uppercase tracking-widest bg-gray-900/20 border border-gray-800 rounded-lg text-center"
        >
            No Instance Selected
        </div>
    {:else if loading}
        <div
            class="flex-1 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest"
        >
            Loading Instance Details...
        </div>
    {:else if instance}
        <div class="flex justify-between items-center mb-4 gap-3 flex-wrap">
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest shrink-0">Name</span>
                {#if isEditingName}
                    <input
                        bind:value={editingName}
                        onkeydown={(e) => {
                            if (e.key === "Enter") saveName();
                            else if (e.key === "Escape") cancelEditName();
                        }}
                        disabled={savingName}
                        placeholder="Instance name"
                        class="flex-1 min-w-0 max-w-xs bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                    <button
                        onclick={saveName}
                        disabled={savingName}
                        class="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 shrink-0"
                        title="Save"
                    >
                        <Icon path={savingName ? mdiLoading : mdiCheck} size={16} class={savingName ? "animate-spin" : ""} />
                    </button>
                    <button
                        onclick={cancelEditName}
                        disabled={savingName}
                        class="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 transition disabled:opacity-50 shrink-0"
                        title="Cancel"
                    >
                        <Icon path={mdiClose} size={16} />
                    </button>
                {:else}
                    <span
                        class="text-sm font-bold text-gray-200 truncate"
                        title={instance.name}
                    >
                        {instance.name}
                    </span>
                    <button
                        onclick={startEditName}
                        class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition shrink-0"
                        title="Rename instance"
                    >
                        <Icon path={mdiPencil} size={16} />
                    </button>
                {/if}
            </div>
            <div class="w-40 shrink-0">
                <Select
                    value=""
                    placeholder="Actions"
                    primary={true}
                    class="font-bold uppercase tracking-wider"
                    options={[
                        ...(instance.state === 'stopped' ? [{value: 'start', label: 'Start'}] : []),
                        ...(instance.state === 'running' ? [{value: 'stop', label: 'Stop'}, {value: 'reboot', label: 'Reboot'}] : []),
                        {value: 'terminate', label: 'Terminate'}
                    ]}
                    onchange={(action) => {
                        if (action) handleAction(action as any);
                    }}
                />
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {#each [{ label: "Instance State", value: instance.state, color: instance.state === "running" ? "text-green-400" : "text-red-400" }, { label: "Instance Type", value: instance.type }, { label: "Public IP", value: instance.publicIp }, { label: "Private IP", value: instance.privateIp }, { label: "VPC ID", value: instance.vpcId }, { label: "Subnet ID", value: instance.subnetId }, { label: "Key Pair", value: instance.keyName }, { label: "Launch Time", value: instance.launchTime }] as item}
                <div
                    class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
                >
                    <div
                        class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                    >
                        {item.label}
                    </div>
                    <div
                        class="text-xs font-bold {item.color ||
                            'text-gray-200'} truncate"
                        title={item.value}
                    >
                        {item.value}
                    </div>
                </div>
            {/each}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <h3
                    class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6 border-b border-gray-800 pb-2"
                >
                    Configuration
                </h3>
                <div class="space-y-4">
                    <div
                        class="flex justify-between items-center text-xs border-b border-gray-800/30 pb-2 gap-4"
                    >
                        <span class="text-gray-500 shrink-0">Public DNS</span>
                        <div class="flex items-center gap-2 overflow-hidden justify-end">
                            <span class="text-blue-400 font-mono truncate" title={instance.publicDns}
                                >{instance.publicDns}</span
                            >
                            {#if instance.publicDns !== "-"}
                                <CopyButton text={instance.publicDns} class="shrink-0 text-[10px]" />
                            {/if}
                        </div>
                    </div>
                    <div
                        class="flex justify-between text-xs border-b border-gray-800/30 pb-2"
                    >
                        <span class="text-gray-500">Architecture</span>
                        <span class="text-gray-300 font-mono"
                            >{instance.arch}</span
                        >
                    </div>
                    <div
                        class="flex justify-between text-xs border-b border-gray-800/30 pb-2"
                    >
                        <span class="text-gray-500">Platform</span>
                        <span class="text-gray-300">{instance.platform}</span>
                    </div>
                    <div
                        class="flex justify-between text-xs border-b border-gray-800/30 pb-2"
                    >
                        <span class="text-gray-500">Monitoring</span>
                        <span class="text-gray-300">{instance.monitoring}</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span class="text-gray-500">Launch Time</span>
                        <span class="text-gray-300">{instance.launchTime}</span>
                    </div>
                </div>
            </div>

            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <h3
                    class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6 border-b border-gray-800 pb-2"
                >
                    Security
                </h3>
                <div class="space-y-4">
                    <div
                        class="text-[10px] font-bold text-gray-600 uppercase mb-2"
                    >
                        Security Groups
                    </div>
                    {#if instance.securityGroups && instance.securityGroups.length > 0}
                        <div class="flex flex-wrap gap-2">
                            {#each instance.securityGroups as sg}
                                <a
                                    href={`/ec2/security-groups/${sg.id}`}
                                    class="text-xs text-blue-400 font-medium bg-blue-400/5 px-3 py-1.5 rounded border border-blue-400/10 hover:bg-blue-400/20 hover:border-blue-400/40 transition-colors block"
                                    title={sg.id}
                                >
                                    {sg.name}
                                </a>
                            {/each}
                        </div>
                    {:else}
                        <div class="text-xs text-gray-500">-</div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Metrics -->
        <div class="mt-6 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div class="flex items-center justify-between mb-6 border-b border-gray-800 pb-3">
                <div class="flex items-center gap-2">
                    <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        CloudWatch Metrics
                    </h3>
                    {#if metricsLoading}
                        <Icon path={mdiLoading} size={14} class="animate-spin text-gray-500" />
                    {/if}
                </div>
                <select
                    bind:value={metricPeriod}
                    onchange={() => loadMetrics()}
                    class="bg-gray-950 text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 shadow-inner"
                >
                    <option value={3600}>Last 1 hour</option>
                    <option value={86400}>Last 24 hours</option>
                    <option value={604800}>Last 7 days</option>
                </select>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <MetricChart
                    title="CPU Utilization (Avg)"
                    data={metricsData.cpu}
                    formatValue={(v) => v.toFixed(2) + "%"}
                    yLabel="%"
                />
                <MetricChart
                    title="Network In (Sum)"
                    data={metricsData.networkIn}
                    formatValue={formatBytes}
                    yLabel="Bytes"
                />
                <MetricChart
                    title="Network Out (Sum)"
                    data={metricsData.networkOut}
                    formatValue={formatBytes}
                    yLabel="Bytes"
                />
            </div>
        </div>
    {/if}
</div>
