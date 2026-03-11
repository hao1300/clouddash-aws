<script lang="ts">
    import { goto } from "$app/navigation";
    import { ListMetricsCommand } from "@aws-sdk/client-cloudwatch";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let error = $state("");
    let loading = $state(false);

    let namespaces = $state<{ name: string }[]>([]);
    let metricsLoading = $state(false);

    $effect(() => {
        if (aws.cw && namespaces.length === 0) {
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
