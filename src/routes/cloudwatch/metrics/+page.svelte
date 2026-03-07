<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
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

    async function handleSelectMetric(m: any) {
        const dimensions = JSON.stringify(m.rawDimensions);
        const url = `/cloudwatch/metrics/detail?namespace=${encodeURIComponent(m.namespace)}&name=${encodeURIComponent(m.metricName)}&dimensions=${encodeURIComponent(dimensions)}`;
        goto(url);
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div class="flex-1 {error ? 'pt-8' : ''} flex flex-col overflow-hidden">
        <div class="h-full flex flex-col p-4 bg-gray-950 overflow-hidden">
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm flex items-center justify-between mb-4 shrink-0"
            >
                <div class="flex items-center gap-2 relative">
                    <input
                        type="text"
                        bind:value={metricSearchFilter}
                        placeholder="Search currently loaded metrics..."
                        class="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500 text-gray-200 w-80 shadow-inner pr-8"
                    />
                    {#if metricSearchFilter}
                        <button
                            onclick={() => (metricSearchFilter = "")}
                            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors bg-gray-900/50 rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                            title="Clear search"
                        >
                            ✕
                        </button>
                    {/if}
                </div>
                <div class="flex items-center gap-4">
                    <button
                        onclick={() => loadMetrics(popToken(metricsTokenMap))}
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
                                        expandedNamespace === ns ? null : ns)}
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
                                                handleSelectMetric(m)}
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
    </div>
</div>
