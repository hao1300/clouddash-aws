<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import { ListMetricsCommand } from "@aws-sdk/client-cloudwatch";
    import { pushToken, popToken } from "$lib/utils/pagination";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let namespace = $derived($page.params.namespace);

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);

    let metrics = $state<any[]>([]);
    let metricsLoading = $state(false);
    let metricsTokenMap = $state<string[]>([]);
    let metricsCurrentToken = $state<string | undefined>(undefined);

    // Breadcrumb title
    $effect(() => {
        if (namespace) {
            titleService.setResource(
                namespace,
                `/cloudwatch/metrics/${encodeURIComponent(namespace)}`,
                $page.url.pathname,
            );
        }
    });

    $effect(() => {
        if (aws.cw && namespace) {
            loadMetrics();
        }
    });

    async function loadMetrics(token?: string) {
        if (!aws.cw) return;
        try {
            metricsLoading = true;
            error = "";
            actionMsg = "";
            const params: any = { Namespace: namespace, NextToken: token };
            const resp = await aws.cw.send(new ListMetricsCommand(params));
            let fetchedMetrics = (resp.Metrics ?? []).map((m) => {
                const item: any = {
                    namespace: m.Namespace ?? "",
                    metricName: m.MetricName ?? "",
                    rawDimensions: m.Dimensions ?? [],
                };
                // Flatten dimensions into top-level properties for sorting
                for (const d of m.Dimensions ?? []) {
                    if (d.Name) {
                        item[`dim_${d.Name}`] = d.Value ?? "";
                    }
                }
                return item;
            });

            fetchedMetrics.sort((a, b) => a.metricName.localeCompare(b.metricName));
            
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
        if (!namespace || !m.metricName) return;
        const dimensions = JSON.stringify(m.rawDimensions);
        const url = `/cloudwatch/metrics/${encodeURIComponent(namespace)}/${encodeURIComponent(m.metricName)}?dimensions=${encodeURIComponent(dimensions)}`;
        goto(url);
    }

    // Dynamic columns for dimensions
    let dimensionNames = $derived.by(() => {
        const names = new Set<string>();
        for (const m of metrics) {
            for (const key of Object.keys(m)) {
                if (key.startsWith("dim_")) {
                    names.add(key.replace("dim_", ""));
                }
            }
        }
        return Array.from(names).sort();
    });

    let columns = $derived.by(() => {
        const base = [
            {
                key: "metricName",
                label: "Metric Name",
                sortable: true,
                onClick: (item: any) => handleSelectMetric(item)
            }
        ];
        
        const dimCols = dimensionNames.map(dn => ({
            key: `dim_${dn}`,
            label: dn,
            sortable: true
        }));

        return [...base, ...dimCols];
    });
</script>

<PaginatedTable
    items={metrics}
    loading={metricsLoading}
    hasNext={!!metricsCurrentToken}
    hasPrev={metricsTokenMap.length > 0}
    {error}
    {actionMsg}
    onNext={() => loadMetrics(metricsCurrentToken ?? undefined)}
    onPrev={() => loadMetrics(popToken(metricsTokenMap))}
    onRefresh={() => {
        metricsTokenMap = [];
        loadMetrics();
    }}
    {columns}
/>
