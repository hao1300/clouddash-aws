<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import { goto } from "$app/navigation";
    import { ListMetricsCommand } from "@aws-sdk/client-cloudwatch";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let error = $state("");
    let loading = $state(false);

    let namespaces = $state<{ name: string }[]>([]);
    let metricsLoading = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.cw && !__initLoaded) {
            __initLoaded = true;
            loadNamespaces();
        }
    });

    async function loadNamespaces() {
        if (!aws.cw) return;
        try {
            metricsLoading = true;
            error = "";
            const resp = await aws.cw.send(new ListMetricsCommand({}));
            const uniqueNS = new Set((resp.Metrics ?? []).map(m => m.Namespace).filter(Boolean));
            namespaces = Array.from(uniqueNS).sort().map(ns => ({ name: ns as string }));
        } catch (e) {
            error = String(e);
        } finally {
            metricsLoading = false;
        }
    }
</script>

<div class="h-full flex flex-col overflow-hidden">
<TabBar
    tabs={[
        { id: "alarms", label: "Alarms", href: "/cloudwatch/alarms" },
        { id: "metrics", label: "Metrics", href: "/cloudwatch/metrics" },
        { id: "logs", label: "Log Groups", href: "/cloudwatch/logs" },
        { id: "insights", label: "Logs Insights", href: "/cloudwatch/insights" },
    ]}
    activeTab="metrics"
/>
<div class="flex-1 overflow-hidden relative">
<PaginatedTable
    items={namespaces}
    loading={metricsLoading}
    hasNext={false}
    hasPrev={false}
    {error}
    onRefresh={() => {
        namespaces = [];
        loadNamespaces();
    }}
    columns={[
        {
            key: "name",
            label: "Namespace",
            sortable: true,
            onClick: (item) => {
                goto(`/cloudwatch/metrics/${encodeURIComponent(item.name)}`);
            }
        }
    ]}
/>
</div>
</div>
