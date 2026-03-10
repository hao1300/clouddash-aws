<script lang="ts">
    import {
        DescribeLogGroupsCommand,
        DescribeLogStreamsCommand,
        GetLogEventsCommand,
        FilterLogEventsCommand,
        CreateLogGroupCommand,
        DeleteLogGroupCommand,
        PutRetentionPolicyCommand,
        DeleteRetentionPolicyCommand,
        DeleteLogStreamCommand,
        CreateLogStreamCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { pushToken, popToken, formatBytes } from "$lib/utils/pagination";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";

    let error = $state("");
    let actionMsg = $state("");

    // --- Log Groups (Table View) ---
    let logGroupsTable = $state<any[]>([]);
    let logGroupsLoading = $state(false);
    let logGroupsTokenMap = $state<string[]>([]);
    let logGroupsCurrentToken = $state<string | undefined>(undefined);
    let selectedGroupForStreams = $derived($page.url.searchParams.get("group") || "");

    // --- Log Streams ---
    let logStreams = $state<any[]>([]);
    let logStreamSearchPrefix = $state("");
    let logStreamsLoading = $state(false);
    let logStreamsTokenMap = $state<string[]>([]);
    let logStreamsCurrentToken = $state<string | undefined>(undefined);
    let selectedStreamForEvents = $derived($page.url.searchParams.get("stream") || "");

    // --- Log Events ---
    let logEvents = $state<any[]>([]);
    let logEventsLoading = $state(false);
    let logEventsNextToken = $state<string | undefined>(undefined);
    let logEventsPrevToken = $state<string | undefined>(undefined);
    let logEventsFilter = $state("");

    let initialLoadDone = false;

    $effect(() => {
        if (aws.cwLogs && !initialLoadDone) {
            initialLoadDone = true;
            if (selectedGroupForStreams && selectedStreamForEvents) {
                const time = $page.url.searchParams.get("time");
                const timeMs = time ? parseInt(time) : undefined;
                if (timeMs) {
                    loadLogEvents(selectedGroupForStreams, selectedStreamForEvents, {
                        startTime: timeMs,
                        endTime: timeMs + 5000,
                    });
                } else {
                    loadLogEvents(selectedGroupForStreams, selectedStreamForEvents);
                }
            } else if (selectedGroupForStreams) {
                loadLogStreams(selectedGroupForStreams);
            } else {
                loadLogGroupsTable();
            }
        }
    });

    $effect(() => {
        if (aws.cwLogs && initialLoadDone) {
            if (selectedGroupForStreams && selectedStreamForEvents) {
                if (logEvents.length === 0 || selectedStreamForEvents !== logEvents[0]?.streamName) {
                     loadLogEvents(selectedGroupForStreams, selectedStreamForEvents);
                }
            } else if (selectedGroupForStreams) {
                if (logStreams.length === 0) {
                    loadLogStreams(selectedGroupForStreams);
                }
            } else {
                if (logGroupsTable.length === 0) {
                    loadLogGroupsTable();
                }
            }
        }
    });

    $effect(() => {
        titleService.setResource(selectedStreamForEvents || selectedGroupForStreams || "");
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
                storedBytes: g.storedBytes ?? 0,
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

    async function setRetention(name: string) {
        if (!aws.cwLogs) return;
        const daysStr = prompt(
            "Enter retention in days (e.g. 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653). Leave empty to never expire:",
        );
        if (daysStr === null) return;
        try {
            logGroupsLoading = true;
            error = "";
            actionMsg = "";
            if (daysStr.trim() === "") {
                await aws.cwLogs.send(
                    new DeleteRetentionPolicyCommand({ logGroupName: name }),
                );
                actionMsg = `Retention policy removed from "${name}".`;
            } else {
                const days = parseInt(daysStr, 10);
                if (isNaN(days)) throw new Error("Invalid days");
                await aws.cwLogs.send(
                    new PutRetentionPolicyCommand({
                        logGroupName: name,
                        retentionInDays: days,
                    }),
                );
                actionMsg = `Retention for "${name}" set to ${days} days.`;
            }
            logGroupsTokenMap = [];
            await loadLogGroupsTable();
        } catch (e) {
            error = String(e);
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
            selectedGroupForStreams = "";
            await loadLogGroupsTable();
        } catch (e) {
            error = String(e);
            logGroupsLoading = false;
        }
    }

    async function createLogStream(logGroupName: string) {
        if (!aws.cwLogs) return;
        const name = prompt("Enter new Log Stream Name:");
        if (!name) return;
        try {
            logStreamsLoading = true;
            error = "";
            actionMsg = "";
            await aws.cwLogs.send(
                new CreateLogStreamCommand({
                    logGroupName,
                    logStreamName: name,
                }),
            );
            actionMsg = `Log Stream "${name}" created.`;
            logStreamsTokenMap = [];
            await loadLogStreams(logGroupName);
        } catch (e) {
            error = String(e);
            logStreamsLoading = false;
        }
    }

    async function deleteLogStream(
        logGroupName: string,
        logStreamName: string,
    ) {
        if (!aws.cwLogs) return;
        if (
            !confirm(
                `Are you sure you want to delete log stream "${logStreamName}"?`,
            )
        )
            return;
        try {
            logStreamsLoading = true;
            error = "";
            actionMsg = "";
            await aws.cwLogs.send(
                new DeleteLogStreamCommand({
                    logGroupName,
                    logStreamName,
                }),
            );
            actionMsg = `Log Stream "${logStreamName}" deleted.`;
            logStreamsTokenMap = [];
            await loadLogStreams(logGroupName);
        } catch (e) {
            error = String(e);
            logStreamsLoading = false;
        }
    }

    async function loadLogStreams(logGroupName: string, token?: string) {
        if (!aws.cwLogs) return;
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
                storedBytes: s.storedBytes ?? 0,
            }));
            pushToken(logStreamsTokenMap, resp.nextToken);
            logStreamsCurrentToken = resp.nextToken;
        } catch (e) {
            error = String(e);
        } finally {
            logStreamsLoading = false;
        }
    }

    async function loadLogEvents(
        logGroupName: string,
        logStreamName: string,
        options: {
            token?: string;
            direction?: "next" | "prev";
            startTime?: number;
            endTime?: number;
        } = {},
    ) {
        if (!aws.cwLogs) return;
        const { token, direction = "next", startTime, endTime } = options;
        try {
            logEventsLoading = true;
            error = "";
            actionMsg = "";

            if (logEventsFilter.trim()) {
                const params: any = {
                    logGroupName,
                    logStreamNames: [logStreamName],
                    limit: 100,
                    filterPattern: logEventsFilter.trim(),
                };
                if (token) {
                    params.nextToken = token;
                }
                if (startTime) params.startTime = startTime;
                if (endTime) params.endTime = endTime;

                const resp = await aws.cwLogs.send(
                    new FilterLogEventsCommand(params),
                );
                logEvents = (resp.events ?? []).map((e) => ({
                    timestamp: e.timestamp
                        ? new Date(e.timestamp).toLocaleString()
                        : "-",
                    message: e.message ?? "",
                }));
                logEventsNextToken = resp.nextToken;
                logEventsPrevToken = undefined;
                if (resp.events && resp.events.length === 0) {
                    actionMsg = "No more matching events found.";
                }
            } else {
                const params: any = {
                    logGroupName,
                    logStreamName,
                    limit: 100,
                };

                if (token) {
                    params.nextToken = token;
                } else if (direction === "next" && !token) {
                    params.startFromHead = true;
                }

                if (startTime) {
                    params.startTime = startTime;
                } else {
                    delete params.startFromHead;
                }
                if (endTime) params.endTime = endTime;

                const resp = await aws.cwLogs.send(
                    new GetLogEventsCommand(params),
                );

                logEvents = (resp.events ?? []).map((e) => ({
                    timestamp: e.timestamp
                        ? new Date(e.timestamp).toLocaleString()
                        : "-",
                    message: e.message ?? "",
                }));

                if ((resp.events && resp.events.length > 0) || !token) {
                    logEventsNextToken = resp.nextForwardToken;
                    logEventsPrevToken = resp.nextBackwardToken;
                } else if (resp.events && resp.events.length === 0) {
                    actionMsg =
                        direction === "next"
                            ? "No newer log events found."
                            : "No older log events found.";
                }
            }
        } catch (e) {
            error = String(e);
        } finally {
            logEventsLoading = false;
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

    <div
        class="flex-1 flex flex-col min-h-0 {error || actionMsg ? 'pt-8' : ''}"
    >
        {#if selectedStreamForEvents}
            <div class="h-full flex flex-col p-4 bg-gray-950">
                <div
                    class="mb-4 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm flex items-center gap-3 shrink-0"
                >
                    <span class="text-sm font-bold text-gray-200"
                        >{selectedStreamForEvents}</span
                    >
                </div>

                <div
                    class="flex-1 overflow-hidden bg-gray-900 border border-gray-800 rounded-lg flex flex-col shadow-sm"
                >
                    <div
                        class="bg-gray-900 border-b border-gray-800 p-3 flex gap-3 items-center flex-wrap"
                    >
                        <div
                            class="flex items-center gap-2 flex-1 min-w-[300px]"
                        >
                            <input
                                type="text"
                                bind:value={logEventsFilter}
                                onkeydown={(e) => {
                                    if (e.key === "Enter") {
                                        loadLogEvents(
                                            selectedGroupForStreams,
                                            selectedStreamForEvents,
                                        );
                                    }
                                }}
                                placeholder="Filter pattern..."
                                class="bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500 text-gray-200 flex-1"
                            />
                            <button
                                onclick={() => {
                                    loadLogEvents(
                                        selectedGroupForStreams,
                                        selectedStreamForEvents,
                                    );
                                }}
                                class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded transition font-bold shadow-sm"
                                >Filter</button
                            >
                            {#if logEventsFilter.trim()}
                                <button
                                    onclick={() => {
                                        logEventsFilter = "";
                                        loadLogEvents(
                                            selectedGroupForStreams,
                                            selectedStreamForEvents,
                                        );
                                    }}
                                    class="text-xs text-gray-400 hover:text-white underline px-2"
                                    >Clear</button
                                >
                            {/if}
                        </div>
                        <div class="flex items-center gap-4 ml-auto">
                            <button
                                onclick={() =>
                                    loadLogEvents(
                                        selectedGroupForStreams,
                                        selectedStreamForEvents,
                                        {
                                            token: logEventsPrevToken,
                                            direction: "prev",
                                        },
                                    )}
                                disabled={logEventsLoading ||
                                    logEventsFilter.trim() !== ""}
                                class="text-xs font-bold text-blue-400 hover:text-blue-300 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                title={logEventsFilter.trim()
                                    ? "Backward pagination not supported during filter"
                                    : ""}>← Older</button
                            >
                            <button
                                onclick={() =>
                                    loadLogEvents(
                                        selectedGroupForStreams,
                                        selectedStreamForEvents,
                                        {
                                            token: logEventsNextToken,
                                            direction: "next",
                                        },
                                    )}
                                disabled={!logEventsNextToken ||
                                    logEventsLoading}
                                class="text-xs font-bold text-blue-400 hover:text-blue-300 transition disabled:opacity-30"
                                >Newer →</button
                            >
                        </div>
                    </div>
                    <div class="flex-1 overflow-auto p-4 bg-gray-950/20">
                        {#if logEventsLoading}
                            <div
                                class="h-40 flex items-center justify-center text-gray-400 text-sm animate-pulse"
                            >
                                <span class="animate-spin mr-2">⟳</span> Loading
                                events...
                            </div>
                        {:else if logEvents.length === 0}
                            <div
                                class="h-40 flex items-center justify-center text-gray-500 text-sm italic"
                            >
                                No events found.
                            </div>
                        {:else}
                            <div class="font-mono space-y-2">
                                {#each logEvents as event}
                                    <div
                                        class="group hover:bg-gray-800/40 p-2 rounded flex gap-4 transition-colors"
                                    >
                                        <div
                                            class="text-[10px] text-gray-500 whitespace-nowrap pt-0.5 select-none"
                                        >
                                            {event.timestamp}
                                        </div>
                                        <div
                                            class="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed flex-1"
                                        >
                                            {event.message}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {:else if selectedGroupForStreams}
            <div class="h-full flex flex-col p-4 bg-gray-950">
                <div
                    class="mb-4 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm flex items-center gap-3 shrink-0"
                >
                    <button
                        onclick={() => {
                            goto("?");
                        }}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back</button
                    >
                    <span class="text-sm font-bold text-gray-200"
                        >{selectedGroupForStreams}</span
                    >
                    <button
                        onclick={() => deleteLogGroup(selectedGroupForStreams)}
                        class="text-xs text-red-400 hover:text-red-300 transition px-3 py-1.5 rounded bg-red-600/10 hover:bg-red-600/20 border border-red-900/30 ml-auto"
                        >Delete Log Group</button
                    >
                </div>

                <PaginatedTable
                    items={logStreams}
                    loading={logStreamsLoading}
                    hasNext={!!logStreamsCurrentToken}
                    hasPrev={logStreamsTokenMap.length > 0}
                    onNext={() =>
                        loadLogStreams(
                            selectedGroupForStreams,
                            logStreamsCurrentToken,
                        )}
                    onPrev={() =>
                        loadLogStreams(
                            selectedGroupForStreams,
                            popToken(logStreamsTokenMap),
                        )}
                    onRefresh={() => {
                        logStreamsTokenMap = [];
                        loadLogStreams(selectedGroupForStreams);
                    }}
                    columns={[
                        {
                            key: "name",
                            label: "Log Stream Name",
                            onClick: (item) => {
                                const params = new URLSearchParams($page.url.searchParams);
                                params.set("stream", item.name);
                                goto(`?${params.toString()}`);
                            },
                        },
                        { key: "creationTime", label: "Creation Time" },
                        { key: "lastEventTime", label: "Last Event Time" },
                        {
                            key: "storedBytes",
                            label: "Size",
                            format: formatBytes,
                        },
                    ]}
                >
                    {#snippet headerActionsSnippet()}
                        <div class="flex items-center gap-3 pr-2">
                            <!-- Prefix search hidden as requested -->
                            <button
                                onclick={() =>
                                    setRetention(selectedGroupForStreams)}
                                class="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded transition font-bold"
                                >Retention</button
                            >
                            <div class="w-px h-6 bg-gray-700 mx-1"></div>
                            <button
                                onclick={() =>
                                    createLogStream(selectedGroupForStreams)}
                                class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition font-bold shadow-sm"
                                >+ Create Stream</button
                            >
                        </div>
                    {/snippet}
                    {#snippet actionsSnippet(item)}
                        <button
                            onclick={(e) => {
                                e.stopPropagation();
                                deleteLogStream(
                                    selectedGroupForStreams,
                                    item.name,
                                );
                            }}
                            class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                            >Delete</button
                        >
                    {/snippet}
                </PaginatedTable>
            </div>
        {:else}
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
                            goto(`?group=${encodeURIComponent(item.name)}`);
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
                        >+ Create Log Group</button
                    >
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <div class="flex gap-1 justify-end">
                        <button
                            onclick={(e) => {
                                e.stopPropagation();
                                deleteLogGroup(item.name);
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
