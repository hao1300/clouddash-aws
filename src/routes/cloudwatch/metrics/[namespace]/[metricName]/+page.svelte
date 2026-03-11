<script lang="ts">
    import { page } from "$app/stores";
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import { aws } from "$lib/services/aws.svelte";
    import { titleService } from "$lib/services/title.svelte";

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

        const points = chrono.map((_, i) => {
            const x = padX + ((ts[i] - minT) / rangeT) * (width - 2 * padX);
            const y = height - padY - ((vals[i] - minV) / rangeV) * (height - 2 * padY);
            return { x, y };
        });

        const path = `M ${points.map(p => `${p.x},${p.y}`).join(" L ")}`;

        return { path, points, width, height, minT, maxT };
    });

    $effect(() => {
        if (aws.cw && namespace && metricName) {
            loadMetricStats();
        }
    });

    $effect(() => {
        if (namespace && metricName) {
            titleService.setResource(`${namespace} > ${metricName}`);
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
                    Statistics: ["Average", "Sum", "Minimum", "Maximum", "SampleCount"],
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
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col p-4 bg-gray-950 text-white">
    {#if error}
        <div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">
            {error}
        </div>
    {/if}

    <div class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0">
        <span class="text-sm font-bold text-gray-200 truncate flex-1">
            {metricName}
            <span class="text-xs font-normal text-gray-500 ml-2">({namespace})</span>
        </span>
    </div>

    <div class="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
        <div class="p-6 bg-gray-900 rounded-lg border border-gray-800 shadow-sm overflow-hidden flex flex-col">
            <h3 class="text-xs font-bold text-gray-400 tracking-wide uppercase mb-4">Last 24 Hours Metrics</h3>

            {#if loading}
                <div class="h-40 flex items-center justify-center text-gray-400 text-sm animate-pulse">
                    <span class="animate-spin mr-2">⟳</span> Loading statistics...
                </div>
            {:else if metricStats.length === 0}
                <div class="h-40 flex items-center justify-center text-gray-500 text-sm italic">
                    No data points available for the last 24 hours.
                </div>
            {:else}
                {#if metricChartData}
                    <div class="relative w-full bg-gray-950 rounded-lg border border-gray-800/80 p-4 shadow-inner mb-6">
                        <svg viewBox="0 0 {metricChartData.width} {metricChartData.height}" class="w-full h-auto max-h-[180px]">
                            <path d={metricChartData.path} fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                            {#each metricChartData.points as p}
                                <circle cx={p.x} cy={p.y} r="2.5" fill="#60A5FA" />
                            {/each}
                        </svg>
                        <div class="flex justify-between mt-2 px-10 text-[10px] text-gray-500 font-mono">
                            <span>{new Date(metricChartData.minT).toLocaleTimeString()}</span>
                            <span>{new Date(metricChartData.maxT).toLocaleTimeString()}</span>
                        </div>
                    </div>
                {/if}

                <div class="flex-1 overflow-auto bg-gray-950/20 rounded shadow-inner">
                    <table class="w-full text-left text-sm whitespace-nowrap">
                        <thead class="sticky top-0 bg-gray-900 border-b border-gray-800 uppercase text-[10px] tracking-wider text-gray-400 font-semibold">
                            <tr>
                                <th class="px-3 py-2">Timestamp</th>
                                <th class="px-3 py-2 text-right">Average</th>
                                <th class="px-3 py-2 text-right">Maximum</th>
                                <th class="px-3 py-2 text-right">Minimum</th>
                                <th class="px-3 py-2 text-right">SampleCount</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800/30">
                            {#each metricStats as stat}
                                <tr class="hover:bg-gray-800/40 transition-colors">
                                    <td class="px-3 py-1.5 text-gray-400 font-mono text-xs">{stat.timestamp}</td>
                                    <td class="px-3 py-1.5 text-blue-300 font-mono text-xs text-right">{stat.average}</td>
                                    <td class="px-3 py-1.5 text-gray-400 font-mono text-xs text-right">{stat.max}</td>
                                    <td class="px-3 py-1.5 text-gray-400 font-mono text-xs text-right">{stat.min}</td>
                                    <td class="px-3 py-1.5 text-gray-500 font-mono text-xs text-right">{stat.count} <span class="text-[9px] text-gray-600 ml-0.5">{stat.unit}</span></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                <div class="mt-4 text-[10px] text-gray-500 font-mono truncate border-t border-gray-800 pt-3">
                    Dimensions: {displayDimensions || "None"}
                </div>
            {/if}
        </div>
    </div>
</div>
