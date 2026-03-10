<script lang="ts">
    import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
    import { GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";

    let items = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);
    let selectedDistId = $derived($page.url.searchParams.get("id") || "");
    let selectedDist = $derived(items.find(i => i.id === selectedDistId));
    let metricsData = $state<any>(null);
    let metricsLoading = $state(false);
    let metricPeriod = $state(3600);

    $effect(() => {
        if (aws.cloudfront && items.length === 0) {
            loadDistributions();
        }
    });

    $effect(() => {
        if (aws.cloudfront && selectedDistId && (!selectedDist || selectedDist.id !== selectedDistId)) {
            // If we deep linked, we might need to fetch the list first
            if (items.length > 0) {
                 // Even if we have items, the ID might be on the next page.
                 // For now, let's just assume it's in the list or we can't show it easily without a GetDistribution command.
                 // But we can at least load metrics if we have the ID.
            }
        }
    });

    $effect(() => {
        if (aws.cw && selectedDistId) {
            if (!metricsData || metricsData._id !== selectedDistId) {
                loadMetrics(selectedDistId);
            }
        }
    });

    $effect(() => {
        titleService.setResource(selectedDistId || "");
    });

    async function loadDistributions(token?: string) {
        if (!aws.cloudfront) return;
        try {
            loading = true;
            error = "";
            const resp = await aws.cloudfront.send(
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

            if (token) history.push(token);
            marker = list?.NextMarker;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function viewDistribution(dist: any) {
        goto(`?id=${encodeURIComponent(dist.id)}`);
    }

    async function loadMetrics(distId: string) {
        if (!aws.cw) return;
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

            const resp = await aws.cw.send(
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
            metricsData = { ...result, _id: distId };
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
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    {#if selectedDist}
        <div class="h-full flex flex-col p-4 pr-1 bg-gray-950 overflow-auto">
            <div
                class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
            >
                <span class="text-sm font-bold text-gray-200 truncate flex-1"
                    >{selectedDist.id}
                    <span class="text-gray-500 font-normal ml-2"
                        >{selectedDist.domain}</span
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
                        Origins
                    </div>
                    <div class="text-base font-bold text-gray-200">
                        {selectedDist.origins.length}
                    </div>
                </div>
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
                                {formatNum(metricsData.requests?.total ?? 0)}
                            </div>
                        </div>
                        <div
                            class="bg-gray-950 p-4 rounded border border-gray-800/50 text-center"
                        >
                            <div
                                class="text-xs text-gray-500 uppercase font-semibold mb-1 tracking-wider"
                            >
                                Bytes Down
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
                                4xx Error
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
                                5xx Error
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
        <PaginatedTable
            {items}
            {loading}
            onRefresh={() => loadDistributions()}
            hasNext={!!marker}
            hasPrev={history.length > 0}
            onNext={() => loadDistributions(marker)}
            onPrev={() => {
                history.pop();
                loadDistributions(history[history.length - 1]);
            }}
            columns={[
                {
                    key: "id",
                    label: "ID",
                    onClick: (item) => viewDistribution(item),
                },
                { key: "domain", label: "Domain Name" },
                {
                    key: "enabled",
                    label: "State",
                    format: (v) => (v ? "🟢 Enabled" : "🔴 Disabled"),
                },
                { key: "status", label: "Status" },
                { key: "comment", label: "Comment", format: (v) => v || "-" },
            ]}
        />
    {/if}
</div>
