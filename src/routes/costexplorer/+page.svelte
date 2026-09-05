<script lang="ts">
    import {
        GetCostAndUsageCommand,
        GetCostForecastCommand,
        type Expression,
        type GetCostAndUsageCommandOutput,
        type ResultByTime,
    } from "@aws-sdk/client-cost-explorer";
    import { page } from "$app/stores";
    import { aws } from "$lib/services/aws.svelte";
    import { titleService } from "$lib/services/title.svelte";
    import CostChart from "$lib/components/CostChart.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";
    import Select from "$lib/components/Select.svelte";
    import {
        COST_RANGE_PRESETS,
        addCostDays,
        buildCostBreakdown,
        collapseToTopSeries,
        formatCostAmount,
        mergeCostPages,
        percentOfTotal,
        resolveCostRange,
        toCostDate,
        type CostBreakdown,
        type CostDateRange,
        type CostGranularity,
    } from "$lib/utils/cost-explorer";
    import {
        mdiCurrencyUsd,
        mdiMagnify,
        mdiClose,
        mdiRefresh,
        mdiAlertCircleOutline,
    } from "@mdi/js";

    const OTHER_LABEL = "Other";
    const CHART_SERIES_LIMIT = 10;
    const VIEW_STORAGE_KEY = "aws-console:costexplorer:view";
    // GetCostAndUsage splits large group sets across pages; cap the walk so a
    // wide grouping can't fan out into dozens of billed requests.
    const MAX_PAGES = 5;

    const GROUP_OPTIONS = [
        { value: "", label: "No Grouping" },
        { value: "SERVICE", label: "Service" },
        { value: "LINKED_ACCOUNT", label: "Linked Account" },
        { value: "USAGE_TYPE", label: "Usage Type" },
        { value: "INSTANCE_TYPE", label: "Instance Type" },
        { value: "OPERATION", label: "Operation" },
        { value: "RECORD_TYPE", label: "Charge Type" },
        { value: "PURCHASE_TYPE", label: "Purchase Type" },
        { value: "AZ", label: "Availability Zone" },
        { value: "PLATFORM", label: "Platform" },
        { value: "TENANCY", label: "Tenancy" },
        { value: "LEGAL_ENTITY_NAME", label: "Legal Entity" },
    ];

    const METRIC_OPTIONS = [
        { value: "UnblendedCost", label: "Unblended Cost" },
        { value: "AmortizedCost", label: "Amortized Cost" },
        { value: "BlendedCost", label: "Blended Cost" },
        { value: "NetUnblendedCost", label: "Net Unblended Cost" },
        { value: "NetAmortizedCost", label: "Net Amortized Cost" },
        { value: "UsageQuantity", label: "Usage Quantity" },
    ];

    const GRANULARITY_OPTIONS = [
        { value: "DAILY", label: "Daily" },
        { value: "MONTHLY", label: "Monthly" },
    ];

    interface SavedView {
        preset?: string;
        granularity?: CostGranularity;
        groupDimension?: string;
        metric?: string;
        excludeCredits?: boolean;
        customStart?: string;
        customEnd?: string;
    }

    /**
     * Switching profile or region remounts this route, which would otherwise
     * drop the toolbar selections back to their defaults — so they are kept in
     * localStorage and read back while the state is initialized, before the
     * first query runs. Values are checked against the options above: a stale
     * entry must never reach the API as an unknown dimension or metric.
     */
    function readSavedView(): SavedView {
        if (typeof localStorage === "undefined") return {};
        try {
            const saved = JSON.parse(
                localStorage.getItem(VIEW_STORAGE_KEY) || "{}",
            );
            const isCostDate = (value: unknown) =>
                typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
            return {
                preset: COST_RANGE_PRESETS.some(
                    (item) => item.id === saved.preset,
                )
                    ? saved.preset
                    : undefined,
                granularity:
                    saved.granularity === "DAILY" ||
                    saved.granularity === "MONTHLY"
                        ? saved.granularity
                        : undefined,
                groupDimension: GROUP_OPTIONS.some(
                    (option) => option.value === saved.groupDimension,
                )
                    ? saved.groupDimension
                    : undefined,
                metric: METRIC_OPTIONS.some(
                    (option) => option.value === saved.metric,
                )
                    ? saved.metric
                    : undefined,
                excludeCredits:
                    typeof saved.excludeCredits === "boolean"
                        ? saved.excludeCredits
                        : undefined,
                customStart: isCostDate(saved.customStart)
                    ? saved.customStart
                    : undefined,
                customEnd: isCostDate(saved.customEnd)
                    ? saved.customEnd
                    : undefined,
            };
        } catch {
            return {};
        }
    }

    const savedView = readSavedView();

    let preset = $state(savedView.preset ?? "30d");
    let granularity = $state<CostGranularity>(savedView.granularity ?? "DAILY");
    let groupDimension = $state(savedView.groupDimension ?? "SERVICE");
    let metric = $state(savedView.metric ?? "UnblendedCost");
    let excludeCredits = $state(savedView.excludeCredits ?? true);
    let customStart = $state(
        savedView.customStart ?? addCostDays(toCostDate(new Date()), -30),
    );
    let customEnd = $state(savedView.customEnd ?? toCostDate(new Date()));
    let refreshKey = $state(0);

    let breakdown = $state<CostBreakdown | null>(null);
    let loading = $state(false);
    let error = $state("");
    let filterText = $state("");

    let forecast = $state<{ amount: number; unit: string } | null>(null);
    let forecastNote = $state("");

    let groupLabel = $derived(
        GROUP_OPTIONS.find((option) => option.value === groupDimension)?.label ??
            "Group",
    );

    // `customEnd` is inclusive in the picker, but Cost Explorer's end is not.
    let range: CostDateRange = $derived(
        preset === "custom"
            ? { start: customStart, end: addCostDays(customEnd, 1) }
            : resolveCostRange(preset, new Date()),
    );
    let rangeInvalid = $derived(
        preset === "custom" && (!customStart || !customEnd || customStart > customEnd),
    );

    let query = $derived({
        start: range.start,
        end: range.end,
        granularity,
        groupDimension,
        metric,
        excludeCredits,
        invalid: rangeInvalid,
        refreshKey,
    });

    let unit = $derived(breakdown?.unit || "");
    let chartSeries = $derived(
        breakdown
            ? collapseToTopSeries(
                  breakdown.series,
                  CHART_SERIES_LIMIT,
                  OTHER_LABEL,
              )
            : [],
    );
    let tableRows = $derived.by(() => {
        if (!breakdown) return [];
        const lower = filterText.trim().toLowerCase();
        return breakdown.series
            .filter((item) => !lower || item.key.toLowerCase().includes(lower))
            .map((item) => ({
                key: item.key,
                total: item.total,
                share: percentOfTotal(item.total, breakdown!.total),
            }));
    });
    let periodCount = $derived(breakdown?.periods.length ?? 0);
    let averagePerPeriod = $derived(
        periodCount ? (breakdown?.total ?? 0) / periodCount : 0,
    );
    let peakPeriod = $derived.by(() => {
        if (!breakdown || !breakdown.periods.length) return null;
        let bestIndex = 0;
        breakdown.periodTotals.forEach((value, index) => {
            if (value > breakdown!.periodTotals[bestIndex]) bestIndex = index;
        });
        return {
            label: breakdown.periods[bestIndex]?.label ?? "",
            amount: breakdown.periodTotals[bestIndex] ?? 0,
        };
    });
    let hasEstimates = $derived(
        !!breakdown?.periods.some((period) => period.estimated),
    );

    $effect(() => {
        titleService.setResource("", undefined, $page.url.pathname);
    });

    $effect(() => {
        const view: SavedView = {
            preset,
            granularity,
            groupDimension,
            metric,
            excludeCredits,
            customStart,
            customEnd,
        };
        try {
            localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
        } catch {
            // A full or unavailable store only costs the remembered view.
        }
    });

    $effect(() => {
        const current = query;
        if (!aws.costExplorer || current.invalid) return;
        loadCosts(current);
    });

    // The forecast is a separate billed request, so it only follows the inputs
    // that change its answer — not the range, granularity or grouping.
    $effect(() => {
        const currentMetric = metric;
        const currentExcludeCredits = excludeCredits;
        void refreshKey;
        if (!aws.costExplorer) return;
        loadForecast(currentMetric, currentExcludeCredits);
    });

    function onPresetChange(value: string) {
        const selected = COST_RANGE_PRESETS.find((item) => item.id === value);
        if (selected && value !== "custom") granularity = selected.granularity;
    }

    /** `UnblendedCost` -> `UNBLENDED_COST`, the casing the forecast API wants. */
    function toForecastMetric(value: string): string {
        return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
    }

    function buildFilter(exclude: boolean): Expression | undefined {
        if (!exclude) return undefined;
        return {
            Not: {
                Dimensions: {
                    Key: "RECORD_TYPE",
                    Values: ["Credit", "Refund"],
                },
            },
        };
    }

    async function loadCosts(current: typeof query) {
        const client = aws.costExplorer;
        if (!client) return;

        loading = true;
        error = "";
        try {
            let results: ResultByTime[] = [];
            let nextPageToken: string | undefined = undefined;

            for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
                const res: GetCostAndUsageCommandOutput = await client.send(
                    new GetCostAndUsageCommand({
                        TimePeriod: { Start: current.start, End: current.end },
                        Granularity: current.granularity,
                        Metrics: [current.metric],
                        GroupBy: current.groupDimension
                            ? [{ Type: "DIMENSION", Key: current.groupDimension }]
                            : undefined,
                        Filter: buildFilter(current.excludeCredits),
                        NextPageToken: nextPageToken,
                    }),
                );
                results = mergeCostPages(results, res.ResultsByTime);
                nextPageToken = res.NextPageToken;
                if (!nextPageToken) break;
            }

            breakdown = buildCostBreakdown(
                results,
                current.metric,
                current.granularity,
            );
        } catch (e: any) {
            error = e.message || String(e);
            breakdown = null;
        } finally {
            loading = false;
        }
    }

    async function loadForecast(currentMetric: string, exclude: boolean) {
        const client = aws.costExplorer;
        if (!client) return;

        forecast = null;
        forecastNote = "";
        // Forecast the stretch that is still unknown: today through the first
        // of next month (Cost Explorer's end is exclusive).
        const now = new Date();
        const today = toCostDate(now);
        const monthEnd = toCostDate(
            new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
        );

        try {
            const res = await client.send(
                new GetCostForecastCommand({
                    TimePeriod: { Start: today, End: monthEnd },
                    Granularity: "MONTHLY",
                    Metric: toForecastMetric(currentMetric) as any,
                    Filter: buildFilter(exclude),
                }),
            );
            const amount = Number(res.Total?.Amount);
            if (Number.isFinite(amount)) {
                forecast = { amount, unit: res.Total?.Unit || "USD" };
            }
        } catch (e: any) {
            // Forecasts need enough billing history; a miss is not an error
            // worth blocking the page for.
            forecastNote = e.name === "DataUnavailableException"
                ? "Not enough history"
                : "Unavailable";
        }
    }
</script>

<div class="h-full min-h-0 flex flex-col bg-gray-950 text-white overflow-hidden">
    <!-- Header + controls -->
    <div class="border-b border-gray-800 bg-gray-900/50 shrink-0">
        <div class="flex items-center justify-between gap-3 p-4 pb-3">
            <div class="flex items-center gap-2 min-w-0">
                <div class="p-2 bg-purple-500/10 rounded-lg shrink-0">
                    <Icon
                        path={mdiCurrencyUsd}
                        size={20}
                        class="text-purple-400"
                    />
                </div>
                <div class="min-w-0">
                    <h2 class="text-sm font-bold text-gray-200">Cost & Usage</h2>
                    <p class="text-[10px] text-gray-500 font-mono truncate">
                        {range.start} → {addCostDays(range.end, -1)} · AWS bills $0.01
                        per Cost Explorer request
                    </p>
                </div>
            </div>

            <button
                onclick={() => refreshKey++}
                disabled={loading}
                class="shrink-0 flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 px-3 py-1.5 rounded text-xs font-bold transition border border-gray-700"
            >
                <Icon
                    path={mdiRefresh}
                    size={14}
                    class={loading ? "animate-spin" : ""}
                />
                Refresh
            </button>
        </div>

        <div class="flex flex-wrap items-end gap-3 px-4 pb-3">
            <div class="w-40">
                <label
                    for="ce-range"
                    class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                    >Date Range</label
                >
                <Select
                    id="ce-range"
                    bind:value={preset}
                    onchange={onPresetChange}
                    options={COST_RANGE_PRESETS.map((item) => ({
                        value: item.id,
                        label: item.label,
                    }))}
                    small
                />
            </div>

            {#if preset === "custom"}
                <div>
                    <label
                        for="ce-start"
                        class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                        >Start</label
                    >
                    <input
                        id="ce-start"
                        type="date"
                        bind:value={customStart}
                        class="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500 transition"
                    />
                </div>
                <div>
                    <label
                        for="ce-end"
                        class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                        >End</label
                    >
                    <input
                        id="ce-end"
                        type="date"
                        bind:value={customEnd}
                        class="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500 transition"
                    />
                </div>
            {/if}

            <div class="w-32">
                <label
                    for="ce-granularity"
                    class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                    >Granularity</label
                >
                <Select
                    id="ce-granularity"
                    bind:value={granularity}
                    options={GRANULARITY_OPTIONS}
                    small
                />
            </div>

            <div class="w-44">
                <label
                    for="ce-group"
                    class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                    >Group By</label
                >
                <Select
                    id="ce-group"
                    bind:value={groupDimension}
                    options={GROUP_OPTIONS}
                    small
                />
            </div>

            <div class="w-44">
                <label
                    for="ce-metric"
                    class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                    >Metric</label
                >
                <Select
                    id="ce-metric"
                    bind:value={metric}
                    options={METRIC_OPTIONS}
                    small
                />
            </div>

            <label
                class="flex items-center gap-2 text-xs text-gray-400 h-[30px] cursor-pointer select-none"
            >
                <input
                    type="checkbox"
                    bind:checked={excludeCredits}
                    class="accent-blue-500"
                />
                Exclude credits & refunds
            </label>
        </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-h-0 overflow-auto overscroll-contain p-4">
        {#if rangeInvalid}
            <div
                class="bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 rounded p-3 text-xs mb-4 flex items-center gap-2"
            >
                <Icon path={mdiAlertCircleOutline} size={16} />
                Pick a start date on or before the end date.
            </div>
        {/if}

        {#if error}
            <div
                class="bg-red-500/10 text-red-300 border border-red-500/30 rounded p-3 text-xs mb-4"
            >
                <div class="flex items-center gap-2 font-bold">
                    <Icon path={mdiAlertCircleOutline} size={16} />
                    Cost Explorer request failed
                </div>
                <p class="mt-1 font-mono break-words">{error}</p>
                <p class="mt-1 text-red-300/70">
                    Cost Explorer must be enabled for the account and the caller
                    needs <span class="font-mono">ce:GetCostAndUsage</span>.
                </p>
            </div>
        {/if}

        <!-- Summary -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <InfoCard
                label="Total"
                value={breakdown ? formatCostAmount(breakdown.total, unit) : "—"}
                className="!p-3 !rounded-xl bg-blue-400/5"
                valueClass="!text-lg !font-mono !text-blue-400 !bg-transparent !border-none !px-0 !py-0"
            />
            <InfoCard
                label={granularity === "MONTHLY"
                    ? "Monthly Average"
                    : "Daily Average"}
                value={breakdown ? formatCostAmount(averagePerPeriod, unit) : "—"}
                className="!p-3 !rounded-xl bg-green-400/5"
                valueClass="!text-lg !font-mono !text-green-400 !bg-transparent !border-none !px-0 !py-0"
            />
            <InfoCard
                label={groupDimension ? `Top ${groupLabel}` : "Peak Period"}
                value={groupDimension
                    ? (breakdown?.series[0]
                          ? `${breakdown.series[0].key} · ${formatCostAmount(breakdown.series[0].total, unit)}`
                          : "—")
                    : (peakPeriod
                          ? `${peakPeriod.label} · ${formatCostAmount(peakPeriod.amount, unit)}`
                          : "—")}
                className="!p-3 !rounded-xl bg-purple-400/5"
                valueClass="!text-sm !font-mono !text-purple-400 !bg-transparent !border-none !px-0 !py-0"
            />
            <InfoCard
                label="Forecast (Rest Of Month)"
                value={forecast
                    ? formatCostAmount(forecast.amount, forecast.unit)
                    : forecastNote || "—"}
                className="!p-3 !rounded-xl bg-orange-400/5"
                valueClass="!text-lg !font-mono !text-orange-400 !bg-transparent !border-none !px-0 !py-0"
            />
        </div>

        <!-- Chart -->
        <div
            class="bg-gray-900/40 p-4 rounded-xl border border-gray-800/50 shadow-lg mb-4"
        >
            <div class="flex items-center justify-between mb-2">
                <h4
                    class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                >
                    {METRIC_OPTIONS.find((m) => m.value === metric)?.label} by {groupDimension
                        ? groupLabel
                        : "Period"}
                </h4>
                {#if hasEstimates}
                    <span class="text-[10px] text-gray-500 italic"
                        >Recent periods are estimated</span
                    >
                {/if}
            </div>
            <CostChart
                labels={breakdown?.periods.map((p) => p.label) ?? []}
                series={chartSeries}
                {loading}
                otherLabel={OTHER_LABEL}
                formatValue={(value) => formatCostAmount(value, unit)}
            />
        </div>

        <!-- Breakdown table -->
        <div
            class="bg-gray-900/40 rounded-xl border border-gray-800/50 shadow-lg overflow-hidden"
        >
            <div
                class="flex items-center justify-between gap-3 p-3 border-b border-gray-800/60"
            >
                <h4
                    class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                >
                    Breakdown{breakdown ? ` (${breakdown.series.length})` : ""}
                </h4>
                <div class="relative w-full sm:w-64">
                    <span
                        class="absolute inset-y-0 left-2.5 flex items-center text-gray-500"
                        ><Icon path={mdiMagnify} size={14} /></span
                    >
                    <input
                        type="text"
                        bind:value={filterText}
                        placeholder="Filter..."
                        class="w-full bg-gray-950 border border-gray-700 rounded pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-500 text-gray-200 transition-colors"
                    />
                    {#if filterText}
                        <button
                            onclick={() => (filterText = "")}
                            class="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-300"
                            ><Icon path={mdiClose} size={14} /></button
                        >
                    {/if}
                </div>
            </div>

            {#if loading && !breakdown}
                <div class="p-6 text-center text-xs text-gray-400 animate-pulse">
                    Loading cost data...
                </div>
            {:else if tableRows.length === 0}
                <div class="p-6 text-center text-xs text-gray-600 italic">
                    No cost data for this period
                </div>
            {:else}
                <table class="w-full text-left border-collapse text-sm">
                    <thead class="bg-gray-900">
                        <tr>
                            <th
                                class="border-b border-gray-800 px-4 py-2 font-semibold text-gray-300"
                                >{groupDimension ? groupLabel : "Scope"}</th
                            >
                            <th
                                class="border-b border-gray-800 px-4 py-2 font-semibold text-gray-300 text-right w-40"
                                >Cost</th
                            >
                            <th
                                class="border-b border-gray-800 px-4 py-2 font-semibold text-gray-300 w-56"
                                >Share</th
                            >
                        </tr>
                    </thead>
                    <tbody>
                        {#each tableRows as row (row.key)}
                            <tr class="hover:bg-gray-900/60 transition-colors">
                                <td
                                    class="border-b border-gray-800/60 px-4 py-2 text-gray-200 break-words"
                                    >{row.key}</td
                                >
                                <td
                                    class="border-b border-gray-800/60 px-4 py-2 text-right font-mono text-gray-200 whitespace-nowrap"
                                    >{formatCostAmount(row.total, unit)}</td
                                >
                                <td class="border-b border-gray-800/60 px-4 py-2">
                                    <div class="flex items-center gap-2">
                                        <div
                                            class="flex-1 h-1.5 bg-gray-800 rounded overflow-hidden"
                                        >
                                            <div
                                                class="h-full bg-blue-500 rounded"
                                                style="width: {Math.max(0, Math.min(100, row.share))}%"
                                            ></div>
                                        </div>
                                        <span
                                            class="text-[10px] font-mono text-gray-400 w-12 text-right"
                                            >{row.share.toFixed(1)}%</span
                                        >
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    </div>
</div>
