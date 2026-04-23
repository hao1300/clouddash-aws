<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiCircle } from "@mdi/js";

    import {
        DescribeApplicationsCommand,
        DescribeEnvironmentsCommand,
        type ApplicationDescription,
        type EnvironmentDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
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
            color={v === "Ready" ? "#22c55e" : "#f97316"}
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
                ? "#22c55e"
                : v === "Yellow"
                  ? "#eab308"
                  : v === "Red"
                    ? "#ef4444"
                    : "#9ca3af"}
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
        <div
            class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
        >
            <span class="text-sm font-bold text-gray-200 truncate flex-1"
                >{app.ApplicationName}</span
            >
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 shrink-0">
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm overflow-hidden"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Description
                </div>
                <div class="text-base font-bold text-gray-200 truncate" title={app.Description || ""}>
                    {app.Description || "-"}
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Versions
                </div>
                <div class="text-base font-bold text-gray-200">
                    {app.Versions?.length || 0}
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Created
                </div>
                <div class="text-sm font-bold text-gray-200 truncate">
                    {app.DateCreated
                        ? new Date(app.DateCreated).toLocaleString()
                        : "-"}
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Updated
                </div>
                <div class="text-sm font-bold text-gray-200 truncate">
                    {app.DateUpdated
                        ? new Date(app.DateUpdated).toLocaleString()
                        : "-"}
                </div>
            </div>
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
