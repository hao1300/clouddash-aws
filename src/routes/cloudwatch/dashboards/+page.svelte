<script lang="ts">
    import {
        ListDashboardsCommand,
        GetDashboardCommand,
        DeleteDashboardsCommand,
        PutDashboardCommand,
    } from "@aws-sdk/client-cloudwatch";
    import { pushToken, popToken, formatBytes } from "$lib/utils/pagination";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);

    let dashboards = $state<any[]>([]);
    let dashLoading = $state(false);
    let dashTokenMap = $state<string[]>([]);
    let dashCurrentToken = $state<string | undefined>(undefined);
    let selectedDash = $state("");
    let dashBody = $state("");

    $effect(() => {
        if (aws.cw && dashboards.length === 0) {
            loadDashboards();
        }
    });

    async function loadDashboards(token?: string) {
        if (!aws.cw) return;
        try {
            dashLoading = true;
            error = "";
            actionMsg = "";
            const resp = await aws.cw.send(
                new ListDashboardsCommand({ NextToken: token }),
            );
            dashboards = (resp.DashboardEntries ?? []).map((d) => ({
                name: d.DashboardName ?? "Unknown",
                size: d.Size ?? 0,
                lastModified: d.LastModified?.toISOString(),
            }));
            pushToken(dashTokenMap, resp.NextToken);
            dashCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            dashLoading = false;
        }
    }

    async function createDashboard() {
        if (!aws.cw) return;
        const name = prompt("Enter new Dashboard Name:");
        if (!name) return;
        try {
            dashLoading = true;
            error = "";
            actionMsg = "";
            await aws.cw.send(
                new PutDashboardCommand({
                    DashboardName: name,
                    DashboardBody: JSON.stringify({ widgets: [] }),
                }),
            );
            actionMsg = `Dashboard "${name}" created.`;
            dashTokenMap = [];
            await loadDashboards();
        } catch (e) {
            error = String(e);
            dashLoading = false;
        }
    }

    async function deleteDashboard(dashboardName: string) {
        if (!aws.cw) return;
        if (
            !confirm(
                `Are you sure you want to delete dashboard "${dashboardName}"?`,
            )
        )
            return;
        try {
            dashLoading = true;
            error = "";
            actionMsg = "";
            await aws.cw.send(
                new DeleteDashboardsCommand({
                    DashboardNames: [dashboardName],
                }),
            );
            actionMsg = `Dashboard "${dashboardName}" deleted.`;
            selectedDash = "";
            dashTokenMap = [];
            await loadDashboards();
        } catch (e) {
            error = String(e);
            dashLoading = false;
        }
    }

    async function viewDashboard(name: string) {
        if (!aws.cw) return;
        try {
            selectedDash = name;
            dashBody = "Loading...";
            const resp = await aws.cw.send(
                new GetDashboardCommand({ DashboardName: name }),
            );
            dashBody = JSON.stringify(
                JSON.parse(resp.DashboardBody ?? "{}"),
                null,
                2,
            );
        } catch (e) {
            error = String(e);
            dashBody = "";
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}
    {#if actionMsg}<div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30"
        >
            {actionMsg}
        </div>{/if}

    <div class="flex-1 {error || actionMsg ? 'pt-8' : ''}">
        {#if selectedDash}
            <div class="p-4 h-full flex flex-col pt-2 bg-gray-950">
                <div class="mb-4 flex items-center justify-between shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-bold text-gray-200"
                            >{selectedDash}</span
                        >
                    </div>
                </div>
                <div
                    class="flex-1 bg-gray-900 rounded-lg border border-gray-800 shadow-sm overflow-hidden flex flex-col"
                >
                    <div
                        class="px-4 py-2 bg-gray-900/50 border-b border-gray-800 flex justify-between items-center"
                    >
                        <span
                            class="text-[10px] font-bold text-gray-500 uppercase"
                            >Dashboard JSON Source</span
                        >
                    </div>
                    <pre
                        class="flex-1 p-4 text-xs text-gray-300 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">{dashBody}</pre>
                </div>
            </div>
        {:else}
            <PaginatedTable
                items={dashboards}
                loading={dashLoading}
                hasNext={!!dashCurrentToken}
                hasPrev={dashTokenMap.length > 0}
                onNext={() => loadDashboards(dashCurrentToken)}
                onPrev={() => loadDashboards(popToken(dashTokenMap))}
                onRefresh={() => {
                    dashTokenMap = [];
                    loadDashboards();
                }}
                columns={[
                    { key: "name", label: "Dashboard Name" },
                    { key: "size", label: "Size", format: formatBytes },
                    {
                        key: "lastModified",
                        label: "Last Modified",
                        format: (v) => (v ? new Date(v).toLocaleString() : "-"),
                    },
                ]}
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={createDashboard}
                        class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition font-bold"
                        >+ Create Dashboard</button
                    >
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <div class="flex gap-1 justify-end">
                        <button
                            onclick={() => viewDashboard(item.name)}
                            class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                            >View Source</button
                        >
                        <button
                            onclick={(e) => {
                                e.stopPropagation();
                                deleteDashboard(item.name);
                            }}
                            class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                            >Delete</button
                        >
                    </div>
                {/snippet}
            </PaginatedTable>
        {/if}
    </div>
</div>
