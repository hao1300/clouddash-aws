<script lang="ts">
    import {
        DescribeInstancesCommand,
        StartInstancesCommand,
        StopInstancesCommand,
        RebootInstancesCommand,
        TerminateInstancesCommand,
    } from "@aws-sdk/client-ec2";
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import MetricChart from "$lib/components/MetricChart.svelte";
    import { aws } from "$lib/services/aws.svelte";
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
                    privateIp: inst.PrivateIpAddress ?? "-",
                    vpcId: inst.VpcId ?? "-",
                    subnetId: inst.SubnetId ?? "-",
                    keyName: inst.KeyName ?? "-",
                    launchTime: inst.LaunchTime?.toLocaleString() ?? "-",
                    arch: inst.Architecture ?? "-",
                    platform: inst.PlatformDetails ?? "-",
                    monitoring: inst.Monitoring?.State ?? "-",
                    securityGroups:
                        inst.SecurityGroups?.map((sg) => sg.GroupName).join(
                            ", ",
                        ) ?? "-",
                };
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
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
                if (!confirm(`Terminate instance ${instanceId}?`)) return;
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
        <div class="flex justify-end mb-4">
            <select
                class="bg-gray-800 text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 shadow cursor-pointer appearance-none text-center font-bold uppercase tracking-wider"
                onchange={(e) => {
                    const action = e.currentTarget.value;
                    if (action) {
                        handleAction(action as any);
                        e.currentTarget.value = "";
                    }
                }}
            >
                <option value="" disabled selected>Actions ▾</option>
                {#if instance.state === "stopped"}
                    <option value="start">Start</option>
                {:else if instance.state === "running"}
                    <option value="stop">Stop</option>
                    <option value="reboot">Reboot</option>
                {/if}
                <option value="terminate">Terminate</option>
            </select>
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
                        class="text-[10px] font-bold text-gray-600 uppercase mb-1"
                    >
                        Security Groups
                    </div>
                    <div
                        class="text-xs text-blue-400 font-medium bg-blue-400/5 p-3 rounded border border-blue-400/10"
                    >
                        {instance.securityGroups}
                    </div>
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
                        <span class="animate-spin text-gray-500 text-xs">⟳</span>
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
