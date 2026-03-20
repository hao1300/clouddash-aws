<script lang="ts">
    import { GetDistributionCommand } from "@aws-sdk/client-cloudfront";
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import MetricChart from "$lib/components/MetricChart.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";

    let distId = $derived($page.params.id || "");
    let dist = $state<any>(null);
    let loading = $state(false);
    let error = $state("");
    let metricsLoading = $state(false);
    let metricPeriod = $state(86400);
    let metricsData = $state({
        requests: [] as any[],
        bytesDownloaded: [] as any[],
        errorRate4xx: [] as any[],
        errorRate5xx: [] as any[],
    });

    $effect(() => {
        titleService.setResource(distId, undefined, $page.url.pathname);
    });

    $effect(() => {
        if (aws.cloudfront && distId) {
            loadDistribution();
        }
    });

    $effect(() => {
        if (aws.getCWClient("us-east-1") && distId) {
            loadMetrics();
        }
    });

    async function loadDistribution() {
        if (!aws.cloudfront || !distId) return;
        try {
            loading = true;
            error = "";
            const resp = await aws.cloudfront.send(
                new GetDistributionCommand({ Id: distId }),
            );
            const d = resp.Distribution;
            const cfg = d?.DistributionConfig;
            dist = {
                id: d?.Id ?? "",
                arn: d?.ARN ?? "",
                domain: d?.DomainName ?? "",
                status: d?.Status ?? "",
                enabled: cfg?.Enabled ?? false,
                aliases: cfg?.Aliases?.Items ?? [],
                comment: cfg?.Comment ?? "",
                priceClass: cfg?.PriceClass ?? "",
                httpVersion: cfg?.HttpVersion ?? "",
                origins: cfg?.Origins?.Items?.map((o) => o.DomainName ?? "") ?? [],
                defaultRootObject: cfg?.DefaultRootObject ?? "",
                lastModified: d?.LastModifiedTime,
            };
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function loadMetrics() {
        const cwClient = aws.getCWClient("us-east-1");
        if (!cwClient || !distId) return;
        try {
            metricsLoading = true;
            const end = new Date();
            const start = new Date(end.getTime() - metricPeriod * 1000);
            const period =
                metricPeriod <= 3600 ? 60 : metricPeriod <= 86400 ? 300 : 3600;

            const fetchMetric = async (metricName: string, stat: string) => {
                const resp = await cwClient.send(
                    new GetMetricStatisticsCommand({
                        Namespace: "AWS/CloudFront",
                        MetricName: metricName,
                        Dimensions: [
                            { Name: "DistributionId", Value: distId },
                            { Name: "Region", Value: "Global" },
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

            const [requests, bytesDownloaded, errorRate4xx, errorRate5xx] =
                await Promise.all([
                    fetchMetric("Requests", "Sum"),
                    fetchMetric("BytesDownloaded", "Sum"),
                    fetchMetric("4xxErrorRate", "Average"),
                    fetchMetric("5xxErrorRate", "Average"),
                ]);

            metricsData = { requests, bytesDownloaded, errorRate4xx, errorRate5xx };
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

<div class="h-full flex flex-col bg-gray-950 overflow-auto p-6 relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    {#if loading}
        <div
            class="flex-1 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest"
        >
            Loading Distribution...
        </div>
    {:else if dist}
        <div
            class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
        >
            <span class="text-sm font-bold text-gray-200 truncate flex-1"
                >{dist.id}
                <span class="text-gray-500 font-normal ml-2"
                    >{dist.domain}</span
                ></span
            >
        </div>

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
                    class="text-base font-bold {dist.enabled
                        ? 'text-green-400'
                        : 'text-red-400'}"
                >
                    {dist.status} ({dist.enabled ? "Enabled" : "Disabled"})
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
                    {dist.priceClass}
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
                    {dist.httpVersion}
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Origins
                </div>
                <div class="text-base font-bold text-gray-200">
                    {dist.origins.length}
                </div>
            </div>
        </div>

        {#if dist.aliases.length > 0}
            <div class="mb-6 shrink-0">
                <div
                    class="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold"
                >
                    Alternate Domain Names
                </div>
                <div class="flex flex-wrap gap-2">
                    {#each dist.aliases as alias}
                        <span
                            class="bg-gray-900 border border-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full"
                            >{alias}</span
                        >
                    {/each}
                </div>
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
                        Metrics Dashboard
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

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricChart
                    title="Requests (Sum)"
                    data={metricsData.requests}
                    formatValue={(v) => v.toLocaleString()}
                    yLabel="Requests"
                />
                <MetricChart
                    title="Bytes Downloaded (Sum)"
                    data={metricsData.bytesDownloaded}
                    formatValue={formatBytes}
                    yLabel="Bytes"
                />
                <MetricChart
                    title="4xx Error Rate (Avg)"
                    data={metricsData.errorRate4xx}
                    formatValue={(v) => v.toFixed(2) + "%"}
                    yLabel="%"
                />
                <MetricChart
                    title="5xx Error Rate (Avg)"
                    data={metricsData.errorRate5xx}
                    formatValue={(v) => v.toFixed(2) + "%"}
                    yLabel="%"
                />
            </div>
        </div>
    {/if}
</div>
