<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiCircle } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    import {
        DescribeApplicationVersionsCommand,
        type ApplicationVersionDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let versions = $state<ApplicationVersionDescription[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    let __initLoaded = false;
    $effect(() => {
        if (aws.eb && !__initLoaded) {
            __initLoaded = true;
            loadVersions();
        }
    });

    async function loadVersions(token?: string) {
        if (!aws.eb) return;
        try {
            loading = true;
            error = "";
            const res = await aws.eb.send(
                new DescribeApplicationVersionsCommand({ NextToken: token }),
            );
            versions = res.ApplicationVersions || [];
            if (token) history.push(token);
            marker = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

{#snippet statusCell(v: string)}
    <div class="flex items-center gap-1.5">
        <Icon
            path={mdiCircle}
            size={10}
            color={v === "Processed" ? COLORS.SUCCESS : COLORS.WARNING}
        />
        <span>{v}</span>
    </div>
{/snippet}

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={versions}
        {loading}
        onRefresh={() => {
            history = [];
            loadVersions();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadVersions(marker)}
        onPrev={() => {
            history.pop();
            loadVersions(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Version Label",
                key: "VersionLabel",
                onClick: (item) =>
                    goto(
                        `/elasticbeanstalk/versions/${encodeURIComponent(item.ApplicationName + "::" + item.VersionLabel)}`,
                    ),
            },
            {
                label: "Application",
                key: "ApplicationName",
                onClick: (item) => goto(`/elasticbeanstalk/application/${encodeURIComponent(item.ApplicationName || '')}`)
            },
            { label: "Description", key: "Description" },
            {
                label: "Status",
                key: "Status",
                renderCell: statusCell,
            },
            {
                label: "Date Created",
                key: "DateCreated",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
        ]}
    />
</div>
