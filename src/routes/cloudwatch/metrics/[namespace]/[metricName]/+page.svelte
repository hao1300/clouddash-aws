<script lang="ts">
    import { page } from "$app/stores";
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import { aws } from "$lib/services/aws.svelte";
    import { titleService } from "$lib/services/title.svelte";
    import DetailLayout from "$lib/components/DetailLayout.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";
    import MetricChart from "$lib/components/MetricChart.svelte";

    let namespace = $derived($page.params.namespace || "");
    let metricName = $derived($page.params.metricName || "");
    let dimensionsStr = $derived(
        $page.url.searchParams.get("dimensions") || "",
    );

    let error = $state("");
    let metricStats = $state<any[]>([]);
    let loading = $state(false);

    let rawDimensions = $derived.by(() => {
        if (!dimensionsStr) return [];
        try {
            return JSON.parse(dimensionsStr);
        } catch {
            return dimensionsStr
                .split(",")
                .map((part) => {
                    const [Name, Value] = part.trim().split("=");
                    return { Name, Value };
                })
                .filter((d) => d.Name && d.Value);
        }
    });

    let displayDimensions = $derived(
        rawDimensions.map((d: any) => `${d.Name}=${d.Value}`).join(", "),
    );

    $effect(() => {
        if (aws.cw && namespace && metricName) {
            loadMetricStats();
        }
    });

    $effect(() => {
        if (namespace && metricName) {
            titleService.setResource(
                metricName,
                `/cloudwatch/metrics/${encodeURIComponent(namespace)}`,
                $page.url.pathname,
            );
        }
    });

    async function loadMetricStats() {
        if (!aws.cw) return;
        try {
            loading = true;
            error = "";
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

            const resp = await aws.cw.send(
                new GetMetricStatisticsCommand({
                    Namespace: namespace,
                    MetricName: metricName,
                    Dimensions: rawDimensions,
                    StartTime: startTime,
                    EndTime: endTime,
                    Period: 3600,
                    Statistics: [
                        "Average",
                        "Sum",
                        "Minimum",
                        "Maximum",
                        "SampleCount",
                    ],
                }),
            );

            metricStats = (resp.Datapoints ?? [])
                .map((dp) => ({
                    timestamp: dp.Timestamp?.toLocaleString() ?? "",
                    average: dp.Average?.toFixed(2) ?? "-",
                    sum: dp.Sum?.toFixed(2) ?? "-",
                    min: dp.Minimum?.toFixed(2) ?? "-",
                    max: dp.Maximum?.toFixed(2) ?? "-",
                    count: dp.SampleCount ?? "-",
                    unit: dp.Unit ?? "",
                    rawTimestamp: dp.Timestamp,
                    rawAverage: dp.Average ?? dp.Sum ?? dp.Maximum ?? 0,
                }))
                .sort(
                    (a, b) =>
                        new Date(b.timestamp).getTime() -
                        new Date(a.timestamp).getTime(),
                );
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }
</script>

<DetailLayout title="" {error}>
    {#snippet mainSnippet()}
        <div class="flex flex-col gap-6">
            <!-- Namespace and Dimensions Header -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoCard 
                    label="Namespace" 
                    value={namespace} 
                    href="/cloudwatch/metrics/{encodeURIComponent(namespace)}"
                />
                <InfoCard label="Dimensions">
                    {#snippet children()}
                        <div class="flex flex-wrap gap-2">
                            {#each rawDimensions as d}
                                <div class="bg-gray-950/60 px-2 py-1 rounded border border-gray-800/50 text-[11px] font-mono text-gray-300 hover:border-gray-700 transition-colors">
                                    <span class="text-gray-500 text-[10px]">{d.Name}:</span> {d.Value}
                                </div>
                            {/each}
                            {#if rawDimensions.length === 0}
                                <span class="text-xs text-gray-600 italic">None</span>
                            {/if}
                        </div>
                    {/snippet}
                </InfoCard>
            </div>

            <!-- Chart Section -->
            <div class="p-6 bg-gray-900 rounded-lg border border-gray-800 shadow-sm overflow-hidden flex flex-col">
                <MetricChart 
                    title="Last 24 Hours Metrics"
                    data={metricStats}
                    loading={loading}
                    yLabel={metricStats.length > 0 ? metricStats[0].unit : ""}
                />
            </div>
        </div>
    {/snippet}

    {#snippet sidebarSnippet()}
        <div class="bg-gray-900 rounded-lg border border-gray-800 flex flex-col h-full overflow-hidden shadow-sm">
            <div class="p-4 border-b border-gray-800 bg-gray-900/50 shrink-0">
                <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest">Statistics List</h3>
            </div>

            <div class="flex-1 overflow-auto bg-gray-950/20">
                {#if loading && metricStats.length === 0}
                    <div class="p-8 text-center text-gray-600 animate-pulse text-xs italic">
                        Fetching datapoints...
                    </div>
                {:else if metricStats.length === 0}
                    <div class="p-8 text-center text-gray-700 text-xs italic">
                        No statistics available.
                    </div>
                {:else}
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-[11px] whitespace-nowrap">
                            <thead class="sticky top-0 bg-gray-900 border-b border-gray-800 uppercase text-[9px] tracking-tight text-gray-500 font-bold">
                                <tr>
                                    <th class="px-3 py-2">Time</th>
                                    <th class="px-3 py-2 text-right">Avg</th>
                                    <th class="px-3 py-2 text-right">Max</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-800/20 font-mono">
                                {#each metricStats as stat}
                                    <tr class="hover:bg-gray-800/30 transition-colors">
                                        <td class="px-3 py-2 text-gray-500 font-sans">{stat.timestamp.split(', ')[1]}</td>
                                        <td class="px-3 py-2 text-blue-400 text-right font-bold">{stat.average}</td>
                                        <td class="px-3 py-2 text-gray-400 text-right">{stat.max}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    <div class="p-3 bg-gray-900/40 border-t border-gray-800 shrink-0">
                        <div class="text-[9px] text-gray-600 italic">
                            Showing last {metricStats.length} data points.
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/snippet}
</DetailLayout>
