<script lang="ts">
    import {
        GetLogEventsCommand,
        FilterLogEventsCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { aws } from "$lib/services/aws.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiRefresh, mdiArrowUp, mdiArrowDown, mdiLoading } from "@mdi/js";
    import JsonLogViewer from "$lib/components/JsonLogViewer.svelte";
    import { tick } from "svelte";

    let {
        logGroupName,
        logStreamName,
        initialTimeMs,
        targetMessage,
    }: {
        logGroupName: string;
        logStreamName: string;
        initialTimeMs?: number;
        targetMessage?: string;
    } = $props();

    let error = $state("");
    let actionMsg = $state("");
    let logEvents = $state<any[]>([]);
    let logEventsLoading = $state(false);
    let logEventsNextToken = $state<string | undefined>(undefined);
    let logEventsPrevToken = $state<string | undefined>(undefined);
    let logEventsFilter = $state("");
    let loadingDirection = $state<"next" | "prev" | "initial" | "none">("none");
    let useLocalTime = $state(true);
    let highlightIndex = $state(-1);

    let scrollContainer: HTMLDivElement;
    let eventEls = $state<(HTMLDivElement | undefined)[]>([]);

    function formatTimestamp(ts: number | undefined) {
        if (!ts) return "-";
        const d = new Date(ts);
        if (useLocalTime) {
            return d.toLocaleString();
        } else {
            return d.toISOString().replace("T", " ").replace("Z", " UTC");
        }
    }

    $effect(() => {
        if (aws.cwLogs && logGroupName && logStreamName) {
            if (initialTimeMs) {
                // Load events in a ±5 minute window around the target timestamp
                loadLogEvents({
                    startTime: initialTimeMs,
                    endTime: initialTimeMs + 300000,
                    scrollToTarget: true,
                });
            } else {
                loadLogEvents();
            }
        }
    });

    // Pick the log event that matches the record clicked in Logs Insights.
    // Prefer an exact timestamp + message match (handles multiple events sharing
    // the same millisecond), then fall back to timestamp, then nearest in time.
    function findTargetIndex(ts: number, msg?: string): number {
        if (logEvents.length === 0) return -1;
        if (msg !== undefined) {
            const exact = logEvents.findIndex(
                (e) => e.timestamp === ts && e.message === msg,
            );
            if (exact >= 0) return exact;
        }
        const exactTs = logEvents.findIndex((e) => e.timestamp === ts);
        if (exactTs >= 0) return exactTs;
        let best = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < logEvents.length; i++) {
            const diff = Math.abs((logEvents[i].timestamp ?? 0) - ts);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = i;
            }
        }
        return best;
    }

    async function loadLogEvents(
        options: {
            token?: string;
            direction?: "next" | "prev";
            startTime?: number;
            endTime?: number;
            scrollToTarget?: boolean;
        } = {},
    ) {
        if (!aws.cwLogs) return;
        const { token, direction = "next", startTime, endTime } = options;
        // The highlight only applies to the initial target load; clear it on any
        // fresh (non-paginated) load so it can't point at a stale row.
        if (!token) highlightIndex = -1;
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
                            // Keep the highlighted row pointing at the same event
                            // now that earlier events shifted its index down.
                            if (highlightIndex >= 0) {
                                highlightIndex += newEvents.length;
                            }
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
                            // Keep the highlighted row pointing at the same event
                            // now that earlier events shifted its index down.
                            if (highlightIndex >= 0) {
                                highlightIndex += newEvents.length;
                            }
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

            // Highlight and scroll to the record that was clicked in Logs Insights
            if (options.scrollToTarget && initialTimeMs) {
                highlightIndex = findTargetIndex(initialTimeMs, targetMessage);
                await tick(); // Wait for the events (and their refs) to render
                eventEls[highlightIndex]?.scrollIntoView({
                    block: "center",
                });
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
                        <Icon path={mdiLoading} size={14} class="animate-spin mr-2" /> Loading events...
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
                                <Icon path={mdiLoading} size={14} class="animate-spin" /> Loading...
                            {:else}
                                <Icon path={mdiArrowUp} size={14} /> Load older events
                            {/if}
                        </button>

                        {#each logEvents as event, i}
                            <div
                                bind:this={eventEls[i]}
                                class="group p-1.5 rounded flex gap-4 transition-colors w-full {i ===
                                highlightIndex
                                    ? 'bg-yellow-500/15 ring-1 ring-yellow-500/40'
                                    : 'hover:bg-gray-800/40'}"
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
                                <Icon path={mdiLoading} size={14} class="animate-spin" /> Loading...
                            {:else}
                                Load newer events <Icon path={mdiArrowDown} size={14} />
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
