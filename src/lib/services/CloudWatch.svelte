<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudWatchClient,
        DescribeAlarmsCommand,
        ListDashboardsCommand,
        GetDashboardCommand,
    } from "@aws-sdk/client-cloudwatch";
    import {
        CloudWatchLogsClient,
        DescribeLogGroupsCommand,
        StartQueryCommand,
        GetQueryResultsCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let cwClient: CloudWatchClient | null = null;
    let logsClient: CloudWatchLogsClient | null = null;
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "alarms", label: "Alarms" },
        { id: "dashboards", label: "Dashboards" },
        { id: "logs", label: "Logs Insights" },
    ];
    let activeTab = $state("alarms");

    // --- Pagination Shared Helpers ---
    // Helper to manage token history for "Previous" page navigation
    function pushToken(history: string[], currentNextToken?: string) {
        if (!currentNextToken) return;
        if (history[history.length - 1] !== currentNextToken) {
            history.push(currentNextToken);
        }
    }
    function popToken(history: string[]) {
        history.pop(); // discard current page token
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    // --- Alarms ---
    let alarms = $state<any[]>([]);
    let alarmsLoading = $state(false);
    let alarmsTokenMap = $state<string[]>([]);
    let alarmsCurrentToken = $state<string | undefined>(undefined);

    // --- Dashboards ---
    let dashboards = $state<any[]>([]);
    let dashLoading = $state(false);
    let dashTokenMap = $state<string[]>([]);
    let dashCurrentToken = $state<string | undefined>(undefined);
    let selectedDash = $state("");
    let dashBody = $state("");

    // --- Logs Insights ---
    let logGroups = $state<any[]>([]);
    let lgLoading = $state(false);
    let lgTokenMap = $state<string[]>([]);
    let lgCurrentToken = $state<string | undefined>(undefined);
    let selectedLogGroup = $state("");
    let logQuery = $state(
        "fields @timestamp, @message | sort @timestamp desc | limit 50",
    );
    let logResults = $state<any[]>([]);
    let logColumns = $state<string[]>([]);
    let logQueryLoading = $state(false);
    let timeRange = $state(3600); // seconds

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            const config = {
                region: creds.region || "us-east-1",
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            };
            cwClient = new CloudWatchClient(config);
            logsClient = new CloudWatchLogsClient(config);
            await loadAlarms();
            await loadDashboards();
            await loadLogGroups();
        } catch (e) {
            error = String(e);
        }
    });

    // --- Alarms API ---
    async function loadAlarms(token?: string) {
        if (!cwClient) return;
        try {
            alarmsLoading = true;
            error = "";
            actionMsg = "";
            const resp = await cwClient.send(
                new DescribeAlarmsCommand({ MaxRecords: 50, NextToken: token }),
            );
            alarms = (resp.MetricAlarms ?? []).map((a) => ({
                name: a.AlarmName ?? "Unknown",
                state: a.StateValue ?? "UNKNOWN",
                description: a.AlarmDescription ?? null,
                metric: a.MetricName ?? "",
                namespace: a.Namespace ?? "",
                condition: `${a.ComparisonOperator} ${a.Threshold}`,
                updated: a.StateUpdatedTimestamp?.toISOString(),
            }));
            pushToken(alarmsTokenMap, resp.NextToken);
            alarmsCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            alarmsLoading = false;
        }
    }

    // --- Dashboards API ---
    async function loadDashboards(token?: string) {
        if (!cwClient) return;
        try {
            dashLoading = true;
            error = "";
            actionMsg = "";
            const resp = await cwClient.send(
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

    async function viewDashboard(name: string) {
        if (!cwClient) return;
        try {
            selectedDash = name;
            dashBody = "Loading...";
            const resp = await cwClient.send(
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

    // --- Logs API ---
    async function loadLogGroups(token?: string) {
        if (!logsClient) return;
        try {
            lgLoading = true;
            error = "";
            actionMsg = "";
            const resp = await logsClient.send(
                new DescribeLogGroupsCommand({ limit: 50, nextToken: token }),
            );
            logGroups = (resp.logGroups ?? []).map((g) => ({
                name: g.logGroupName ?? "",
                storedBytes: g.storedBytes ?? 0,
                retentionDays: g.retentionInDays ?? "Never expire",
            }));
            pushToken(lgTokenMap, resp.nextToken);
            lgCurrentToken = resp.nextToken;
        } catch (e) {
            error = String(e);
        } finally {
            lgLoading = false;
        }
    }

    async function runInsightsQuery() {
        if (!logsClient || !selectedLogGroup || !logQuery.trim()) return;
        try {
            logQueryLoading = true;
            error = "";
            logResults = [];
            logColumns = [];
            actionMsg = "";
            const now = Math.floor(Date.now() / 1000);
            const startResp = await logsClient.send(
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
                const getResp = await logsClient.send(
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

            const cols = new Set<string>();
            const rows = results.map((row) => {
                const obj: Record<string, string> = {};
                for (const field of row) {
                    if (field.field && field.field !== "@ptr") {
                        obj[field.field] = field.value ?? "";
                        cols.add(field.field);
                    }
                }
                return obj;
            });
            logColumns = [...cols];
            logResults = rows;
            if (rows.length === 0) actionMsg = "Query returned no results.";
        } catch (e) {
            error = String(e);
        } finally {
            logQueryLoading = false;
        }
    }

    function formatBytes(b: number | string) {
        const num = Number(b);
        if (num === 0 || isNaN(num)) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(num) / Math.log(k));
        return parseFloat((num / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }
</script>

<ServiceLayout title="CloudWatch" {tabs} bind:activeTab>
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

    <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
        {#if activeTab === "alarms"}
            <PaginatedTable
                items={alarms}
                loading={alarmsLoading}
                hasNext={!!alarmsCurrentToken}
                hasPrev={alarmsTokenMap.length > 0}
                onNext={() => loadAlarms(alarmsCurrentToken)}
                onPrev={() => loadAlarms(popToken(alarmsTokenMap))}
                onRefresh={() => {
                    alarmsTokenMap = [];
                    loadAlarms();
                }}
                columns={[
                    {
                        key: "state",
                        label: "State",
                        format: (v) =>
                            v === "ALARM"
                                ? "🔴 ALARM"
                                : v === "OK"
                                  ? "🟢 OK"
                                  : `⚪ ${v}`,
                    },
                    { key: "name", label: "Alarm Name" },
                    { key: "metric", label: "Metric" },
                    { key: "condition", label: "Condition" },
                    {
                        key: "updated",
                        label: "Last Updated",
                        format: (v) => (v ? new Date(v).toLocaleString() : "-"),
                    },
                ]}
            />
        {:else if activeTab === "dashboards"}
            {#if selectedDash}
                <div class="p-4 h-full flex flex-col pt-2">
                    <div class="mb-3 flex items-center gap-2 shrink-0">
                        <button
                            onclick={() => (selectedDash = "")}
                            class="text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded bg-blue-600/10 hover:bg-blue-600/20"
                            >← Back to Dashboards</button
                        >
                        <span class="text-sm font-bold text-gray-200"
                            >{selectedDash}</span
                        >
                    </div>
                    <pre
                        class="flex-1 bg-gray-900 p-4 rounded-lg border border-gray-800 text-xs text-gray-300 overflow-auto whitespace-pre-wrap font-mono relative">{dashBody}</pre>
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
                            format: (v) =>
                                v ? new Date(v).toLocaleString() : "-",
                        },
                    ]}
                >
                    {#snippet actionsSnippet(item)}
                        <button
                            onclick={() => viewDashboard(item.name)}
                            class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                            >View Source</button
                        >
                    {/snippet}
                </PaginatedTable>
            {/if}
        {:else if activeTab === "logs"}
            <div class="h-full flex flex-col p-4 bg-gray-950">
                <!-- Log Groups + Insights Query -->
                <div
                    class="space-y-3 mb-4 shrink-0 bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                >
                    <div class="flex gap-2 items-center">
                        <div class="flex-1 flex gap-2 w-full">
                            <select
                                bind:value={selectedLogGroup}
                                class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                            >
                                <option value="">Select log group...</option>
                                {#each logGroups as g}<option value={g.name}
                                        >{g.name}</option
                                    >{/each}
                            </select>
                            <button
                                onclick={() => loadLogGroups(lgCurrentToken)}
                                disabled={lgLoading || !lgCurrentToken}
                                title="Load more log groups"
                                class="bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-30 px-3 py-1.5 rounded text-xs transition"
                                >More</button
                            >
                        </div>
                        <select
                            bind:value={timeRange}
                            class="bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none w-32 shrink-0"
                        >
                            <option value={900}>Last 15 min</option>
                            <option value={3600}>Last 1 hour</option>
                            <option value={14400}>Last 4 hours</option>
                            <option value={86400}>Last 24 hours</option>
                            <option value={604800}>Last 7 days</option>
                        </select>
                        <button
                            onclick={runInsightsQuery}
                            disabled={!selectedLogGroup || logQueryLoading}
                            class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2 rounded text-xs font-bold transition flex items-center gap-2"
                        >
                            {#if logQueryLoading}<span class="animate-spin"
                                    >⟳</span
                                >{/if}
                            Run Query
                        </button>
                    </div>
                    <textarea
                        bind:value={logQuery}
                        rows="3"
                        placeholder="CloudWatch Logs Insights query..."
                        class="w-full bg-black text-xs p-3 rounded border border-gray-700 text-green-400 font-mono outline-none focus:border-blue-500 resize-none shadow-inner"
                    ></textarea>
                </div>

                <!-- Results -->
                <div
                    class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 flex flex-col shadow-sm overflow-hidden"
                >
                    <div
                        class="px-4 py-2 border-b border-gray-800 bg-gray-900/80 flex justify-between items-center shrink-0"
                    >
                        <h3
                            class="text-xs font-bold text-gray-400 uppercase tracking-widest"
                        >
                            Query Results
                        </h3>
                        <span class="text-xs text-gray-500"
                            >{logResults.length > 0
                                ? `${logResults.length} records`
                                : "No results"}</span
                        >
                    </div>
                    <div class="flex-1 overflow-auto bg-gray-950 p-2">
                        {#if logResults.length > 0}
                            <table class="w-full text-xs text-left">
                                <thead
                                    class="sticky top-0 bg-gray-900 border-b border-gray-800/50 shadow-sm z-10"
                                >
                                    <tr>
                                        {#each logColumns as col}<th
                                                class="px-3 py-2 font-semibold text-gray-300 whitespace-nowrap"
                                                >{col}</th
                                            >{/each}
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each logResults as row}
                                        <tr
                                            class="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors"
                                        >
                                            {#each logColumns as col}<td
                                                    class="px-3 py-1.5 text-gray-400 font-mono truncate max-w-sm"
                                                    title={row[col] ?? ""}
                                                    >{row[col] ?? "-"}</td
                                                >{/each}
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        {:else if logQueryLoading}
                            <div
                                class="h-full flex items-center justify-center text-gray-600 text-sm space-x-2"
                            >
                                <span class="animate-spin text-xl">⟳</span>
                                <span>Executing query...</span>
                            </div>
                        {:else}
                            <div
                                class="h-full flex items-center justify-center text-gray-600 text-sm italic"
                            >
                                Run a query to see logs.
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    </div>
</ServiceLayout>
