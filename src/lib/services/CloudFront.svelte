<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudFrontClient,
        ListDistributionsCommand,
        GetDistributionCommand,
    } from "@aws-sdk/client-cloudfront";
    import {
        CloudWatchClient,
        GetMetricDataCommand,
    } from "@aws-sdk/client-cloudwatch";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let cfClient: CloudFrontClient | null = null;
    let cwClient: CloudWatchClient | null = null;
    let error = $state("");
    let loading = $state(false);

    // --- Service Layout State ---
    const tabs = [{ id: "distributions", label: "Distributions" }];
    let activeTab = $state("distributions");

    // --- Pagination Shared Helpers ---
    function pushToken(history: string[], currentNextToken?: string) {
        if (!currentNextToken) return;
        if (history[history.length - 1] !== currentNextToken)
            history.push(currentNextToken);
    }
    function popToken(history: string[]) {
        history.pop();
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    // --- Distributions ---
    let items = $state<any[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    // --- Detail View ---
    let selectedDist = $state<any>(null);

    // --- Metrics ---
    let metricsData = $state<any>(null);
    let metricsLoading = $state(false);
    let metricPeriod = $state(3600); // 1 hour

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            const config = {
                region: "us-east-1", // CloudFront is global
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            };
            cfClient = new CloudFrontClient(config);
            cwClient = new CloudWatchClient(config);
            await load();
        } catch (e) {
            error = String(e);
        }
    });

    // --- Distributions API ---
    async function load(token?: string) {
        if (!cfClient) return;
        try {
            loading = true;
            error = "";
            const resp = await cfClient.send(
                new ListDistributionsCommand({ MaxItems: 50, Marker: token }),
            );
            const list = resp.DistributionList;
            items = (list?.Items ?? []).map((d) => ({
                id: d.Id ?? "",
                domain: d.DomainName ?? "",
                status: d.Status ?? "",
                enabled: d.Enabled ?? false,
                aliases: d.Aliases?.Items ?? [],
                comment: d.Comment ?? "",
                priceClass: d.PriceClass ?? "",
                httpVersion: d.HttpVersion ?? "",
                origins: d.Origins?.Items?.map((o) => o.DomainName ?? "") ?? [],
            }));
            pushToken(tokenMap, list?.NextMarker);
            currentToken = list?.NextMarker;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function viewDistribution(dist: any) {
        selectedDist = dist;
        metricsData = null;
        await loadMetrics(dist.id);
    }

    // --- Metrics API ---
    async function loadMetrics(distId: string) {
        if (!cwClient) return;
        try {
            metricsLoading = true;
            const now = new Date();
            const start = new Date(now.getTime() - metricPeriod * 1000);
            const period =
                metricPeriod <= 3600 ? 60 : metricPeriod <= 86400 ? 300 : 3600;

            const metrics = [
                "Requests",
                "BytesDownloaded",
                "4xxErrorRate",
                "5xxErrorRate",
            ];
            const queries = metrics.map((m) => ({
                Id: m.toLowerCase().replace(/[^a-z0-9]/g, ""),
                MetricStat: {
                    Metric: {
                        Namespace: "AWS/CloudFront",
                        MetricName: m,
                        Dimensions: [
                            { Name: "DistributionId", Value: distId },
                            { Name: "Region", Value: "Global" },
                        ],
                    },
                    Period: period,
                    Stat: m.includes("Rate") ? "Average" : "Sum",
                },
            }));

            const resp = await cwClient.send(
                new GetMetricDataCommand({
                    MetricDataQueries: queries,
                    StartTime: start,
                    EndTime: now,
                }),
            );

            const result: Record<string, any> = {};
            for (const r of resp.MetricDataResults ?? []) {
                const vals = r.Values ?? [];
                const total = vals.reduce((a, b) => a + b, 0);
                result[r.Id ?? ""] = {
                    values: vals,
                    timestamps: r.Timestamps ?? [],
                    total,
                    avg: vals.length ? total / vals.length : 0,
                    latest: vals[0] ?? 0,
                };
            }
            metricsData = result;
        } catch (e) {
            metricsData = {};
        } finally {
            metricsLoading = false;
        }
    }

    function formatNum(n: number) {
        if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
        if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
        return n.toFixed(0);
    }

    function formatBytes(b: number) {
        if (b === 0) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }

    const columns = [
        {
            key: "id",
            label: "ID",
            onClick: (item: any) => viewDistribution(item),
        },
        { key: "domain", label: "Domain Name" },
        {
            key: "enabled",
            label: "State",
            format: (v: boolean) => (v ? "🟢 Enabled" : "🔴 Disabled"),
        },
        { key: "status", label: "Status" },
        { key: "comment", label: "Comment", format: (v: string) => v || "-" },
    ];
</script>

<ServiceLayout title="CloudFront" {tabs} bind:activeTab>
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30 shadow"
        >
            {error}
        </div>{/if}

    <div class="h-full {error ? 'pt-8' : ''}">
        {#if selectedDist}
            <!-- Distribution Detail -->
            <div class="h-full flex flex-col p-4 bg-gray-950 overflow-auto">
                <div
                    class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
                >
                    <button
                        onclick={() => {
                            selectedDist = null;
                            metricsData = null;
                        }}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back to Distributions</button
                    >
                    <span
                        class="text-sm font-bold text-gray-200 truncate flex-1"
                        >{selectedDist.id}
                        <span class="text-gray-500 font-normal ml-2"
                            >{selectedDist.domain}</span
                        ></span
                    >
                </div>

                <!-- Info Cards -->
                <div
                    class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 shrink-0"
                >
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Status
                        </div>
                        <div
                            class="text-base font-bold {selectedDist.enabled
                                ? 'text-green-400'
                                : 'text-red-400'}"
                        >
                            {selectedDist.status} ({selectedDist.enabled
                                ? "Enabled"
                                : "Disabled"})
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Price Class
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedDist.priceClass}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            HTTP Version
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedDist.httpVersion}
                        </div>
                    </div>
                    <div
                        class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <div
                            class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                        >
                            Origins Count
                        </div>
                        <div class="text-base font-bold text-gray-200">
                            {selectedDist.origins.length}
                        </div>
                    </div>
                </div>

                <!-- Aliases & Origins -->
                <div
                    class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 shrink-0"
                >
                    {#if selectedDist.aliases.length > 0}
                        <div
                            class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                        >
                            <h3
                                class="text-xs text-gray-400 uppercase tracking-widest font-bold mb-3 border-b border-gray-800 pb-2"
                            >
                                Alternate Domain Names (CNAMEs)
                            </h3>
                            <div class="flex flex-wrap gap-2">
                                {#each selectedDist.aliases as alias}
                                    <span
                                        class="bg-blue-900/30 text-blue-300 px-2.5 py-1 rounded text-xs font-mono border border-blue-800/50"
                                        >{alias}</span
                                    >
                                {/each}
                            </div>
                        </div>
                    {/if}

                    {#if selectedDist.origins.length > 0}
                        <div
                            class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                        >
                            <h3
                                class="text-xs text-gray-400 uppercase tracking-widest font-bold mb-3 border-b border-gray-800 pb-2"
                            >
                                Origins
                            </h3>
                            <div class="space-y-1">
                                {#each selectedDist.origins as origin}
                                    <div
                                        class="text-xs text-gray-300 font-mono flex items-center gap-2"
                                    >
                                        <span class="text-gray-600">↳</span>
                                        {origin}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Metrics -->
                <div
                    class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm shrink-0 mb-4"
                >
                    <div
                        class="flex items-center justify-between mb-4 border-b border-gray-800 pb-3"
                    >
                        <h3
                            class="text-xs text-gray-400 uppercase tracking-widest font-bold"
                        >
                            Metrics Dashboard
                        </h3>
                        <select
                            bind:value={metricPeriod}
                            onchange={() => loadMetrics(selectedDist.id)}
                            class="bg-gray-950 text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 shadow-inner"
                        >
                            <option value={3600}>Last 1 hour</option>
                            <option value={14400}>Last 4 hours</option>
                            <option value={86400}>Last 24 hours</option>
                            <option value={604800}>Last 7 days</option>
                        </select>
                    </div>

                    {#if metricsLoading}
                        <div class="flex justify-center py-8 text-gray-500">
                            <span class="animate-spin text-2xl mr-3">⟳</span> Fetching
                            metrics...
                        </div>
                    {:else if metricsData}
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div
                                class="bg-gray-950 p-4 rounded border border-gray-800/50 text-center"
                            >
                                <div
                                    class="text-xs text-gray-500 uppercase font-semibold mb-1 tracking-wider"
                                >
                                    Requests
                                </div>
                                <div class="text-2xl font-bold text-blue-400">
                                    {formatNum(
                                        metricsData.requests?.total ?? 0,
                                    )}
                                </div>
                            </div>
                            <div
                                class="bg-gray-950 p-4 rounded border border-gray-800/50 text-center"
                            >
                                <div
                                    class="text-xs text-gray-500 uppercase font-semibold mb-1 tracking-wider"
                                >
                                    Bytes Downloaded
                                </div>
                                <div class="text-2xl font-bold text-green-400">
                                    {formatBytes(
                                        metricsData.bytesdownloaded?.total ?? 0,
                                    )}
                                </div>
                            </div>
                            <div
                                class="bg-gray-950 p-4 rounded border border-gray-800/50 text-center"
                            >
                                <div
                                    class="text-xs text-gray-500 uppercase font-semibold mb-1 tracking-wider"
                                >
                                    4xx Error Rate
                                </div>
                                <div class="text-2xl font-bold text-yellow-500">
                                    {(
                                        metricsData["4xxerrorrate"]?.avg ?? 0
                                    ).toFixed(2)}%
                                </div>
                            </div>
                            <div
                                class="bg-gray-950 p-4 rounded border border-gray-800/50 text-center"
                            >
                                <div
                                    class="text-xs text-gray-500 uppercase font-semibold mb-1 tracking-wider"
                                >
                                    5xx Error Rate
                                </div>
                                <div class="text-2xl font-bold text-red-500">
                                    {(
                                        metricsData["5xxerrorrate"]?.avg ?? 0
                                    ).toFixed(2)}%
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        {:else}
            <!-- Distribution List -->
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
            />
        {/if}
    </div>
</ServiceLayout>
