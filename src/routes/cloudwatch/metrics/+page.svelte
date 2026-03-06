<script lang="ts">
    import { page } from "$app/stores";
    import {
        ListMetricsCommand,
        GetMetricStatisticsCommand,
    } from "@aws-sdk/client-cloudwatch";
    import { pushToken, popToken } from "$lib/utils/pagination";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let metricSearchFilter = $state($page.url.searchParams.get("filter") || "");
    let error = $state("");
    let actionMsg = $state("");

    let metrics = $state<any[]>([]);
    let metricsLoading = $state(false);
    let metricsTokenMap = $state<string[]>([]);
    let metricsCurrentToken = $state<string | undefined>(undefined);
    let selectedMetric = $state<any>(null);
    let metricStats = $state<any[]>([]);
    let metricStatsLoading = $state(false);
    let expandedNamespace = $state<string | null>(null);

    // Sync filter from URL if it changes (e.g. navigating from Alarms)
    $effect(() => {
        const urlFilter = $page.url.searchParams.get("filter") || "";
        if (urlFilter !== metricSearchFilter) {
            metricSearchFilter = urlFilter;
        }
    });

    let metricsByNamespace = $derived.by(() => {
        const grouped: Record<string, any[]> = {};
        const term = metricSearchFilter.trim().toLowerCase();

        for (const m of metrics) {
            if (term) {
                if (
                    !m.metricName.toLowerCase().includes(term) &&
                    !m.namespace.toLowerCase().includes(term) &&
                    !m.dimensions.toLowerCase().includes(term)
                ) {
                    continue;
                }
            }
            if (!grouped[m.namespace]) {
                grouped[m.namespace] = [];
            }
            grouped[m.namespace].push(m);
        }
        return grouped;
    });

    let metricChartData = $derived.by(() => {
        if (!metricStats || metricStats.length < 2) return null;
        const width = 800;
        const height = 150;
        const padX = 40;
        const padY = 20;

        const chrono = [...metricStats].reverse();
        const ts = chrono.map((d) => d.rawTimestamp?.getTime() || 0);
        const vals = chrono.map((d) => Number(d.rawAverage) || 0);

        const minT = Math.min(...ts);
        const maxT = Math.max(...ts);
        const minV = Math.min(0, ...vals);
        let maxV = Math.max(...vals);
        if (maxV === minV) maxV = minV + 1;

        const rangeT = maxT - minT || 1;
        const rangeV = maxV - minV || 1;

        const points = chrono.map((d, i) => {
            const x = padX + ((ts[i] - minT) / rangeT) * (width - 2 * padX);
            const y =
                height -
                padY -
                ((vals[i] - minV) / rangeV) * (height - 2 * padY);
            return `${x},${y}`;
        });

        const path = `M ${points.join(" L ")}`;

        return {
            path,
            minV,
            maxV,
            width,
            height,
            padX,
            padY,
            chrono,
            minT,
            maxT,
        };
    });

    $effect(() => {
        if (aws.cw && metrics.length === 0) {
            loadMetrics();
        }
    });

    // If we have a filter from URL, and we just loaded metrics, auto-expand the namespace if there's only one
    $effect(() => {
        if (
            !expandedNamespace &&
            metricSearchFilter &&
            Object.keys(metricsByNamespace).length === 1
        ) {
            expandedNamespace = Object.keys(metricsByNamespace)[0];
        }
    });

    async function loadMetrics(token?: string) {
        if (!aws.cw) return;
        try {
            metricsLoading = true;
            error = "";
            actionMsg = "";
            const params: any = { NextToken: token };
            const resp = await aws.cw.send(new ListMetricsCommand(params));
            let fetchedMetrics = (resp.Metrics ?? []).map((m) => ({
                namespace: m.Namespace ?? "",
                metricName: m.MetricName ?? "",
                dimensions: (m.Dimensions ?? [])
                    .map((d) => `${d.Name}=${d.Value}`)
                    .join(", "),
                rawDimensions: m.Dimensions ?? [],
            }));

            fetchedMetrics.sort((a, b) => {
                const nsCompare = a.namespace.localeCompare(b.namespace);
                if (nsCompare !== 0) return nsCompare;
                return a.metricName.localeCompare(b.metricName);
            });
            metrics = fetchedMetrics;
            pushToken(metricsTokenMap, resp.NextToken);
            metricsCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            metricsLoading = false;
        }
    }

    async function loadMetricStats(metric: any) {
        if (!aws.cw) return;
        try {
            selectedMetric = metric;
            metricStatsLoading = true;
            error = "";
            actionMsg = "";

            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

            const resp = await aws.cw.send(
                new GetMetricStatisticsCommand({
                    Namespace: metric.namespace,
                    MetricName: metric.metricName,
                    Dimensions: metric.rawDimensions,
                    StartTime: startTime,
                    EndTime: endTime,
                    Period: 3600, // 1 hour periods
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
            metricStatsLoading = false;
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div class="flex-1 {error ? 'pt-8' : ''} flex flex-col overflow-hidden">
        {#if selectedMetric}
            <div class="h-full flex flex-col p-4 bg-gray-950">
                <div
                    class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
                >
                    <button
                        onclick={() => {
                            selectedMetric = null;
                            metricStats = [];
                        }}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back</button
                    >
                    <span
                        class="text-sm font-bold text-gray-200 truncate flex-1"
                        >{selectedMetric.metricName}
                        <span class="text-xs font-normal text-gray-500 ml-2"
                            >({selectedMetric.namespace})</span
                        ></span
                    >
                </div>

                <div class="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
                    <div
                        class="p-6 bg-gray-900 rounded-lg border border-gray-800 shadow-sm overflow-hidden flex flex-col"
                    >
                        <h3
                            class="text-xs font-bold text-gray-400 tracking-wide uppercase mb-4"
                        >
                            Last 24 Hours Metrics
                        </h3>

                        {#if metricStatsLoading}
                            <div
                                class="h-40 flex items-center justify-center text-gray-400 text-sm animate-pulse"
                            >
                                <span class="animate-spin mr-2">⟳</span> Loading
                                statistics...
                            </div>
                        {:else if metricStats.length === 0}
                            <div
                                class="h-40 flex items-center justify-center text-gray-500 text-sm italic"
                            >
                                No data points available for the last 24 hours.
                            </div>
                        {:else}
                            {#if metricChartData}
                                <div
                                    class="relative w-full bg-gray-950 rounded-lg border border-gray-800/80 p-4 shadow-inner mb-6"
                                >
                                    <svg
                                        viewBox="0 0 {metricChartData.width} {metricChartData.height}"
                                        class="w-full h-auto max-h-[180px]"
                                    >
                                        <path
                                            d={metricChartData.path}
                                            fill="none"
                                            stroke="#3B82F6"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        />
                                        {#each metricChartData.path.split(" L ") as pt, i}
                                            <circle
                                                cx={i === 0
                                                    ? pt
                                                          .substring(2)
                                                          .split(",")[0]
                                                    : pt.split(",")[0]}
                                                cy={i === 0
                                                    ? pt
                                                          .substring(2)
                                                          .split(",")[1]
                                                    : pt.split(",")[1]}
                                                r="2.5"
                                                fill="#60A5FA"
                                            />
                                        {/each}
                                    </svg>
                                    <div
                                        class="flex justify-between mt-2 px-10 text-[10px] text-gray-500 font-mono"
                                    >
                                        <span
                                            >{new Date(
                                                metricChartData.minT,
                                            ).toLocaleTimeString()}</span
                                        >
                                        <span
                                            >{new Date(
                                                metricChartData.maxT,
                                            ).toLocaleTimeString()}</span
                                        >
                                    </div>
                                </div>
                            {/if}

                            <div
                                class="flex-1 overflow-auto bg-gray-950/20 rounded shadow-inner"
                            >
                                <table
                                    class="w-full text-left text-sm whitespace-nowrap"
                                >
                                    <thead
                                        class="sticky top-0 bg-gray-900 border-b border-gray-800 uppercase text-[10px] tracking-wider text-gray-400 font-semibold"
                                    >
                                        <tr>
                                            <th class="px-3 py-2">Timestamp</th>
                                            <th class="px-3 py-2 text-right"
                                                >Average</th
                                            >
                                            <th class="px-3 py-2 text-right"
                                                >Maximum</th
                                            >
                                            <th class="px-3 py-2 text-right"
                                                >Minimum</th
                                            >
                                            <th class="px-3 py-2 text-right"
                                                >SampleCount</th
                                            >
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-800/30">
                                        {#each metricStats as stat}
                                            <tr
                                                class="hover:bg-gray-800/40 transition-colors"
                                            >
                                                <td
                                                    class="px-3 py-1.5 text-gray-400 font-mono text-xs"
                                                    >{stat.timestamp}</td
                                                >
                                                <td
                                                    class="px-3 py-1.5 text-blue-300 font-mono text-xs text-right"
                                                    >{stat.average}</td
                                                >
                                                <td
                                                    class="px-3 py-1.5 text-gray-400 font-mono text-xs text-right"
                                                    >{stat.max}</td
                                                >
                                                <td
                                                    class="px-3 py-1.5 text-gray-400 font-mono text-xs text-right"
                                                    >{stat.min}</td
                                                >
                                                <td
                                                    class="px-3 py-1.5 text-gray-500 font-mono text-xs text-right"
                                                >
                                                    {stat.count}
                                                    <span
                                                        class="text-[9px] text-gray-600 ml-0.5"
                                                        >{stat.unit}</span
                                                    >
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {:else}
            <div class="h-full flex flex-col p-4 bg-gray-950 overflow-hidden">
                <div
                    class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm flex items-center justify-between mb-4 shrink-0"
                >
                    <div class="flex items-center gap-2">
                        <input
                            type="text"
                            bind:value={metricSearchFilter}
                            placeholder="Search currently loaded metrics..."
                            class="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500 text-gray-200 w-80 shadow-inner"
                        />
                    </div>
                    <div class="flex items-center gap-4">
                        <button
                            onclick={() =>
                                loadMetrics(popToken(metricsTokenMap))}
                            disabled={metricsTokenMap.length === 0 ||
                                metricsLoading}
                            class="text-xs font-bold text-gray-400 hover:text-gray-200 transition disabled:opacity-30"
                            >← Previous Page</button
                        >
                        <button
                            onclick={() => loadMetrics(metricsCurrentToken)}
                            disabled={!metricsCurrentToken || metricsLoading}
                            class="text-xs font-bold text-blue-400 hover:text-blue-300 transition disabled:opacity-30"
                            >Next Page →</button
                        >
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto space-y-4 pr-1">
                    {#if metricsLoading}
                        <div
                            class="h-40 flex items-center justify-center text-gray-400 text-sm animate-pulse"
                        >
                            <span class="animate-spin mr-2">⟳</span> Loading metrics...
                        </div>
                    {:else if metrics.length === 0}
                        <div
                            class="h-40 flex items-center justify-center text-gray-500 text-sm italic"
                        >
                            No metrics found.
                        </div>
                    {:else}
                        {#each Object.entries(metricsByNamespace) as [ns, mets]}
                            <div
                                class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm"
                            >
                                <button
                                    class="w-full px-4 py-3 bg-gray-800/40 hover:bg-gray-800/60 flex justify-between items-center transition-colors border-b border-gray-800/0"
                                    class:border-b-gray-800={expandedNamespace ===
                                        ns}
                                    onclick={() =>
                                        (expandedNamespace =
                                            expandedNamespace === ns
                                                ? null
                                                : ns)}
                                >
                                    <div class="flex items-center gap-3">
                                        <span
                                            class="font-bold text-gray-200 text-sm"
                                            >{ns}</span
                                        >
                                        <span
                                            class="text-[10px] text-gray-500 bg-gray-950 px-2 py-0.5 rounded-full border border-gray-800"
                                            >{mets.length} metrics</span
                                        >
                                    </div>
                                    <span
                                        class="text-gray-400 text-xs transition-transform {expandedNamespace ===
                                        ns
                                            ? 'rotate-180'
                                            : ''}">▼</span
                                    >
                                </button>

                                {#if expandedNamespace === ns}
                                    <div
                                        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 p-2 bg-gray-950/20"
                                    >
                                        {#each mets as m}
                                            <button
                                                onclick={() =>
                                                    loadMetricStats(m)}
                                                class="px-4 py-3 bg-gray-900/40 hover:bg-gray-800/60 rounded border border-gray-800/50 hover:border-blue-900/30 text-left group transition shadow-sm"
                                            >
                                                <div
                                                    class="text-xs font-bold text-gray-300 group-hover:text-blue-400 transition-colors truncate"
                                                >
                                                    {m.metricName}
                                                </div>
                                                <div
                                                    class="text-[10px] text-gray-500 truncate mt-1 font-mono"
                                                    title={m.dimensions}
                                                >
                                                    {m.dimensions ||
                                                        "No dimensions"}
                                                </div>
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>
