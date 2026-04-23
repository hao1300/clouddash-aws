<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiCircle } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    import {
        DescribeEnvironmentsCommand,
        type EnvironmentDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";

    let environments = $state<EnvironmentDescription[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);



    let __initLoaded = false;
    $effect(() => {
        if (aws.eb && !__initLoaded) {
            __initLoaded = true;
            loadEnvironments();
        }
    });

    async function loadEnvironments(token?: string) {
        if (!aws.eb) return;
        try {
            loading = true;
            error = "";
            const res = await aws.eb.send(
                new DescribeEnvironmentsCommand({ NextToken: token }),
            );
            environments = res.Environments || [];
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
            color={v === "Ready" ? COLORS.SUCCESS : COLORS.WARNING}
        />
        <span>{v}</span>
    </div>
{/snippet}

{#snippet healthCell(v: string)}
    <div class="flex items-center gap-1.5">
        <Icon
            path={mdiCircle}
            size={10}
            color={v === "Green"
                ? COLORS.SUCCESS
                : v === "Yellow"
                  ? COLORS.CAUTION
                  : v === "Red"
                    ? COLORS.ERROR
                    : COLORS.GRAY}
        />
        <span>{v || "Unknown"}</span>
    </div>
{/snippet}

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={environments}
        {loading}
        onRefresh={() => {
            history = [];
            loadEnvironments();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadEnvironments(marker)}
        onPrev={() => {
            history.pop();
            loadEnvironments(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Environment Name",
                key: "EnvironmentName",
                onClick: (item) =>
                    goto(
                        `/elasticbeanstalk/environment/${encodeURIComponent(item.EnvironmentId || item.EnvironmentName || "")}`,
                    ),
            },
            {
                label: "Application",
                key: "ApplicationName",
                onClick: (item) =>
                    goto(
                        `/elasticbeanstalk/application/${encodeURIComponent(item.ApplicationName || "")}`,
                    ),
            },
            {
                label: "Status",
                key: "Status",
                renderCell: statusCell,
            },
            {
                label: "Health",
                key: "Health",
                renderCell: healthCell,
            },
        ]}
    />
</div>
