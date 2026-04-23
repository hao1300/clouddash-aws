<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiCircle } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    import {
        DescribeApplicationsCommand,
        DescribeEnvironmentsCommand,
        type ApplicationDescription,
        type EnvironmentDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import { goto } from "$app/navigation";

    let appId = $derived($page.params.id || "");
    let app = $state<ApplicationDescription | null>(null);
    let environments = $state<EnvironmentDescription[]>([]);
    let loading = $state(false);
    let envLoading = $state(false);
    let error = $state("");

    $effect(() => {
        titleService.setResource(appId, undefined, $page.url.pathname);
    });

    $effect(() => {
        if (aws.eb && appId) {
            loadApplication();
            loadEnvironments();
        }
    });

    async function loadApplication() {
        if (!aws.eb || !appId) return;
        try {
            loading = true;
            error = "";
            const res = await aws.eb.send(
                new DescribeApplicationsCommand({ ApplicationNames: [appId] }),
            );
            if (res.Applications && res.Applications.length > 0) {
                app = res.Applications[0];
            } else {
                error = "Application not found";
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function loadEnvironments() {
        if (!aws.eb || !appId) return;
        try {
            envLoading = true;
            const res = await aws.eb.send(
                new DescribeEnvironmentsCommand({ ApplicationName: appId }),
            );
            environments = res.Environments || [];
        } catch (e: any) {
            console.error("Failed to load environments", e);
        } finally {
            envLoading = false;
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

<div class="h-full flex flex-col bg-gray-950 overflow-hidden p-6 relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    {#if loading}
        <div
            class="flex-1 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest"
        >
            Loading Application...
        </div>
    {:else if app}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 shrink-0">
            <InfoCard label="Description" value={app.Description || "-"} />
            <InfoCard label="Versions" value={String(app.Versions?.length || 0)} />
            <InfoCard label="Created" value={app.DateCreated ? new Date(app.DateCreated).toLocaleString() : "-"} />
            <InfoCard label="Updated" value={app.DateUpdated ? new Date(app.DateUpdated).toLocaleString() : "-"} />
        </div>

        <div class="flex-1 min-h-0 min-h-[300px] bg-gray-900 rounded-lg border border-gray-800 flex flex-col">
            <div class="p-4 border-b border-gray-800 shrink-0">
                <h3 class="text-xs text-gray-400 uppercase tracking-widest font-bold">Environments</h3>
            </div>
            <div class="flex-1 relative overflow-hidden">
                <PaginatedTable
                    items={environments}
                    loading={envLoading}
                    onRefresh={loadEnvironments}
                    columns={[
                        {
                            label: "Environment Name",
                            key: "EnvironmentName",
                            onClick: (item) =>
                                goto(
                                    `/elasticbeanstalk/environment/${encodeURIComponent(item.EnvironmentId || item.EnvironmentName)}`,
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
        </div>
    {/if}
</div>
