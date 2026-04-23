<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiCircle } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let items = $state<any[]>([]);
    let loading = $state(false);
    let loaded = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    $effect(() => {
        if (aws.cloudfront && !loaded) {
            loadDistributions();
        }
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
                aliases: (d.Aliases?.Items ?? []).join(", ") || "-",
                comment: d.Comment ?? "",
            }));

            if (token) history.push(token);
            marker = list?.NextMarker;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
            loaded = true;
        }
    }
</script>

{#snippet stateCell(v: boolean)}
    <div class="flex items-center gap-1.5">
        <Icon path={mdiCircle} size={10} color={v ? COLORS.SUCCESS : COLORS.ERROR} />
        <span>{v ? "Enabled" : "Disabled"}</span>
    </div>
{/snippet}

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

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
                onClick: (item) => goto(`/cloudfront/${encodeURIComponent(item.id)}`),
            },
            { key: "aliases", label: "Alternate Domain Names" },
            { key: "comment", label: "Description", format: (v) => v || "-" },
            { key: "domain", label: "Domain Name" },
            {
                key: "enabled",
                label: "State",
                renderCell: stateCell,
            },
            { key: "status", label: "Status" },
        ]}
    />
</div>
