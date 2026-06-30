<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading, mdiArrowUp, mdiArrowDown } from "@mdi/js";

    import {
        DescribeLogGroupsCommand,
        StartQueryCommand,
        GetQueryResultsCommand,
        DescribeQueryDefinitionsCommand,
        PutQueryDefinitionCommand,
        GetLogGroupFieldsCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import DetailLayout from "$lib/components/DetailLayout.svelte";
    import JsonLogViewer from "$lib/components/JsonLogViewer.svelte";
    import InsightsQueryEditor from "$lib/components/InsightsQueryEditor.svelte";
    import Select from "$lib/components/Select.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import LogStreamViewer from "$lib/components/LogStreamViewer.svelte";

    let error = $state("");
    let actionMsg = $state("");

    let logGroups = $state<any[]>([]);
    let lgLoading = $state(false);

    // Read initial state from URL params
    const initialGroups = $page.url.searchParams.get("groups");
    const initialQuery = $page.url.searchParams.get("query");
    const initialTimeRange = $page.url.searchParams.get("timeRange");

    let selectedLogGroups = $state<string[]>(
        initialGroups ? initialGroups.split(",").filter(Boolean) : [],
    );
    let logQuery = $state(
        initialQuery ||
            "fields @timestamp, @logStream, @message\n| sort @timestamp desc\n| limit 20",
    );
    let logResults = $state<any[]>([]);
    let logColumns = $state<string[]>([]);
    let logQueryLoading = $state(false);
    let timeRange = $state(initialTimeRange ? parseInt(initialTimeRange) : 3600);

    let savedQueries = $state<any[]>([]);
    let selectedSavedQueryId = $state("");

    const HISTORY_STORAGE_KEY = "aws-console:cloudwatch:insights:history";
    let queryHistory = $state<{query: string, groups: string[], timeRange: number}[]>([]);
    
    let showLogModal = $state(false);
    let selectedLogRow = $state<any>(null);

    let knownFields = $state<any[]>([]);
    let fieldsLoading = $state(false);

    let sortColumn = $state("");
    let sortDirection = $state<"asc" | "desc">("desc");

    // Session storage key
    const STORAGE_KEY = "aws-console:cloudwatch:insights:results";

    function saveResultsToSession() {
        if (typeof sessionStorage === "undefined") return;
        const data = {
            results: logResults,
            columns: logColumns,
            params: {
                groups: selectedLogGroups,
                query: logQuery,
                timeRange: timeRange,
            },
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function loadResultsFromSession() {
        if (typeof sessionStorage === "undefined") return;
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        try {
            const data = JSON.parse(stored);
            // Only restore if the parameters match the current URL state
            const currentParams = {
                groups: selectedLogGroups,
                query: logQuery,
                timeRange: timeRange,
            };

            if (JSON.stringify(data.params) === JSON.stringify(currentParams)) {
                logResults = data.results || [];
                logColumns = data.columns || [];
            }
        } catch (e) {
            console.error("Failed to load results from session storage", e);
        }
    }

    // Sync state to URL so back button works
    import { untrack, onMount } from "svelte";
    $effect(() => {
        const params = new URLSearchParams();
        if (selectedLogGroups.length > 0)
            params.set("groups", selectedLogGroups.join(","));
        if (
            logQuery &&
            logQuery !==
                "fields @timestamp, @logStream, @message\n| sort @timestamp desc\n| limit 20"
        )
            params.set("query", logQuery);
        if (timeRange !== 3600) params.set("timeRange", String(timeRange));
        const qs = params.toString();
        const newUrl = qs
            ? `/cloudwatch/insights?${qs}`
            : "/cloudwatch/insights";
        untrack(() => {
            const currentUrl = $page.url.pathname + $page.url.search;
            if (newUrl !== currentUrl) {
                history.replaceState(history.state, "", newUrl);
            }
        });
    });

    onMount(() => {
        loadResultsFromSession();
        try {
            const h = localStorage.getItem(HISTORY_STORAGE_KEY);
            if (h) {
                const parsed = JSON.parse(h);
                queryHistory = parsed.map((entry: any) => typeof entry === "string" ? {query: entry, groups: [], timeRange: 3600} : entry);
            }
        } catch (e) {}
    });

    let __initLoaded = false;
    $effect(() => {
        if (aws.cwLogs && !__initLoaded && !lgLoading) {
            __initLoaded = true;
            loadLogGroups();
            fetchSavedQueries();
        }
    });

    $effect(() => {
        if (selectedLogGroups.length > 0) {
            fetchFields();
        }
    });

    async function loadLogGroups() {
        if (!aws.cwLogs || lgLoading) return;
        try {
            lgLoading = true;
            error = "";
            actionMsg = "";
            const allGroups: any[] = [];
            let nextToken: string | undefined = undefined;
            let pageCount = 0;
            const maxPages = 10; // Load up to 500 groups (50 per page) for performance

            do {
                const resp: any = await aws.cwLogs.send(
                    new DescribeLogGroupsCommand({ limit: 50, nextToken }),
                );
                const page = (resp.logGroups ?? []).map((g: any) => ({
                    name: g.logGroupName ?? "",
                    storedBytes: g.storedBytes ?? 0,
                    retentionDays: g.retentionInDays ?? "Never expire",
                }));
                allGroups.push(...page);
                nextToken = resp.nextToken;
                pageCount++;
            } while (nextToken && pageCount < maxPages);

            logGroups = allGroups;
        } catch (e) {
            error = String(e);
        } finally {
            lgLoading = false;
        }
    }

    async function fetchSavedQueries() {
        if (!aws.cwLogs) return;
        try {
            const resp = await aws.cwLogs.send(
                new DescribeQueryDefinitionsCommand({}),
            );
            savedQueries = resp.queryDefinitions ?? [];
        } catch (e) {
            console.error("Failed to fetch saved queries", e);
        }
    }

    async function saveQuery() {
        if (!aws.cwLogs || !logQuery.trim()) return;
        const name = prompt("Enter a name for this query:");
        if (!name) return;
        try {
            await aws.cwLogs.send(
                new PutQueryDefinitionCommand({
                    name,
                    queryString: logQuery,
                    logGroupNames: selectedLogGroups,
                }),
            );
            actionMsg = `Query "${name}" saved successfully.`;
            await fetchSavedQueries();
        } catch (e) {
            error = String(e);
        }
    }

    async function fetchFields() {
        if (!aws.cwLogs || selectedLogGroups.length === 0) return;
        try {
            fieldsLoading = true;
            const now = Math.floor(Date.now() / 1000);
            const resp = await aws.cwLogs.send(
                new GetLogGroupFieldsCommand({
                    logGroupName: selectedLogGroups[0], // Can only fetch fields for one log group at a time via this API
                    time: now - 3600, // Look at last hour
                }),
            );
            knownFields = resp.logGroupFields ?? [];
        } catch (e) {
            console.error("Failed to fetch fields", e);
        } finally {
            fieldsLoading = false;
        }
    }

    function sortResults(column: string) {
        if (sortColumn === column) {
            sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
            sortColumn = column;
            sortDirection = "desc";
        }

        logResults = [...logResults].sort((a, b) => {
            const valA = a[column] ?? "";
            const valB = b[column] ?? "";
            if (valA < valB) return sortDirection === "asc" ? -1 : 1;
            if (valA > valB) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });
    }

    function navigateToLog(row: any) {
        selectedLogRow = row;
        showLogModal = true;
    }
    function _oldNavigateToLog(row: any) {
        let group =
            row["@logGroup"] ||
            (selectedLogGroups.length === 1 ? selectedLogGroups[0] : null);
        const stream = row["@logStream"];
        const timestamp = row["@timestamp"];
        if (group && stream) {
            let url = `/cloudwatch/logs/${encodeURIComponent(group)}/${encodeURIComponent(stream)}`;
            if (timestamp) {
                const timeMs = new Date(timestamp + "Z").getTime();
                url += `?time=${timeMs}`;
            }
            goto(url);
        }
    }

    let stopQueryFlag = $state(false);
    let queryStatus = $state("");

    async function stopQuery() {
        stopQueryFlag = true;
        actionMsg = "Stopping query...";
    }

    async function runInsightsQuery() {
        if (!aws.cwLogs || selectedLogGroups.length === 0 || !logQuery.trim())
            return;
        try {
            logQueryLoading = true;
            stopQueryFlag = false;
            queryStatus = "Starting...";
            error = "";
            logResults = [];
            logColumns = [];
            actionMsg = "";
            const now = Math.floor(Date.now() / 1000);
            const startResp = await aws.cwLogs.send(
                new StartQueryCommand({
                    logGroupNames: selectedLogGroups,
                    queryString: logQuery,
                    startTime: now - timeRange,
                    endTime: now,
                }),
            );
            const queryId = startResp.queryId;
            const newEntry = { query: logQuery, groups: selectedLogGroups, timeRange: timeRange };
            queryHistory = [newEntry, ...queryHistory.filter(q => q.query !== logQuery || JSON.stringify(q.groups) !== JSON.stringify(selectedLogGroups) || q.timeRange !== timeRange)].slice(0, 50);
            try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(queryHistory)); } catch(e){}
            if (!queryId) throw new Error("No queryId returned");

            let status = "Running";
            let results: any[] = [];
            let pollCount = 0;
            const maxPolls = 120; // 2 minutes max polling (1s intervals)

            while (status === "Running" || status === "Scheduled") {
                if (stopQueryFlag) {
                    status = "Cancelled";
                    actionMsg = "Query execution stopped by user.";
                    break;
                }

                pollCount++;
                if (pollCount > maxPolls) {
                    status = "TimedOut";
                    error =
                        "Query timed out after 2 minutes. Try a smaller time range or more specific query.";
                    break;
                }

                await new Promise((r) => setTimeout(r, 1000));
                const getResp = await aws.cwLogs.send(
                    new GetQueryResultsCommand({ queryId }),
                );
                status = getResp.status ?? "Complete";
                queryStatus = status;

                if (status === "Complete") {
                    results = getResp.results ?? [];
                    break;
                } else if (
                    status === "Failed" ||
                    status === "Cancelled" ||
                    status === "Timeout" ||
                    status === "Unknown"
                ) {
                    throw new Error(`Query ${status}`);
                }
            }

            if (results.length > 0) {
                // Limit to 1000 results for UI performance
                const displayResults = results.slice(0, 1000);
                if (results.length > 1000) {
                    actionMsg = `Query returned ${results.length} results. Displaying first 1,000.`;
                }

                const firstRow = displayResults[0];
                logColumns = firstRow
                    .map((f: any) => f.field || "")
                    .filter((col: string) => col !== "@ptr");
                logResults = displayResults.map((row) => {
                    const obj: any = {};
                    row.forEach((f: any) => {
                        obj[f.field || "unknown"] = f.value;
                    });
                    return obj;
                });
                saveResultsToSession();
            } else if (status === "Complete") {
                actionMsg = "Query completed. No results found.";
            }
        } catch (e) {
            error = String(e);
        } finally {
            logQueryLoading = false;
            queryStatus = "";
        }
    }
    let isSidebarCollapsed = $state(false);
    let queryCollapsed = $state(false);
    let fieldsCollapsed = $state(false);
    let sidebarTab = $state<"fields" | "history">("fields");
</script>

<div class="h-full flex flex-col overflow-hidden">
<TabBar
    tabs={[
        { id: "alarms", label: "Alarms", href: "/cloudwatch/alarms" },
        { id: "metrics", label: "Metrics", href: "/cloudwatch/metrics" },
        { id: "logs", label: "Log Groups", href: "/cloudwatch/logs" },
        { id: "insights", label: "Logs Insights", href: "/cloudwatch/insights" },
    ]}
    activeTab="insights"
/>
<div class="flex-1 overflow-hidden relative">
<DetailLayout
    title="Insights"
    hideTitle={true}
    fullWidth={true}
    bind:isSidebarCollapsed
    {error}
    {actionMsg}
>
    {#snippet mainSnippet()}
        <div
            class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm"
        >
            <!-- Mobile collapse header -->
            <button
                class="md:hidden w-full flex items-center justify-between px-4 py-3 border-b border-gray-800 text-left"
                onclick={() => (queryCollapsed = !queryCollapsed)}
                aria-expanded={!queryCollapsed}
            >
                <span class="text-xs font-bold text-gray-300 uppercase tracking-wider">Query Editor</span>
                <svg
                    class="w-4 h-4 text-gray-500 transition-transform duration-200 {queryCollapsed ? '' : 'rotate-180'}"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div class="{queryCollapsed ? 'hidden' : ''} md:block p-4">
            <div class="flex gap-4 mb-4 flex-wrap">
                <div class="flex-1 min-w-[300px]">
                    <label
                        for="log-group-select"
                        class="block text-xs text-gray-300 font-bold mb-1 uppercase tracking-wider"
                        >Log Groups</label
                    >
                    <div class="flex flex-col gap-2">
                        <div class="relative">
                            <Select
                                placeholder="Select log groups to add..."
                                options={logGroups
                                    .filter((g) => !selectedLogGroups.includes(g.name))
                                    .map((g) => g.name)}
                                value=""
                                searchable={true}
                                onchange={(val) => {
                                    if (val && !selectedLogGroups.includes(val)) {
                                        selectedLogGroups = [...selectedLogGroups, val];
                                    }
                                }}
                            />
                        </div>
                        {#if selectedLogGroups.length > 0}
                            <div class="flex flex-wrap gap-2">
                                {#each selectedLogGroups as group (group)}
                                     <div
                                         class="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-full px-3 py-1 text-xs text-gray-300 shadow-sm"
                                    >
                                        <span
                                            class="whitespace-normal break-all line-clamp-3 overflow-hidden max-w-[300px]"
                                            title={group}>{group}</span
                                        >
                                        <button
                                            class="hover:text-red-400 focus:outline-none ml-1 opacity-70 hover:opacity-100 transition-opacity"
                                            onclick={() =>
                                                (selectedLogGroups =
                                                    selectedLogGroups.filter(
                                                        (g) => g !== group,
                                                    ))}
                                            aria-label="Remove {group}"
                                        >
                                            <svg
                                                class="w-3 h-3 text-current"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                xmlns="http://www.w3.org/2000/svg"
                                                ><path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M6 18L18 6M6 6l12 12"
                                                ></path></svg
                                            >
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="w-48">
                    <label
                        for="time-range-select"
                        class="block text-xs text-gray-300 font-bold mb-1 uppercase tracking-wider"
                        >Time Range</label
                    >
                    <div class="relative">
                        <Select
                            id="time-range-select"
                            bind:value={timeRange}
                            options={[
                                { value: 900, label: "Last 15 minutes" },
                                { value: 3600, label: "Last 1 hour" },
                                { value: 10800, label: "Last 3 hours" },
                                { value: 43200, label: "Last 12 hours" },
                                { value: 86400, label: "Last 24 hours" },
                                { value: 604800, label: "Last 1 week" },
                            ]}
                        />
                    </div>
                </div>
            </div>

            <div>
                <div class="flex justify-between items-end mb-1">
                    <div class="flex-1 max-w-sm mr-4">
                        <label
                            for="saved-query-select"
                            class="block text-xs text-gray-300 font-bold uppercase tracking-wider mb-1"
                        >
                            Saved Queries
                        </label>
                        <div class="flex gap-2">
                            <div class="relative flex-1">
                                <Select
                                    id="saved-query-select"
                                    placeholder="Select a saved query"
                                    bind:value={selectedSavedQueryId}
                                    options={savedQueries.map((sq) => ({
                                        value: sq.queryDefinitionId,
                                        label: sq.name,
                                    }))}
                                    onchange={() => {
                                        const q = savedQueries.find(
                                            (sq) =>
                                                sq.queryDefinitionId ===
                                                selectedSavedQueryId,
                                        );
                                        if (q) {
                                            logQuery = q.queryString || "";
                                            if (
                                                q.logGroupNames &&
                                                q.logGroupNames.length > 0
                                            ) {
                                                selectedLogGroups =
                                                    q.logGroupNames;
                                            }
                                        }
                                    }}
                                />
                            </div>
                            <button
                                onclick={saveQuery}
                                disabled={!logQuery.trim()}
                                class="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded transition font-bold uppercase text-xs flex items-center shadow-sm border border-gray-700"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        {#if logQueryLoading}
                            <button
                                onclick={stopQuery}
                                class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded transition font-bold uppercase text-xs flex items-center shadow-sm"
                            >
                                Stop
                            </button>
                        {/if}
                        <button
                            onclick={runInsightsQuery}
                            disabled={logQueryLoading ||
                                selectedLogGroups.length === 0}
                            class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded transition font-bold tracking-normal uppercase disabled:opacity-50 flex items-center gap-2 shadow-sm h-[38px]"
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
                                {queryStatus || "Running..."}
                            {:else}
                                Run Query
                            {/if}
                        </button>
                    </div>
                </div>
                <div class="mt-2">
                    <InsightsQueryEditor
                        bind:value={logQuery}
                        fields={knownFields}
                        onrun={runInsightsQuery}
                    />
                    <div class="text-[10px] text-gray-600 mt-1 text-right">
                        Press <kbd class="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">Ctrl+Enter</kbd> to run query
                    </div>
                </div>
            </div>
            </div><!-- end collapsible query body -->
        </div>
    {/snippet}

    {#snippet sidebarSnippet()}
        <div
            class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm flex flex-col h-full"
        >
            <!-- Always-visible header -->
            <div class="w-full flex items-center justify-between px-4 border-b border-gray-800 bg-gray-900/80 shrink-0 text-left">
                <div class="flex gap-4">
                    <button class="py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 {sidebarTab === 'fields' ? 'text-blue-400 border-blue-500' : 'text-gray-400 border-transparent hover:text-gray-300'}" onclick={() => sidebarTab = 'fields'}>Fields</button>
                    <button class="py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 {sidebarTab === 'history' ? 'text-blue-400 border-blue-500' : 'text-gray-400 border-transparent hover:text-gray-300'}" onclick={() => sidebarTab = 'history'}>History</button>
                </div>
                <button
                    class="md:hidden"
                    onclick={() => (fieldsCollapsed = !fieldsCollapsed)}
                    aria-expanded={!fieldsCollapsed}
                >
                    <svg class="w-4 h-4 text-gray-500 transition-transform duration-200 {fieldsCollapsed ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
            </div>
            <div class="{fieldsCollapsed ? 'hidden' : ''} md:block p-4 overflow-y-auto flex-1" style="max-height: 300px;">
                {#if sidebarTab === "fields"}
                    {#if fieldsLoading}
                    <div class="text-xs text-gray-500 animate-pulse">
                        Loading fields...
                    </div>
                {:else if knownFields.length === 0}
                    <div class="text-xs text-gray-500 italic">
                        No fields found for this group.
                    </div>
                {:else}
                    <ul class="space-y-2">
                        {#each knownFields as field}
                            <li class="group">
                                <button
                                    onclick={() => {
                                        logQuery += `\n| filter ${field.name} = ""`;
                                    }}
                                    class="text-xs text-blue-400 hover:text-blue-300 truncate w-full text-left font-mono"
                                    title={field.name}
                                >
                                    {field.name}
                                </button>
                                <div class="text-[10px] text-gray-500">
                                    {field.percent}% of events
                                </div>
                            </li>
                        {/each}
                    </ul>
                {/if}
                {:else}
                    {#if queryHistory.length === 0}
                        <div class="text-xs text-gray-500 italic">No recent queries.</div>
                    {:else}
                        <ul class="space-y-3">
                            {#each queryHistory as hEntry}
                                <li class="group relative">
                                    <button
                                        onclick={() => { logQuery = hEntry.query; selectedLogGroups = hEntry.groups; timeRange = hEntry.timeRange; }}
                                        class="text-[11px] text-gray-300 hover:text-blue-300 text-left font-mono bg-gray-950 p-2 rounded w-full border border-gray-800 hover:border-blue-500/50 transition pr-8"
                                    >
                                        <div class="line-clamp-3 whitespace-pre-wrap break-all mb-1">{hEntry.query}</div>
                                        <div class="text-[9px] text-gray-500 font-sans flex items-center gap-2 mt-2 pt-1 border-t border-gray-800/50">
                                            <span class="truncate flex-1 font-semibold" title={hEntry.groups.join(", ")}>{hEntry.groups.join(", ")}</span>
                                            <span class="flex items-center gap-0.5 shrink-0">
                                                <svg class="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                {hEntry.timeRange >= 86400 ? hEntry.timeRange/86400 + 'd' : hEntry.timeRange >= 3600 ? hEntry.timeRange/3600 + 'h' : hEntry.timeRange/60 + 'm'}
                                            </span>
                                        </div>
                                    </button>
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            queryHistory = queryHistory.filter((q) => q !== hEntry);
                                            try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(queryHistory)); } catch(e){}
                                        }}
                                        class="absolute top-2 right-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Remove from history"
                                    >
                                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                {/if}
            </div>
        </div>
    {/snippet}

    {#snippet bottomSnippet()}
        <div
            class="flex-1 bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden flex flex-col min-h-0"
        >
            <div
                class="px-4 py-3 border-b border-gray-800 bg-gray-900/80 shrink-0 flex justify-between items-center"
            >
                <h3
                    class="text-xs font-bold text-gray-300 uppercase tracking-wider"
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
                        <div class="flex flex-col items-center justify-center">
                            <Icon path={mdiLoading} size={32} class="animate-spin mb-4 text-blue-500" />
                        </div>
                        Executing Query... This may take a moment.
                    </div>
                {:else if logResults.length > 0}
                    <table class="w-full text-left text-sm whitespace-nowrap">
                        <thead
                            class="sticky top-0 bg-gray-900 border-b border-gray-800 shadow-sm z-10"
                        >
                            <tr>
                                {#each logColumns as col}
                                    <th
                                        class="px-4 py-3 font-semibold text-gray-300 text-[10px] uppercase tracking-wider cursor-pointer hover:text-gray-200 transition-colors"
                                        onclick={() => sortResults(col)}
                                    >
                                        <div class="flex items-center gap-1">
                                            {col}
                                            {#if sortColumn === col}
                                                <Icon path={sortDirection === "asc" ? mdiArrowUp : mdiArrowDown} size={12} />
                                            {/if}
                                        </div>
                                    </th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800/50">
                            {#each logResults as row}
                                <tr
                                    class="hover:bg-gray-800/30 transition-colors group"
                                >
                                    {#each logColumns as col}
                                        <td
                                            class="px-4 py-2.5 font-mono text-xs select-text {col === '@message' ? 'min-w-[400px] text-gray-300' : col === '@logStream' ? 'text-blue-400' : 'text-gray-300'}"
                                        >
                                            {#if col === "@logStream"}
                                                {@const stream = row[col] ?? ""}
                                                {@const group = row["@logGroup"] || (selectedLogGroups.length === 1 ? selectedLogGroups[0] : null)}
                                                {#if group && stream}
                                                    <button
                                                        class="inline-flex items-center gap-1 hover:text-blue-300 hover:underline underline-offset-2 transition-colors text-left"
                                                        onclick={(e) => { e.stopPropagation(); navigateToLog(row); }}
                                                        title="Open log stream"
                                                    >
                                                        {stream}
                                                        <svg class="w-3 h-3 opacity-60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                    </button>
                                                {:else}
                                                    {stream || "-"}
                                                {/if}
                                            {:else if col === "@message"}
                                                <JsonLogViewer
                                                    message={row[col] ?? ""}
                                                    class="whitespace-pre-wrap max-w-full"
                                                />
                                            {:else}
                                                {row[col] ?? "-"}
                                            {/if}
                                        </td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                {:else if !logQueryLoading && selectedLogGroups.length > 0 && actionMsg.includes("completed")}
                    <div
                        class="h-64 flex items-center justify-center text-gray-500 text-sm"
                    >
                        No results found for this query in the selected time
                        range.
                    </div>
                {:else}
                    <div
                        class="min-h-[256px] flex flex-col items-center justify-center p-12 text-center text-gray-600"
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
    {/snippet}
</DetailLayout>
</div>
</div>

<Modal bind:open={showLogModal} title="Log Details" maxWidth="max-w-6xl" overflowVisible={false}>
    {#if selectedLogRow}
        {@const group = selectedLogRow["@logGroup"] || (selectedLogGroups.length === 1 ? selectedLogGroups[0] : "")}
        {@const stream = selectedLogRow["@logStream"] || ""}
        {@const timeMs = selectedLogRow["@timestamp"] ? new Date(selectedLogRow["@timestamp"] + "Z").getTime() : undefined}
        <div class="h-[600px] flex flex-col -m-5 bg-gray-950">
            <LogStreamViewer logGroupName={group} logStreamName={stream} initialTimeMs={timeMs} targetMessage={selectedLogRow["@message"]} />
        </div>
    {/if}
</Modal>

