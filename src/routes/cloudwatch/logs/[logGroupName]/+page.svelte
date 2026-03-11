<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import {
        DescribeLogGroupsCommand,
        DescribeLogStreamsCommand,
        DeleteLogGroupCommand,
        PutRetentionPolicyCommand,
        DeleteRetentionPolicyCommand,
        CreateLogStreamCommand,
        DeleteLogStreamCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { pushToken, popToken } from "$lib/utils/pagination";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { titleService } from "$lib/services/title.svelte";

    let logGroupName = $derived($page.params.logGroupName || "");
    let error = $state("");
    let actionMsg = $state("");

    let logGroup = $state<any>(null);
    let logStreams = $state<any[]>([]);
    let logStreamsLoading = $state(false);
    let logStreamsTokenMap = $state<string[]>([]);
    let logStreamsCurrentToken = $state<string | undefined>(undefined);
    let logStreamSearchPrefix = $state("");

    let menuOpen = $state(false);

    $effect(() => {
        if (aws.cwLogs && logGroupName) {
            loadLogGroup();
            loadLogStreams();
        }
    });

    $effect(() => {
        if (logGroupName) {
            titleService.setResource(logGroupName);
        }
    });

    async function loadLogGroup() {
        if (!aws.cwLogs) return;
        try {
            const resp = await aws.cwLogs.send(
                new DescribeLogGroupsCommand({
                    logGroupNamePrefix: logGroupName,
                    limit: 1
                }),
            );
            // Prefix match can return multiple, find the exact one
            const g = resp.logGroups?.find(group => group.logGroupName === logGroupName);
            if (g) {
                logGroup = {
                    name: g.logGroupName ?? "",
                    retentionDays: g.retentionInDays ?? "Never expire",
                    creationTime: g.creationTime
                        ? new Date(g.creationTime).toLocaleString()
                        : "-",
                    arn: g.arn
                };
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function loadLogStreams(token?: string) {
        if (!aws.cwLogs || !logGroupName) return;
        try {
            logStreamsLoading = true;
            error = "";
            actionMsg = "";
            const params: any = {
                logGroupName,
                limit: 50,
                nextToken: token,
                orderBy: "LastEventTime",
                descending: true,
            };
            if (logStreamSearchPrefix.trim()) {
                params.logStreamNamePrefix = logStreamSearchPrefix.trim();
                delete params.orderBy;
                delete params.descending;
            }
            const resp = await aws.cwLogs.send(
                new DescribeLogStreamsCommand(params),
            );
            logStreams = (resp.logStreams ?? []).map((s) => ({
                name: s.logStreamName ?? "",
                creationTime: s.creationTime
                    ? new Date(s.creationTime).toLocaleString()
                    : "-",
                lastEventTime: s.lastEventTimestamp
                    ? new Date(s.lastEventTimestamp).toLocaleString()
                    : "-",
            }));
            pushToken(logStreamsTokenMap, resp.nextToken);
            logStreamsCurrentToken = resp.nextToken;
        } catch (e) {
            error = String(e);
        } finally {
            logStreamsLoading = false;
        }
    }

    async function deleteLogGroup() {
        if (!aws.cwLogs || !logGroupName) return;
        if (!confirm(`Are you sure you want to delete log group "${logGroupName}"?`)) return;
        try {
            await aws.cwLogs.send(new DeleteLogGroupCommand({ logGroupName }));
            goto("/cloudwatch/logs");
        } catch (e) {
            error = String(e);
        }
    }

    async function setRetention() {
        if (!aws.cwLogs || !logGroupName) return;
        const daysStr = prompt("Enter retention in days (e.g. 1, 3, 5, 7, 14, 30...):");
        if (daysStr === null) return;
        try {
            if (daysStr.trim() === "") {
                await aws.cwLogs.send(new DeleteRetentionPolicyCommand({ logGroupName }));
            } else {
                const days = parseInt(daysStr, 10);
                if (isNaN(days)) throw new Error("Invalid days");
                await aws.cwLogs.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays: days }));
            }
            await loadLogGroup();
        } catch (e) {
            error = String(e);
        }
    }

    async function createLogStream() {
        if (!aws.cwLogs || !logGroupName) return;
        const name = prompt("Enter new Log Stream Name:");
        if (!name) return;
        try {
             await aws.cwLogs.send(new CreateLogStreamCommand({ logGroupName, logStreamName: name }));
             await loadLogStreams();
        } catch (e) {
            error = String(e);
        }
    }

    async function deleteLogStream(streamName: string) {
        if (!aws.cwLogs || !logGroupName) return;
        if (!confirm(`Delete stream "${streamName}"?`)) return;
        try {
            await aws.cwLogs.send(new DeleteLogStreamCommand({ logGroupName, logStreamName: streamName }));
            await loadLogStreams();
        } catch (e) {
            error = String(e);
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}
        <div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">
            {error}
        </div>
    {/if}

    <div class="flex-1 flex flex-col min-h-0 {error ? 'pt-8' : ''}">
        <PaginatedTable
            items={logStreams}
            loading={logStreamsLoading}
            hasNext={!!logStreamsCurrentToken}
            hasPrev={logStreamsTokenMap.length > 0}
            onNext={() => loadLogStreams(logStreamsCurrentToken)}
            onPrev={() => loadLogStreams(popToken(logStreamsTokenMap))}
            onRefresh={() => {
                logStreamsTokenMap = [];
                loadLogStreams();
            }}
            columns={[
                {
                    key: "name",
                    label: "Log Stream Name",
                    onClick: (item) => {
                        goto(`/cloudwatch/logs/${encodeURIComponent(logGroupName)}/${encodeURIComponent(item.name)}`);
                    },
                },
                { key: "creationTime", label: "Creation Time" },
                { key: "lastEventTime", label: "Last Event Time" },
            ]}
        >
            {#snippet headerActionsSnippet()}
                <div class="relative">
                    <button
                        onclick={() => (menuOpen = !menuOpen)}
                        class="p-2 hover:bg-gray-800 rounded transition text-gray-400 hover:text-white flex items-center justify-center border border-gray-700 bg-gray-900/50"
                        title="Actions"
                    >
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="12" cy="5" r="1" />
                            <circle cx="12" cy="19" r="1" />
                        </svg>
                    </button>
                    {#if menuOpen}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div 
                            class="fixed inset-0 z-40" 
                            onclick={() => menuOpen = false}
                        ></div>
                        <div class="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in duration-100">
                            <button
                                onclick={() => { setRetention(); menuOpen = false; }}
                                class="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-800 text-blue-400 font-bold transition flex items-center gap-2"
                            >
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Retention
                            </button>
                            <div class="border-t border-gray-800"></div>
                            <button
                                onclick={() => { deleteLogGroup(); menuOpen = false; }}
                                class="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-800 text-red-500 font-bold transition flex items-center gap-2"
                            >
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete Group
                            </button>
                        </div>
                    {/if}
                </div>
            {/snippet}
            {#snippet actionsSnippet(item)}
                <button
                    onclick={(e) => {
                        e.stopPropagation();
                        deleteLogStream(item.name);
                    }}
                    class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                >Delete</button>
            {/snippet}
        </PaginatedTable>
    </div>
</div>
