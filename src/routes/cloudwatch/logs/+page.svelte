<script lang="ts">
    import {
        DescribeLogGroupsCommand,
        CreateLogGroupCommand,
        DeleteLogGroupCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { pushToken, popToken } from "$lib/utils/pagination";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";

    let error = $state("");
    let actionMsg = $state("");

    let logGroupsTable = $state<any[]>([]);
    let logGroupsLoading = $state(false);
    let logGroupsTokenMap = $state<string[]>([]);
    let logGroupsCurrentToken = $state<string | undefined>(undefined);

    let initialLoadDone = false;

    $effect(() => {
        if (aws.cwLogs && !initialLoadDone) {
            initialLoadDone = true;
            loadLogGroupsTable();
        }
    });

    $effect(() => {
        titleService.setResource("");
    });

    async function loadLogGroupsTable(token?: string) {
        if (!aws.cwLogs) return;
        try {
            logGroupsLoading = true;
            error = "";
            actionMsg = "";
            const params: any = { limit: 50, nextToken: token };
            const resp = await aws.cwLogs.send(
                new DescribeLogGroupsCommand(params),
            );
            logGroupsTable = (resp.logGroups ?? []).map((g) => ({
                name: g.logGroupName ?? "",
                retentionDays: g.retentionInDays ?? "Never expire",
                creationTime: g.creationTime
                    ? new Date(g.creationTime).toLocaleString()
                    : "-",
            }));
            pushToken(logGroupsTokenMap, resp.nextToken);
            logGroupsCurrentToken = resp.nextToken;
        } catch (e) {
            error = String(e);
        } finally {
            logGroupsLoading = false;
        }
    }

    async function createLogGroup() {
        if (!aws.cwLogs) return;
        const name = prompt("Enter new Log Group Name:");
        if (!name) return;
        try {
            logGroupsLoading = true;
            error = "";
            actionMsg = "";
            await aws.cwLogs.send(
                new CreateLogGroupCommand({ logGroupName: name }),
            );
            actionMsg = `Log Group "${name}" created.`;
            logGroupsTokenMap = [];
            await loadLogGroupsTable();
        } catch (e) {
            error = String(e);
            logGroupsLoading = false;
        }
    }

    async function deleteLogGroup(name: string) {
        if (!aws.cwLogs) return;
        if (
            !confirm(
                `Are you sure you want to delete log group "${name}" and all its logs?`,
            )
        )
            return;
        try {
            logGroupsLoading = true;
            error = "";
            actionMsg = "";
            await aws.cwLogs.send(
                new DeleteLogGroupCommand({ logGroupName: name }),
            );
            actionMsg = `Log Group "${name}" deleted.`;
            logGroupsTokenMap = [];
            await loadLogGroupsTable();
        } catch (e) {
            error = String(e);
            logGroupsLoading = false;
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}
        <div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">
            {error}
        </div>
    {/if}
    {#if actionMsg}
        <div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">
            {actionMsg}
        </div>
    {/if}

    <div class="flex-1 flex flex-col min-h-0 {error || actionMsg ? 'pt-8' : ''}">
        <PaginatedTable
            items={logGroupsTable}
            loading={logGroupsLoading}
            hasNext={!!logGroupsCurrentToken}
            hasPrev={logGroupsTokenMap.length > 0}
            onNext={() => loadLogGroupsTable(logGroupsCurrentToken)}
            onPrev={() => loadLogGroupsTable(popToken(logGroupsTokenMap))}
            onRefresh={() => {
                logGroupsTokenMap = [];
                loadLogGroupsTable();
            }}
            columns={[
                {
                    key: "name",
                    label: "Log Group Name",
                    onClick: (item) => {
                        goto(`/cloudwatch/logs/${encodeURIComponent(item.name)}`);
                    },
                },
                { key: "retentionDays", label: "Retention" },
                { key: "creationTime", label: "Creation Time" },
            ]}
        >
            {#snippet headerActionsSnippet()}
                <button
                    onclick={createLogGroup}
                    class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition font-bold shadow-sm"
                >+ Create Log Group</button>
            {/snippet}
            {#snippet actionsSnippet(item)}
                <div class="flex gap-1 justify-end">
                    <button
                        onclick={(e) => {
                            e.stopPropagation();
                            deleteLogGroup(item.name);
                        }}
                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                    >Delete</button>
                </div>
            {/snippet}
        </PaginatedTable>
    </div>
</div>
