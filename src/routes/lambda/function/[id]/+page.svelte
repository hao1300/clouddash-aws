<script lang="ts">
    import {
        GetFunctionConfigurationCommand,
        InvokeCommand,
        UpdateFunctionConfigurationCommand,
        DeleteFunctionCommand,
        ListEventSourceMappingsCommand,
        GetPolicyCommand,
        type FunctionConfiguration,
    } from "@aws-sdk/client-lambda";
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import MetricChart from "$lib/components/MetricChart.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";

    let fnName = $derived($page.params.id || "");

    $effect(() => {
        titleService.setResource(fnName, undefined, $page.url.pathname);
    });

    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let fnDetails = $state<FunctionConfiguration | null>(null);
    let detailTab = $state<"invoke" | "configuration" | "metrics" | "connections">("invoke");

    let metricPeriod = $state(86400);
    let metricsLoading = $state(false);
    let metricsData = $state({
        invocations: [] as any[],
        errors: [] as any[],
        duration: [] as any[],
        throttles: [] as any[],
    });

    let currentFetchedPeriod = $state(0);

    $effect(() => {
        if (aws.cw && fnName && detailTab === "metrics" && currentFetchedPeriod !== metricPeriod) {
            currentFetchedPeriod = metricPeriod;
            loadMetrics();
        }
    });

    let connectionsLoading = $state(false);
    let connectionsLoadedFn = $state("");
    interface ConnectionInfo {
        type: string;
        arn: string;
        description?: string;
        link?: string;
    }
    let connections = $state<ConnectionInfo[]>([]);

    $effect(() => {
        if (aws.lambda && fnName && detailTab === "connections" && connectionsLoadedFn !== fnName && !connectionsLoading) {
            connectionsLoadedFn = fnName;
            loadConnections();
        }
    });

    async function loadConnections() {
        if (!aws.lambda || !fnName) return;
        connectionsLoading = true;
        connections = [];
        try {
            let conns: ConnectionInfo[] = [];

            // 1. Event Source Mappings
            try {
                const esmRes = await aws.lambda.send(new ListEventSourceMappingsCommand({ FunctionName: fnName }));
                for (const mapping of (esmRes.EventSourceMappings || [])) {
                    let type = "Event Source Mapping";
                    let link = "";
                    let arn = mapping.EventSourceArn || "";
                    let sqsMatch = arn.match(/arn:aws:sqs:(.*?):(\d+):(.*)/);
                    if (sqsMatch) {
                        type = "SQS Queue";
                        link = `/sqs/queue/${sqsMatch[3]}/messages`;
                    }
                    let ddbMatch = arn.match(/arn:aws:dynamodb:.*?:.*?:table\/(.*?)\/stream/);
                    if (ddbMatch) {
                        type = "DynamoDB Stream";
                        link = `/dynamodb/${ddbMatch[1]}`;
                    }
                    conns.push({
                        type,
                        arn,
                        description: `State: ${mapping.State}`,
                        link
                    });
                }
            } catch (e: any) {
                console.error("Error fetching event source mappings", e);
            }

            // 2. Resource-based policy
            try {
                const policyRes = await aws.lambda.send(new GetPolicyCommand({ FunctionName: fnName }));
                const policyDoc = JSON.parse(policyRes.Policy || "{}");
                for (const stmt of (policyDoc.Statement || [])) {
                    if (stmt.Effect === "Allow" && stmt.Action?.includes("lambda:InvokeFunction")) {
                        const principal = typeof stmt.Principal === 'string' ? stmt.Principal : stmt.Principal?.Service;
                        let sourceArn = stmt.Condition?.ArnLike?.["aws:SourceArn"] || stmt.Condition?.ArnEquals?.["aws:SourceArn"] || stmt.Condition?.StringEquals?.["AWS:SourceArn"];
                        
                        let type = principal || "Unknown";
                        let link = "";
                        let arn = sourceArn || "Account/Any";

                        if (principal === "apigateway.amazonaws.com") {
                            type = "API Gateway";
                        } else if (principal === "s3.amazonaws.com") {
                            type = "S3 Bucket";
                            let bMatch = sourceArn?.match(/arn:aws:s3:::(.*)/);
                            if (bMatch) {
                                link = `/s3/${bMatch[1]}`;
                            }
                        } else if (principal === "sns.amazonaws.com") {
                            type = "SNS Topic";
                            let snsMatch = sourceArn?.match(/arn:aws:sns:(.*?):(\d+):(.*)/);
                            if (snsMatch) {
                                link = `/sns`; 
                            }
                        } else if (principal === "events.amazonaws.com") {
                            type = "CloudWatch Events";
                        }

                        conns.push({
                            type,
                            arn,
                            description: `Statement ID: ${stmt.Sid}`,
                            link
                        });
                    }
                }
            } catch(e: any) {
                if (e.name !== 'ResourceNotFoundException') {
                    console.error("Error fetching policy", e);
                }
            }

            connections = conns;
        } catch(e) {
            console.error(e);
        } finally {
            connectionsLoading = false;
        }
    }

    async function loadMetrics() {
        if (!aws.cw || !fnName) return;
        metricsLoading = true;
        try {
            const periodVal = Number(metricPeriod);
            const end = new Date();
            const start = new Date(end.getTime() - periodVal * 1000);
            const period =
                periodVal <= 3600 ? 60 : periodVal <= 86400 ? 300 : 3600;

            const fetchMetric = async (metricName: string, stat: "Sum" | "Average" = "Sum") => {
                const resp = await aws.cw!.send(
                    new GetMetricStatisticsCommand({
                        Namespace: "AWS/Lambda",
                        MetricName: metricName,
                        Dimensions: [{ Name: "FunctionName", Value: fnName }],
                        StartTime: start,
                        EndTime: end,
                        Period: period,
                        Statistics: [stat],
                    }),
                );

                return (resp.Datapoints || []).map((dp) => ({
                    rawTimestamp: dp.Timestamp!,
                    rawAverage: stat === 'Average' ? (dp.Average || 0) : (dp.Sum || 0),
                }));
            };

            const [invocations, errors, duration, throttles] = await Promise.all([
                fetchMetric("Invocations", "Sum"),
                fetchMetric("Errors", "Sum"),
                fetchMetric("Duration", "Average"),
                fetchMetric("Throttles", "Sum"),
            ]);

            metricsData = { invocations, errors, duration, throttles };
        } catch (e) {
            console.error(e);
        } finally {
            metricsLoading = false;
        }
    }

    // Invoke state
    let invokeInput = $state("{}");
    let invokeResult = $state<any>(null);
    let invokeLoading = $state(false);

    // Config state
    let isEditingConfig = $state(false);
    let editMemory = $state(128);
    let editTimeout = $state(3);
    let editHandler = $state("");
    let configLoading = $state(false);

    // Env state
    let isEditingEnv = $state(false);
    let editEnvVars = $state<{ key: string; value: string }[]>([]);
    let envLoading = $state(false);

    $effect(() => {
        if (aws.lambda && fnName) {
            loadDetails();
        }
    });

    async function loadDetails() {
        if (!aws.lambda || !fnName) return;
        try {
            loading = true;
            const res = await aws.lambda.send(
                new GetFunctionConfigurationCommand({ FunctionName: fnName }),
            );
            fnDetails = res;
            editMemory = res.MemorySize || 128;
            editTimeout = res.Timeout || 3;
            editHandler = res.Handler || "";
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleInvoke() {
        if (!aws.lambda || !fnName) return;
        try {
            invokeLoading = true;
            invokeResult = null;
            const res = await aws.lambda.send(
                new InvokeCommand({
                    FunctionName: fnName,
                    Payload: new TextEncoder().encode(invokeInput),
                }),
            );
            const payload = res.Payload
                ? new TextDecoder().decode(res.Payload)
                : "";
            invokeResult = {
                statusCode: res.StatusCode,
                payload,
                error: res.FunctionError,
            };
        } catch (e: any) {
            invokeResult = { error: e.message || String(e) };
        } finally {
            invokeLoading = false;
        }
    }

    async function handleSaveConfig() {
        if (!aws.lambda || !fnName) return;
        try {
            configLoading = true;
            const res = await aws.lambda.send(
                new UpdateFunctionConfigurationCommand({
                    FunctionName: fnName,
                    MemorySize: editMemory,
                    Timeout: editTimeout,
                    Handler: editHandler,
                }),
            );
            fnDetails = res;
            isEditingConfig = false;
            actionMsg = "Configuration updated.";
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            configLoading = false;
        }
    }

    async function handleSaveEnv() {
        if (!aws.lambda || !fnName) return;
        try {
            envLoading = true;
            const variables: Record<string, string> = {};
            editEnvVars.forEach((v) => {
                if (v.key.trim()) variables[v.key.trim()] = v.value;
            });
            const res = await aws.lambda.send(
                new UpdateFunctionConfigurationCommand({
                    FunctionName: fnName,
                    Environment: { Variables: variables },
                }),
            );
            fnDetails = res;
            isEditingEnv = false;
            actionMsg = "Environment variables updated.";
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            envLoading = false;
        }
    }

    async function handleDelete() {
        if (!aws.lambda || !fnName || !confirm("Delete this function?")) return;
        try {
            loading = true;
            await aws.lambda.send(
                new DeleteFunctionCommand({ FunctionName: fnName }),
            );
            goto("/lambda");
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
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

    <div class="px-6 border-b border-gray-800 bg-gray-900 shrink-0 {error || actionMsg ? 'mt-8' : ''} flex justify-between items-center">
        <nav class="flex gap-4">
            <button
                onclick={() => (detailTab = "invoke")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'invoke'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Invoke</button
            >
            <button
                onclick={() => (detailTab = "configuration")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'configuration'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Configuration</button
            >
            <button
                onclick={() => (detailTab = "metrics")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'metrics'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Metrics</button
            >
            <button
                onclick={() => (detailTab = "connections")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'connections'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Connections</button
            >
        </nav>
        <a 
            href={`/cloudwatch/logs/${encodeURIComponent('/aws/lambda/' + fnName)}`}
            class="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition border border-gray-700 flex items-center gap-2"
        >
            View Logs
        </a>
    </div>

    <div class="flex-1 overflow-auto p-6 min-h-0 relative">
        {#if detailTab === "invoke"}
            <div class="max-w-3xl space-y-4">
                <div class="bg-gray-900 p-5 rounded-lg border border-gray-800">
                    <label
                        class="block text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-widest"
                        >Event JSON</label
                    >
                    <textarea
                        bind:value={invokeInput}
                        class="w-full h-48 bg-black border border-gray-700 rounded p-3 text-xs font-mono text-gray-300 outline-none focus:border-blue-500"
                    ></textarea>
                    <div class="mt-4 flex justify-end">
                        <button
                            onclick={handleInvoke}
                            disabled={invokeLoading}
                            class="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow flex items-center gap-2"
                        >
                            {#if invokeLoading}<span class="animate-spin"
                                    >⟳</span
                                >{/if} Invoke
                        </button>
                    </div>
                </div>

                {#if invokeResult}
                    <div
                        class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm"
                    >
                        <div
                            class="bg-gray-800/50 px-4 py-2 border-b border-gray-700 flex justify-between items-center"
                        >
                            <span
                                class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
                                >Response</span
                            >
                            <div class="flex gap-2 text-[10px] font-bold">
                                <span
                                    class={invokeResult.statusCode >= 200 &&
                                    invokeResult.statusCode < 300
                                        ? "text-green-400"
                                        : "text-red-400"}
                                    >Status: {invokeResult.statusCode}</span
                                >
                                {#if invokeResult.error}<span
                                        class="text-red-400 underline decoration-red-400/30"
                                        >Error: {invokeResult.error}</span
                                    >{/if}
                            </div>
                        </div>
                        <div class="p-4 bg-black overflow-x-auto max-h-96">
                            <pre
                                class="text-xs text-green-400 font-mono whitespace-pre-wrap">{invokeResult.payload}</pre>
                        </div>
                    </div>
                {/if}
            </div>
        {:else if detailTab === "configuration"}
            <div class="max-w-4xl space-y-6">
                <!-- General Config -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <div
                        class="flex justify-between items-center mb-4 border-b border-gray-800 pb-2"
                    >
                        <h3
                            class="text-xs font-bold text-gray-300 uppercase tracking-widest"
                        >
                            General Configuration
                        </h3>
                        {#if !isEditingConfig}
                            <button
                                onclick={() => (isEditingConfig = true)}
                                class="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded border border-gray-700"
                                >Edit</button
                            >
                        {/if}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label
                                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                                >Memory (MB)</label
                            >
                            {#if isEditingConfig}
                                <input
                                    type="number"
                                    bind:value={editMemory}
                                    class="w-full bg-black border border-gray-700 rounded p-1.5 text-xs text-white"
                                />
                            {:else}
                                <div class="text-sm text-gray-300">
                                    {fnDetails?.MemorySize} MB
                                </div>
                            {/if}
                        </div>
                        <div>
                            <label
                                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                                >Timeout (s)</label
                            >
                            {#if isEditingConfig}
                                <input
                                    type="number"
                                    bind:value={editTimeout}
                                    class="w-full bg-black border border-gray-700 rounded p-1.5 text-xs text-white"
                                />
                            {:else}
                                <div class="text-sm text-gray-300">
                                    {fnDetails?.Timeout} s
                                </div>
                            {/if}
                        </div>
                        <div class="md:col-span-2">
                            <label
                                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                                >Handler</label
                            >
                            {#if isEditingConfig}
                                <input
                                    type="text"
                                    bind:value={editHandler}
                                    class="w-full bg-black border border-gray-700 rounded p-1.5 text-xs font-mono text-white"
                                />
                            {:else}
                                <div class="text-sm text-gray-300 font-mono">
                                    {fnDetails?.Handler}
                                </div>
                            {/if}
                        </div>
                    </div>
                    {#if isEditingConfig}
                        <div class="mt-4 flex justify-between gap-2">
                            <button
                                onclick={handleDelete}
                                class="text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-1.5 rounded transition border border-red-500/30"
                                >Delete this function</button
                            >
                            <div class="flex justify-end gap-2">
                                <button
                                    onclick={() => (isEditingConfig = false)}
                                    class="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5"
                                    >Cancel</button
                                >
                                <button
                                    onclick={handleSaveConfig}
                                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow"
                                    >Save</button
                                >
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Env Vars -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <div
                        class="flex justify-between items-center mb-4 border-b border-gray-800 pb-2"
                    >
                        <h3
                            class="text-xs font-bold text-gray-300 uppercase tracking-widest"
                        >
                            Environment Variables
                        </h3>
                        {#if !isEditingEnv}
                            <button
                                onclick={() => {
                                    editEnvVars = Object.entries(
                                        fnDetails?.Environment?.Variables || {},
                                    ).map(([key, value]) => ({ key, value }));
                                    isEditingEnv = true;
                                }}
                                class="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded border border-gray-700"
                                >Edit</button
                            >
                        {/if}
                    </div>
                    {#if isEditingEnv}
                        <div class="space-y-2">
                            {#each editEnvVars as ev, i}
                                <div class="flex gap-2">
                                    <input
                                        bind:value={ev.key}
                                        placeholder="Key"
                                        class="flex-1 bg-black border border-gray-700 rounded p-1.5 text-xs font-mono text-white"
                                    />
                                    <input
                                        bind:value={ev.value}
                                        placeholder="Value"
                                        class="flex-[2] bg-black border border-gray-700 rounded p-1.5 text-xs font-mono text-white"
                                    />
                                    <button
                                        onclick={() => editEnvVars.splice(i, 1)}
                                        class="text-gray-500 hover:text-red-400"
                                        >✕</button
                                    >
                                </div>
                            {/each}
                            <button
                                onclick={() =>
                                    editEnvVars.push({ key: "", value: "" })}
                                class="text-[10px] text-blue-400 font-bold uppercase"
                                >+ Add Variable</button
                            >
                            <div class="mt-4 flex justify-end gap-2">
                                <button
                                    onclick={() => (isEditingEnv = false)}
                                    class="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5"
                                    >Cancel</button
                                >
                                <button
                                    onclick={handleSaveEnv}
                                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow"
                                    >Save</button
                                >
                            </div>
                        </div>
                    {:else}
                        <div class="space-y-1">
                            {#each Object.entries(fnDetails?.Environment?.Variables || {}) as [k, v]}
                                <div
                                    class="flex border-b border-gray-800/30 py-1 font-mono text-xs"
                                >
                                    <span
                                        class="w-1/3 text-gray-500 truncate pr-2"
                                        >{k}</span
                                    >
                                    <span class="w-2/3 text-green-400 break-all"
                                        >{v}</span
                                    >
                                </div>
                            {:else}
                                <div class="text-xs text-gray-600 italic">
                                    No environment variables.
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {:else if detailTab === "metrics"}
            <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
                <div class="flex items-center gap-2">
                    <h3 class="text-xs text-gray-400 uppercase tracking-widest font-bold">Metrics Dashboard</h3>
                    {#if metricsLoading}
                        <span class="animate-spin text-gray-500 text-xs">⟳</span>
                    {/if}
                </div>
                <select
                    bind:value={metricPeriod}
                    class="bg-gray-950 text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 shadow-inner"
                >
                    <option value={3600}>Last 1 hour</option>
                    <option value={86400}>Last 24 hours</option>
                    <option value={604800}>Last 7 days</option>
                </select>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-gray-900 p-4 rounded-lg border border-gray-800">
                    <MetricChart title="Invocations (Sum)" data={metricsData.invocations} loading={metricsLoading} />
                </div>
                <div class="bg-gray-900 p-4 rounded-lg border border-gray-800">
                    <MetricChart title="Errors (Sum)" data={metricsData.errors} loading={metricsLoading} />
                </div>
                <div class="bg-gray-900 p-4 rounded-lg border border-gray-800">
                    <MetricChart title="Duration (Avg ms)" data={metricsData.duration} loading={metricsLoading} />
                </div>
                <div class="bg-gray-900 p-4 rounded-lg border border-gray-800">
                    <MetricChart title="Throttles (Sum)" data={metricsData.throttles} loading={metricsLoading} />
                </div>
            </div>
        {:else if detailTab === "connections"}
            <div class="max-w-4xl">
                <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
                    <div class="flex items-center gap-2">
                        <h3 class="text-xs text-gray-400 uppercase tracking-widest font-bold">Service Connections</h3>
                        {#if connectionsLoading}
                            <span class="animate-spin text-gray-500 text-xs">⟳</span>
                        {/if}
                    </div>
                </div>
                {#if !connectionsLoading && connections.length === 0}
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500 text-sm">
                        No service connections or triggers found for this function.
                    </div>
                {:else}
                    <div class="grid grid-cols-1 gap-4">
                        {#each connections as conn}
                            <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-gray-700 transition">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="text-xs font-bold px-2 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/50">
                                            {conn.type}
                                        </span>
                                        {#if conn.description}
                                            <span class="text-[10px] text-gray-500 uppercase tracking-wider">{conn.description}</span>
                                        {/if}
                                    </div>
                                    <div class="text-sm text-gray-300 font-mono truncate" title={conn.arn}>
                                        {conn.arn}
                                    </div>
                                </div>
                                {#if conn.link}
                                    <a href={conn.link} class="shrink-0 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition border border-gray-700 shadow-sm whitespace-nowrap inline-flex items-center">
                                        View Resource
                                    </a>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
