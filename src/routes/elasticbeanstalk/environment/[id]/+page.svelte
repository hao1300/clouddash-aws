<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading } from "@mdi/js";

    import {
        DescribeEnvironmentsCommand,
        RestartAppServerCommand,
        TerminateEnvironmentCommand,
        AbortEnvironmentUpdateCommand,
        type EnvironmentDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import MetricChart from "$lib/components/MetricChart.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { confirmDialog } from "$lib/services/confirm.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import { goto } from "$app/navigation";

    let rawEnvId = $derived($page.params.id || "");
    let envId = $derived(decodeURIComponent(rawEnvId));
    
    let env = $state<EnvironmentDescription | null>(null);
    let loading = $state(false);
    let error = $state("");
    let metricsLoading = $state(false);
    let metricPeriod = $state(86400);
    
    let actionLoading = $state(false);
    let actionError = $state("");
    let actionSuccess = $state("");

    let metricsData = $state({
        health: [] as any[],
        requests: [] as any[],
        errors4xx: [] as any[],
        errors5xx: [] as any[],
    });

    $effect(() => {
        titleService.setResource(envId, undefined, $page.url.pathname);
    });

    $effect(() => {
        if (aws.eb && envId) {
            loadEnvironment();
        }
    });

    $effect(() => {
        if (aws.getCWClient() && envId && env?.EnvironmentName) {
            loadMetrics(env.EnvironmentName);
        }
    });

    async function loadEnvironment() {
        if (!aws.eb || !envId) return;
        try {
            loading = true;
            error = "";
            let commandOpts: any = {};
            if (envId.startsWith("e-")) {
                commandOpts.EnvironmentIds = [envId];
            } else {
                commandOpts.EnvironmentNames = [envId];
            }
            
            const res = await aws.eb.send(
                new DescribeEnvironmentsCommand(commandOpts),
            );
            if (res.Environments && res.Environments.length > 0) {
                env = res.Environments[0];
            } else {
                error = "Environment not found";
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function executeAction(action: "restart" | "terminate" | "abort") {
        if (!aws.eb || !env?.EnvironmentId) return;
        if (!(await confirmDialog({
            message: `Are you sure you want to ${action} this environment?`,
            confirmText: action.charAt(0).toUpperCase() + action.slice(1),
            destructive: action === "terminate",
        }))) return;
        
        try {
            actionLoading = true;
            actionError = "";
            actionSuccess = "";
            
            if (action === "restart") {
                await aws.eb.send(new RestartAppServerCommand({ EnvironmentId: env.EnvironmentId }));
                actionSuccess = "App server restart initiated successfully.";
            } else if (action === "terminate") {
                await aws.eb.send(new TerminateEnvironmentCommand({ EnvironmentId: env.EnvironmentId }));
                actionSuccess = "Environment termination initiated successfully.";
            } else if (action === "abort") {
                await aws.eb.send(new AbortEnvironmentUpdateCommand({ EnvironmentId: env.EnvironmentId }));
                actionSuccess = "Environment update aborted successfully.";
            }
            
            // Reload after action
            setTimeout(loadEnvironment, 2000);
        } catch (e: any) {
            actionError = e.message || String(e);
        } finally {
            actionLoading = false;
        }
    }

    async function loadMetrics(environmentName: string) {
        // Elastic Beanstalk metrics are typically regional, so we use the default CW client
        const cwClient = aws.getCWClient();
        if (!cwClient || !environmentName) return;
        
        try {
            metricsLoading = true;
            const end = new Date();
            const start = new Date(end.getTime() - metricPeriod * 1000);
            const period =
                metricPeriod <= 3600 ? 60 : metricPeriod <= 86400 ? 300 : 3600;

            const fetchMetric = async (metricName: string, stat: string) => {
                const resp = await cwClient.send(
                    new GetMetricStatisticsCommand({
                        Namespace: "AWS/ElasticBeanstalk",
                        MetricName: metricName,
                        Dimensions: [
                            { Name: "EnvironmentName", Value: environmentName },
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

            const [health, requests, errors4xx, errors5xx] =
                await Promise.all([
                    fetchMetric("EnvironmentHealth", "Average"),
                    fetchMetric("ApplicationRequestsTotal", "Sum"),
                    fetchMetric("ApplicationRequests4xx", "Sum"),
                    fetchMetric("ApplicationRequests5xx", "Sum"),
                ]);

            metricsData = { health, requests, errors4xx, errors5xx };
        } catch (e) {
            console.error("Failed to load metrics:", e);
        } finally {
            metricsLoading = false;
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-auto p-6 relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    {#if loading && !env}
        <div
            class="flex-1 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest"
        >
            Loading Environment...
        </div>
    {:else if env}
        <div class="flex items-center justify-between mb-6 shrink-0">
            <div
                class="flex items-center gap-3 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm flex-1 mr-4"
            >
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-gray-200"
                        >{env.EnvironmentName}</span
                    >
                    <span class="text-xs text-gray-500"
                        >App: {env.ApplicationName} | ID: {env.EnvironmentId}</span
                    >
                </div>
            </div>
            
            <div class="flex items-center gap-2">
                <button
                    class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold rounded shadow-sm border border-gray-700 transition-colors disabled:opacity-50"
                    onclick={() => executeAction("restart")}
                    disabled={actionLoading}
                >
                    Restart App Server
                </button>
                <button
                    class="px-4 py-2 bg-red-900/50 hover:bg-red-900 border border-red-800 text-red-200 text-xs font-bold rounded shadow-sm transition-colors disabled:opacity-50"
                    onclick={() => executeAction("terminate")}
                    disabled={actionLoading}
                >
                    Terminate
                </button>
                <button
                    class="px-4 py-2 bg-yellow-900/50 hover:bg-yellow-900 border border-yellow-800 text-yellow-200 text-xs font-bold rounded shadow-sm transition-colors disabled:opacity-50"
                    onclick={() => executeAction("abort")}
                    disabled={actionLoading || env.Status !== "Updating"}
                >
                    Abort Update
                </button>
            </div>
        </div>

        {#if actionError}
            <div class="mb-4 bg-red-500/20 text-red-300 p-3 text-sm rounded border border-red-500/30">
                {actionError}
            </div>
        {/if}
        {#if actionSuccess}
            <div class="mb-4 bg-green-500/20 text-green-300 p-3 text-sm rounded border border-green-500/30">
                {actionSuccess}
            </div>
        {/if}

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 shrink-0">
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Status
                </div>
                <div
                    class="text-base font-bold {env.Status === 'Ready'
                        ? 'text-green-400'
                        : 'text-yellow-400'}"
                >
                    {env.Status}
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Health
                </div>
                <div
                    class="text-base font-bold {env.Health === 'Green'
                        ? 'text-green-400'
                        : env.Health === 'Yellow'
                          ? 'text-yellow-400'
                          : env.Health === 'Red'
                            ? 'text-red-400'
                            : 'text-gray-400'}"
                >
                    {env.Health || "Unknown"}
                    <div class="text-xs font-normal text-gray-500 truncate mt-1" title={env.HealthStatus || ""}>{env.HealthStatus || "-"}</div>
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Version Label
                </div>
                {#if env.VersionLabel && env.ApplicationName}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="text-base font-bold text-blue-400 hover:text-blue-300 cursor-pointer truncate transition-colors"
                        title={env.VersionLabel}
                        onclick={() =>
                            goto(
                                `/elasticbeanstalk/versions/${encodeURIComponent(env!.ApplicationName + "::" + env!.VersionLabel)}`,
                            )}
                    >
                        {env.VersionLabel}
                    </div>
                {:else}
                    <div class="text-base font-bold text-gray-200 truncate" title={env.VersionLabel || ""}>
                        {env.VersionLabel || "-"}
                    </div>
                {/if}
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm overflow-hidden"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Platform
                </div>
                <div class="text-base font-bold text-gray-200 truncate" title={env.PlatformArn || ""}>
                    {env.PlatformArn ? env.PlatformArn.split('/').pop() : "-"}
                </div>
            </div>
        </div>

        {#if env.EndpointURL}
            <div class="mb-6 shrink-0">
                <div
                    class="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold"
                >
                    Endpoint URL
                </div>
                <a 
                    href={env.EndpointURL.startsWith('http') ? env.EndpointURL : `http://${env.EndpointURL}`}
                    target="_blank"
                    rel="noreferrer"
                    class="text-blue-400 hover:text-blue-300 text-sm break-all bg-gray-900 border border-gray-800 px-4 py-2 rounded-lg inline-block"
                >
                    {env.EndpointURL} ↗
                </a>
            </div>
        {/if}

        <!-- Metrics -->
        <div
            class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm shrink-0 mb-4"
        >
            <div
                class="flex items-center justify-between mb-4 border-b border-gray-800 pb-3"
            >
                <div class="flex items-center gap-2">
                    <h3
                        class="text-xs text-gray-400 uppercase tracking-widest font-bold"
                    >
                        Environment Metrics
                    </h3>
                    {#if metricsLoading}
                        <Icon path={mdiLoading} size={14} class="animate-spin text-gray-500" />
                    {/if}
                </div>
                <select
                    bind:value={metricPeriod}
                    onchange={() => { if (env?.EnvironmentName) loadMetrics(env.EnvironmentName); }}
                    class="bg-gray-950 text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 shadow-inner"
                >
                    <option value={3600}>Last 1 hour</option>
                    <option value={86400}>Last 24 hours</option>
                    <option value={604800}>Last 7 days</option>
                </select>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricChart
                    title="Environment Health (Avg)"
                    data={metricsData.health}
                    formatValue={(v) => ["Unknown", "Ok", "Info", "Warning", "Degraded", "Severe", "Pending"][Math.round(v)] || v.toFixed(1)}
                    yLabel="Status"
                />
                <MetricChart
                    title="Requests Total (Sum)"
                    data={metricsData.requests}
                    formatValue={(v) => v.toLocaleString()}
                    yLabel="Count"
                />
                <MetricChart
                    title="4xx Errors (Sum)"
                    data={metricsData.errors4xx}
                    formatValue={(v) => v.toLocaleString()}
                    yLabel="Count"
                />
                <MetricChart
                    title="5xx Errors (Sum)"
                    data={metricsData.errors5xx}
                    formatValue={(v) => v.toLocaleString()}
                    yLabel="Count"
                />
            </div>
        </div>
    {/if}
</div>
