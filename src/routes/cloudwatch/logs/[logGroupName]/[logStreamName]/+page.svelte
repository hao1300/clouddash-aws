<script lang="ts">
    import { page } from "$app/stores";
    import {
        GetLogEventsCommand,
        FilterLogEventsCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { aws } from "$lib/services/aws.svelte";
    import { titleService } from "$lib/services/title.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiRefresh } from "@mdi/js";

    import { untrack } from "svelte";

    let logGroupName = $derived($page.params.logGroupName || "");
    let logStreamName = $derived($page.params.logStreamName || "");

    let error = $state("");
    let actionMsg = $state("");
    let logEvents = $state<any[]>([]);
    let logEventsLoading = $state(false);
    let logEventsNextToken = $state<string | undefined>(undefined);
    let logEventsPrevToken = $state<string | undefined>(undefined);
    let logEventsFilter = $state("");
    let loadingDirection = $state<"next" | "prev" | "initial" | "none">("none");
    let useLocalTime = $state(true);

    let scrollContainer: HTMLDivElement;
    import { tick } from "svelte";

    function formatTimestamp(ts: number | undefined) {
        if (!ts) return "-";
        const d = new Date(ts);
        if (useLocalTime) {
            return d.toLocaleString();
        } else {
            return d.toISOString().replace("T", " ").replace("Z", " UTC");
        }
    }

    import JsonLogViewer from "$lib/components/JsonLogViewer.svelte";

    $effect(() => {
        if (aws.cwLogs && logGroupName && logStreamName) {
            const timeParam = $page.url.searchParams.get("time");
            if (timeParam) {
                const timeMs = parseInt(timeParam);
                // Load events in a ±5 minute window around the target timestamp
                loadLogEvents({ startTime: timeMs });
            } else {
                loadLogEvents();
            }
        }
    });

    // Call title service once when component mounts
    $effect(() => {
        if (logGroupName && logStreamName) {
            untrack(() => {
                const path = $page.url.pathname;
                titleService.setResource(
                    logGroupName,
                    `/cloudwatch/logs/${encodeURIComponent(logGroupName)}`,
                    path,
                );
                titleService.addResource(logStreamName, undefined, path);
            });
        }
    });

    async function loadLogEvents(
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
            loadingDirection = token ? direction : "initial";
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
                const newEvents = (resp.events ?? []).map((e) => ({
                    timestamp: e.timestamp,
                    message: e.message ?? "",
                }));

                if (token) {
                    if (direction === "next") {
                        if (newEvents.length > 0) {
                            logEvents = [...logEvents, ...newEvents];
                        }
                    } else if (direction === "prev") {
                        if (newEvents.length > 0) {
                            logEvents = [...newEvents, ...logEvents];
                        }
                    }
                } else {
                    logEvents = newEvents;
                }

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

                const newEvents = (resp.events ?? []).map((e) => ({
                    timestamp: e.timestamp,
                    message: e.message ?? "",
                }));

                if (token) {
                    if (direction === "next") {
                        if (newEvents.length > 0) {
                            logEvents = [...logEvents, ...newEvents];
                        }
                    } else if (direction === "prev") {
                        if (newEvents.length > 0) {
                            logEvents = [...newEvents, ...logEvents];
                        }
                    }
                } else {
                    logEvents = newEvents;
                }

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

            // Restore scroll position when loading older events
            if (token && direction === "prev" && scrollContainer) {
                const oldScrollHeight = scrollContainer.scrollHeight;
                const oldScrollTop = scrollContainer.scrollTop;
                await tick(); // Wait for DOM to update with new events
                const newScrollHeight = scrollContainer.scrollHeight;
                scrollContainer.scrollTop =
                    oldScrollTop + (newScrollHeight - oldScrollHeight);
            }
        } catch (e) {
            error = String(e);
        } finally {
            logEventsLoading = false;
            loadingDirection = "none";
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col bg-gray-950">
    {#if error}
        <div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>
    {/if}
    {#if actionMsg}
        <div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30"
        >
            {actionMsg}
        </div>
    {/if}

    <div
        class="flex-1 flex flex-col min-h-0 {error || actionMsg ? 'pt-8' : ''}"
    >
        <div class="h-full flex flex-col bg-gray-950">
            <div
                class="bg-gray-900 border-b border-gray-800 p-3 flex gap-3 items-center flex-wrap"
            >
                <div class="flex items-center gap-2 flex-1 min-w-[300px]">
                    <input
                        type="text"
                        bind:value={logEventsFilter}
                        onkeydown={(e) => {
                            if (e.key === "Enter") {
                                loadLogEvents();
                            }
                        }}
                        placeholder="Filter pattern..."
                        class="bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-xs outline-none focus:border-blue-500 text-gray-200 flex-1"
                    />
                    <button
                        onclick={() => loadLogEvents()}
                        class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded transition font-bold shadow-sm"
                        >Filter</button
                    >
                    {#if logEventsFilter.trim()}
                        <button
                            onclick={() => {
                                logEventsFilter = "";
                                loadLogEvents();
                            }}
                            class="text-xs text-gray-400 hover:text-white underline px-2"
                            >Clear</button
                        >
                    {/if}
                    <div class="h-4 w-px bg-gray-700 mx-1"></div>
                    <button
                        onclick={() => (useLocalTime = !useLocalTime)}
                        class="text-xs text-gray-400 hover:text-white transition-colors px-2 font-bold select-none"
                        title="Toggle timezone"
                    >
                        {useLocalTime ? "Local Time" : "UTC"}
                    </button>
                </div>
            </div>
            <div bind:this={scrollContainer} class="flex-1 overflow-auto p-4">
                {#if logEventsLoading && loadingDirection === "initial"}
                    <div
                        class="h-40 flex items-center justify-center text-gray-400 text-sm animate-pulse"
                    >
                        <Icon path={mdiRefresh} size={14} class="animate-spin mr-2" /> Loading events...
                    </div>
                {:else if logEvents.length === 0}
                    <div
                        class="h-40 flex items-center justify-center text-gray-500 text-sm italic"
                    >
                        No events found.
                    </div>
                {:else}
                    <div class="font-mono space-y-2 flex flex-col items-center">
                        <button
                            onclick={() =>
                                loadLogEvents({
                                    token: logEventsPrevToken,
                                    direction: "prev",
                                })}
                            disabled={logEventsLoading ||
                                logEventsFilter.trim() !== ""}
                            class="mb-2 text-xs font-bold text-blue-400 hover:text-blue-300 transition disabled:opacity-30 disabled:cursor-not-allowed bg-gray-900 border border-gray-800 rounded px-6 py-2 shadow-sm flex items-center gap-2"
                        >
                            {#if loadingDirection === "prev"}
                                <Icon path={mdiRefresh} size={14} class="animate-spin" /> Loading...
                            {:else}
                                ↑ Load older events
                            {/if}
                        </button>

                        {#each logEvents as event}
                            <div
                                class="group hover:bg-gray-800/40 p-1.5 rounded flex gap-4 transition-colors w-full"
                            >
                                <div
                                    class="text-[10px] text-gray-500 whitespace-nowrap pt-0.5 select-none font-sans mt-[2px]"
                                >
                                    {formatTimestamp(event.timestamp)}
                                </div>
                                <JsonLogViewer
                                    message={event.message}
                                    class="text-xs text-gray-300 flex-1"
                                />
                            </div>
                        {/each}

                        <button
                            onclick={() =>
                                loadLogEvents({
                                    token: logEventsNextToken,
                                    direction: "next",
                                })}
                            disabled={!logEventsNextToken || logEventsLoading}
                            class="mt-4 text-xs font-bold text-blue-400 hover:text-blue-300 transition disabled:opacity-30 disabled:cursor-not-allowed bg-gray-900 border border-gray-800 rounded px-6 py-2 shadow-sm flex items-center gap-2"
                        >
                            {#if loadingDirection === "next"}
                                <Icon path={mdiRefresh} size={14} class="animate-spin" /> Loading...
                            {:else}
                                Load newer events ↓
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
