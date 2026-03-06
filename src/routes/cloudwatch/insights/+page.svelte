<script lang="ts">
    import {
        DescribeLogGroupsCommand,
        StartQueryCommand,
        GetQueryResultsCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { formatBytes } from "$lib/utils/pagination";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let error = $state("");
    let actionMsg = $state("");

    let logGroups = $state<any[]>([]);
    let lgLoading = $state(false);
    let selectedLogGroup = $state("");
    let logQuery = $state(
        "fields @timestamp, @message\n| sort @timestamp desc\n| limit 20",
    );
    let logResults = $state<any[]>([]);
    let logColumns = $state<string[]>([]);
    let logQueryLoading = $state(false);
    let timeRange = $state(3600); // 1 hour default

    $effect(() => {
        if (aws.cwLogs && logGroups.length === 0) {
            loadLogGroups();
        }
    });

    async function loadLogGroups() {
        if (!aws.cwLogs) return;
        try {
            lgLoading = true;
            error = "";
            actionMsg = "";
            logGroups = [];
            let nextToken: string | undefined = undefined;
            do {
                const resp: any = await aws.cwLogs.send(
                    new DescribeLogGroupsCommand({ limit: 50, nextToken }),
                );
                const page = (resp.logGroups ?? []).map((g: any) => ({
                    name: g.logGroupName ?? "",
                    storedBytes: g.storedBytes ?? 0,
                    retentionDays: g.retentionInDays ?? "Never expire",
                }));
                logGroups = [...logGroups, ...page];
                nextToken = resp.nextToken;
            } while (nextToken);
        } catch (e) {
            error = String(e);
        } finally {
            lgLoading = false;
        }
    }

    async function runInsightsQuery() {
        if (!aws.cwLogs || !selectedLogGroup || !logQuery.trim()) return;
        try {
            logQueryLoading = true;
            error = "";
            logResults = [];
            logColumns = [];
            actionMsg = "";
            const now = Math.floor(Date.now() / 1000);
            const startResp = await aws.cwLogs.send(
                new StartQueryCommand({
                    logGroupName: selectedLogGroup,
                    queryString: logQuery,
                    startTime: now - timeRange,
                    endTime: now,
                }),
            );
            const queryId = startResp.queryId;
            if (!queryId) throw new Error("No queryId returned");

            let status = "Running";
            let results: any[] = [];
            while (status === "Running" || status === "Scheduled") {
                await new Promise((r) => setTimeout(r, 1000));
                const getResp = await aws.cwLogs.send(
                    new GetQueryResultsCommand({ queryId }),
                );
                status = getResp.status ?? "Complete";
                if (status === "Complete") {
                    results = getResp.results ?? [];
                    break;
                } else if (status === "Failed" || status === "Cancelled") {
                    throw new Error(`Query ${status}`);
                }
            }

            if (results.length > 0) {
                const firstRow = results[0];
                logColumns = firstRow.map((f: any) => f.field || "");
                logResults = results.map((row) => {
                    const obj: any = {};
                    row.forEach((f: any) => {
                        obj[f.field || "unknown"] = f.value;
                    });
                    return obj;
                });
            } else {
                actionMsg = "Query completed. No results found.";
            }
        } catch (e) {
            error = String(e);
        } finally {
            logQueryLoading = false;
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
        class="flex-1 p-4 flex flex-col gap-4 {error || actionMsg
            ? 'pt-8'
            : ''}"
    >
        <div
            class="bg-gray-900 border border-gray-800 p-4 rounded-lg shadow-sm shrink-0"
        >
            <div class="flex gap-4 mb-4 flex-wrap">
                <div class="flex-1 min-w-[300px]">
                    <label
                        for="log-group-select"
                        class="block text-xs text-gray-400 font-bold mb-1 uppercase tracking-wider"
                        >Log Group</label
                    >
                    <div class="relative">
                        <select
                            id="log-group-select"
                            bind:value={selectedLogGroup}
                            class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 appearance-none"
                        >
                            <option value="" disabled selected
                                >Select a Log Group</option
                            >
                            {#if lgLoading}
                                <option value="">Loading...</option>
                            {/if}
                            {#each logGroups as lg}
                                <option value={lg.name}>{lg.name}</option>
                            {/each}
                        </select>
                        <div
                            class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"
                        >
                            <svg
                                class="fill-current h-4 w-4"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                ><path
                                    d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"
                                /></svg
                            >
                        </div>
                    </div>
                </div>
                <div class="w-48">
                    <label
                        for="time-range-select"
                        class="block text-xs text-gray-400 font-bold mb-1 uppercase tracking-wider"
                        >Time Range</label
                    >
                    <div class="relative">
                        <select
                            id="time-range-select"
                            bind:value={timeRange}
                            class="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 appearance-none"
                        >
                            <option value={900}>Last 15 minutes</option>
                            <option value={3600}>Last 1 hour</option>
                            <option value={10800}>Last 3 hours</option>
                            <option value={43200}>Last 12 hours</option>
                            <option value={86400}>Last 24 hours</option>
                            <option value={604800}>Last 1 week</option>
                        </select>
                        <div
                            class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"
                        >
                            <svg
                                class="fill-current h-4 w-4"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                ><path
                                    d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"
                                /></svg
                            >
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <label
                    for="query-textarea"
                    class="block text-xs text-gray-400 font-bold mb-1 uppercase tracking-wider flex justify-between items-center"
                >
                    <span>CloudWatch Logs Insights Query</span>
                    <button
                        onclick={runInsightsQuery}
                        disabled={logQueryLoading || !selectedLogGroup}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded transition font-bold tracking-normal uppercase disabled:opacity-50 flex items-center gap-2 shadow-sm"
                    >
                        {#if logQueryLoading}
                            <svg
                                class="animate-spin h-4 w-4 text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                ></circle>
                                <path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                            Running...
                        {:else}
                            Run Query
                        {/if}
                    </button>
                </label>
                <textarea
                    id="query-textarea"
                    bind:value={logQuery}
                    rows="5"
                    class="w-full bg-gray-950/50 border border-gray-700 rounded-lg p-3 text-sm font-mono text-blue-300 outline-none focus:border-blue-500 resize-y shadow-inner mt-2"
                    placeholder="fields @timestamp, @message | sort @timestamp desc | limit 20"
                ></textarea>
            </div>
        </div>

        <div
            class="flex-1 bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col"
        >
            <div
                class="px-4 py-3 border-b border-gray-800 bg-gray-900/80 shrink-0 flex justify-between items-center"
            >
                <h3
                    class="text-xs font-bold text-gray-400 uppercase tracking-wider"
                >
                    Query Results
                    {#if logResults.length > 0}
                        <span class="text-blue-400 font-bold ml-2"
                            >({logResults.length} records)</span
                        >
                    {/if}
                </h3>
            </div>
            <div class="flex-1 overflow-auto bg-gray-950/20">
                {#if logQueryLoading}
                    <div
                        class="h-64 flex flex-col items-center justify-center text-gray-400 text-sm"
                    >
                        <div class="animate-spin text-2xl mb-4">⟳</div>
                        Executing Query... This may take a moment.
                    </div>
                {:else if logResults.length > 0}
                    <div class="overflow-x-auto">
                        <table
                            class="w-full text-left text-sm whitespace-nowrap"
                        >
                            <thead
                                class="sticky top-0 bg-gray-900 border-b border-gray-800 shadow-sm z-10"
                            >
                                <tr>
                                    {#each logColumns as col}
                                        <th
                                            class="px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider"
                                        >
                                            {col}
                                        </th>
                                    {/each}
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-800/50">
                                {#each logResults as row}
                                    <tr
                                        class="hover:bg-gray-800/40 transition-colors group"
                                    >
                                        {#each logColumns as col}
                                            <td
                                                class="px-4 py-2.5 text-gray-300 group-hover:text-gray-200 font-mono text-xs {col ===
                                                '@message'
                                                    ? 'whitespace-pre-wrap min-w-[400px]'
                                                    : ''}"
                                            >
                                                {row[col] ?? "-"}
                                            </td>
                                        {/each}
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {:else if !logQueryLoading && selectedLogGroup && actionMsg.includes("completed")}
                    <div
                        class="h-64 flex items-center justify-center text-gray-500 text-sm"
                    >
                        No results found for this query in the selected time
                        range.
                    </div>
                {:else}
                    <div
                        class="h-full flex flex-col items-center justify-center p-12 text-center text-gray-600"
                    >
                        <div
                            class="w-16 h-16 mb-4 bg-gray-900 rounded-full flex items-center justify-center border border-gray-800"
                        >
                            <svg
                                class="w-8 h-8 opacity-50"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                                ><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="1.5"
                                    d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                ></path></svg
                            >
                        </div>
                        <p class="max-w-xs text-sm">
                            Select a log group and run a query to view results.
                        </p>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
