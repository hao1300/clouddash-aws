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

    let items = $state<any[]>([]);
    let nextMarker = $state<string | undefined>(undefined);
    let hasMore = $state(false);
    let loading = $state(false);
    let error = $state("");
    let cfClient: CloudFrontClient | null = null;
    let cwClient: CloudWatchClient | null = null;

    // Detail view
    let selectedDist = $state<any>(null);
    let distDetail = $state<any>(null);
    let detailLoading = $state(false);

    // Metrics
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

    async function load(append = false) {
        if (!cfClient) return;
        try {
            loading = true;
            error = "";
            const resp = await cfClient.send(
                new ListDistributionsCommand({
                    MaxItems: 50,
                    Marker: append ? nextMarker : undefined,
                }),
            );
            const list = resp.DistributionList;
            const newItems = (list?.Items ?? []).map((d) => ({
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
            items = append ? [...items, ...newItems] : newItems;
            hasMore = list?.IsTruncated ?? false;
            nextMarker = list?.NextMarker;
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
            const queries = metrics.map((m, i) => ({
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
            /* metrics may not be available for all dists */ metricsData = {};
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
</script>

{#if error}<div class="bg-red-500/20 text-red-300 p-2 rounded text-xs mb-2">
        {error}
    </div>{/if}

{#if selectedDist}
    <!-- Distribution Detail -->
    <div class="flex items-center gap-2 mb-3">
        <button
            onclick={() => {
                selectedDist = null;
                metricsData = null;
            }}
            class="text-xs text-blue-400 hover:underline"
            >← Distributions</button
        >
        <span class="font-mono text-sm text-gray-300">{selectedDist.id}</span>
    </div>

    <!-- Info Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        <div class="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
            <div class="text-xs text-gray-500 mb-1">Domain</div>
            <div class="text-sm text-gray-200 font-mono truncate">
                {selectedDist.domain}
            </div>
        </div>
        <div class="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
            <div class="text-xs text-gray-500 mb-1">Status</div>
            <div
                class="text-sm {selectedDist.enabled
                    ? 'text-green-400'
                    : 'text-red-400'}"
            >
                {selectedDist.status} ({selectedDist.enabled
                    ? "Enabled"
                    : "Disabled"})
            </div>
        </div>
        <div class="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
            <div class="text-xs text-gray-500 mb-1">Price Class</div>
            <div class="text-sm text-gray-200">{selectedDist.priceClass}</div>
        </div>
        <div class="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
            <div class="text-xs text-gray-500 mb-1">HTTP Version</div>
            <div class="text-sm text-gray-200">{selectedDist.httpVersion}</div>
        </div>
    </div>

    <!-- Aliases -->
    {#if selectedDist.aliases.length > 0}
        <div class="bg-gray-900 p-3 rounded-lg border border-gray-800 mb-3">
            <div class="text-xs text-gray-500 mb-2">
                Alternate Domain Names (CNAMEs)
            </div>
            <div class="flex flex-wrap gap-2">
                {#each selectedDist.aliases as alias}
                    <span
                        class="bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded text-xs font-mono"
                        >{alias}</span
                    >
                {/each}
            </div>
        </div>
    {/if}

    <!-- Origins -->
    {#if selectedDist.origins.length > 0}
        <div class="bg-gray-900 p-3 rounded-lg border border-gray-800 mb-3">
            <div class="text-xs text-gray-500 mb-2">Origins</div>
            {#each selectedDist.origins as origin}
                <div class="text-xs text-gray-300 font-mono">{origin}</div>
            {/each}
        </div>
    {/if}

    <!-- Metrics -->
    <div class="flex items-center gap-2 mb-2">
        <span class="text-xs text-gray-500">Metrics</span>
        <select
            bind:value={metricPeriod}
            onchange={() => loadMetrics(selectedDist.id)}
            class="bg-gray-900 text-xs p-1 rounded border border-gray-700 text-gray-300"
        >
            <option value={3600}>1 hour</option>
            <option value={14400}>4 hours</option>
            <option value={86400}>24 hours</option>
            <option value={604800}>7 days</option>
        </select>
    </div>
    {#if metricsLoading}
        <div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>
    {:else if metricsData}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div
                class="bg-gray-900 p-3 rounded-lg border border-gray-800 text-center"
            >
                <div class="text-xs text-gray-500">Requests</div>
                <div class="text-xl font-bold text-blue-400">
                    {formatNum(metricsData.requests?.total ?? 0)}
                </div>
            </div>
            <div
                class="bg-gray-900 p-3 rounded-lg border border-gray-800 text-center"
            >
                <div class="text-xs text-gray-500">Bytes Downloaded</div>
                <div class="text-xl font-bold text-green-400">
                    {formatBytes(metricsData.bytesdownloaded?.total ?? 0)}
                </div>
            </div>
            <div
                class="bg-gray-900 p-3 rounded-lg border border-gray-800 text-center"
            >
                <div class="text-xs text-gray-500">4xx Error Rate</div>
                <div class="text-xl font-bold text-yellow-400">
                    {(metricsData["4xxerrorrate"]?.avg ?? 0).toFixed(2)}%
                </div>
            </div>
            <div
                class="bg-gray-900 p-3 rounded-lg border border-gray-800 text-center"
            >
                <div class="text-xs text-gray-500">5xx Error Rate</div>
                <div class="text-xl font-bold text-red-400">
                    {(metricsData["5xxerrorrate"]?.avg ?? 0).toFixed(2)}%
                </div>
            </div>
        </div>
    {/if}
{:else}
    <!-- Distribution List -->
    <div class="grid grid-cols-1 gap-3">
        {#each items as d}
            <button
                onclick={() => viewDistribution(d)}
                class="bg-gray-900 p-3 rounded-lg border border-gray-800 text-left hover:border-blue-500/30 transition w-full"
            >
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center gap-2">
                        <span
                            class="font-mono text-xs text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded"
                            >{d.id}</span
                        >
                        <span
                            class="w-2 h-2 rounded-full {d.enabled
                                ? 'bg-green-500'
                                : 'bg-red-500'}"
                        ></span>
                    </div>
                    <span class="text-xs text-gray-500">{d.status}</span>
                </div>
                <div class="text-xs text-gray-300 font-mono mb-1">
                    {d.domain}
                </div>
                {#if d.aliases.length > 0}
                    <div class="flex flex-wrap gap-1 mt-1">
                        {#each d.aliases as alias}
                            <span
                                class="bg-blue-900/20 text-blue-400 px-1.5 py-0.5 rounded text-xs"
                                >{alias}</span
                            >
                        {/each}
                    </div>
                {/if}
                {#if d.comment}<div class="text-xs text-gray-600 mt-1 truncate">
                        {d.comment}
                    </div>{/if}
            </button>
        {/each}
        {#if !loading && items.length === 0}<div
                class="text-gray-600 text-center py-16 text-sm"
            >
                No CloudFront distributions found.
            </div>{/if}
    </div>
    {#if loading}<div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>{/if}
    {#if hasMore && !loading}<button
            onclick={() => load(true)}
            class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
            >Load More</button
        >{/if}
{/if}
