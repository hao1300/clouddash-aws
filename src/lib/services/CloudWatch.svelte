<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudWatchClient,
        DescribeAlarmsCommand,
        ListDashboardsCommand,
        GetDashboardCommand,
        ListMetricsCommand,
        DescribeAlarmHistoryCommand,
        GetMetricStatisticsCommand,
    } from "@aws-sdk/client-cloudwatch";
    import {
        CloudWatchLogsClient,
        DescribeLogGroupsCommand,
        StartQueryCommand,
        GetQueryResultsCommand,
        DescribeLogStreamsCommand,
        GetLogEventsCommand,
        FilterLogEventsCommand,
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
        { id: "metrics", label: "Metrics" },
        { id: "dashboards", label: "Dashboards" },
        { id: "loggroups", label: "Log Groups" },
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
    let filteredAlarms = $derived.by(() => {
        let res = alarms;
        if (hideAutoScaling) {
            res = res.filter(
                (a) =>
                    !a.name.startsWith("TargetTracking-") &&
                    !a.name.includes("AutoScaling"),
            );
        }
        return res;
    });
    let alarmsLoading = $state(false);
    let alarmsTokenMap = $state<string[]>([]);
    let alarmsCurrentToken = $state<string | undefined>(undefined);
    let hideAutoScaling = $state(true);
    let selectedAlarm = $state<any>(null);
    let alarmHistory = $state<any[]>([]);
    let alarmHistoryLoading = $state(false);

    // --- Metrics ---
    let metrics = $state<any[]>([]);
    let metricsLoading = $state(false);
    let metricsTokenMap = $state<string[]>([]);
    let metricsCurrentToken = $state<string | undefined>(undefined);
    let selectedMetric = $state<any>(null);
    let metricStats = $state<any[]>([]);
    let metricStatsLoading = $state(false);

    // --- Dashboards ---
    let dashboards = $state<any[]>([]);
    let dashLoading = $state(false);
    let dashTokenMap = $state<string[]>([]);
    let dashCurrentToken = $state<string | undefined>(undefined);
    let selectedDash = $state("");
    let dashBody = $state("");

    // --- Log Groups (Table View) ---
    let logGroupsTable = $state<any[]>([]);
    let logGroupsLoading = $state(false);
    let logGroupsTokenMap = $state<string[]>([]);
    let logGroupsCurrentToken = $state<string | undefined>(undefined);
    let selectedGroupForStreams = $state("");

    // --- Log Streams ---
    let logStreams = $state<any[]>([]);
    let logStreamsLoading = $state(false);
    let logStreamsTokenMap = $state<string[]>([]);
    let logStreamsCurrentToken = $state<string | undefined>(undefined);
    let selectedStreamForEvents = $state("");

    // --- Log Events ---
    let logEvents = $state<any[]>([]);
    let logEventsLoading = $state(false);
    let logEventsNextToken = $state<string | undefined>(undefined);
    let logEventsPrevToken = $state<string | undefined>(undefined);
    let logEventsFilter = $state("");

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
            const storedHide = localStorage.getItem("cw_hideAutoScaling");
            if (storedHide !== null) {
                hideAutoScaling = storedHide === "true";
            }

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
            await loadMetrics();
            await loadDashboards();
            await loadLogGroupsTable();
            await loadLogGroups();
        } catch (e) {
            error = String(e);
        }
    });

    $effect(() => {
        localStorage.setItem("cw_hideAutoScaling", String(hideAutoScaling));
    });

    // --- Alarms API ---
    async function loadAlarmHistory(alarmName: string) {
        if (!cwClient) return;
        try {
            alarmHistoryLoading = true;
            error = "";
            actionMsg = "";
            const resp = await cwClient.send(
                new DescribeAlarmHistoryCommand({
                    AlarmName: alarmName,
                    HistoryItemType: "StateUpdate",
                    MaxRecords: 50,
                })
            );
            alarmHistory = (resp.AlarmHistoryItems ?? []).map((h) => ({
                timestamp: h.Timestamp?.toLocaleString() ?? "",
                summary: h.HistorySummary ?? "",
                data: h.HistoryData ?? "",
            }));
        } catch (e) {
            error = String(e);
        } finally {
            alarmHistoryLoading = false;
        }
    }

    async function loadAlarms(token?: string) {
        if (!cwClient) return;
        try {
            alarmsLoading = true;
            error = "";
            actionMsg = "";
            const resp = await cwClient.send(
                new DescribeAlarmsCommand({ MaxRecords: 50, NextToken: token }),
            );
            let fetched = (resp.MetricAlarms ?? []).map((a) => ({
                name: a.AlarmName ?? "Unknown",
                state: a.StateValue ?? "UNKNOWN",
                description: a.AlarmDescription ?? null,
                metric: a.MetricName ?? "",
                namespace: a.Namespace ?? "",
                condition: `${a.ComparisonOperator} ${a.Threshold}`,
                updated: a.StateUpdatedTimestamp?.toISOString(),
            }));

            // Sort by state (ALARM first, then others)
            fetched.sort((a, b) => {
                if (a.state === "ALARM" && b.state !== "ALARM") return -1;
                if (a.state !== "ALARM" && b.state === "ALARM") return 1;
                return a.name.localeCompare(b.name);
            });

            alarms = fetched;
            pushToken(alarmsTokenMap, resp.NextToken);
            alarmsCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            alarmsLoading = false;
        }
    }

    // --- Metrics API ---
    async function loadMetricStats(metric: any) {
        if (!cwClient) return;
        try {
            selectedMetric = metric;
            metricStatsLoading = true;
            error = "";
            actionMsg = "";

            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

            const resp = await cwClient.send(
                new GetMetricStatisticsCommand({
                    Namespace: metric.namespace,
                    MetricName: metric.metricName,
                    Dimensions: metric.rawDimensions,
                    StartTime: startTime,
                    EndTime: endTime,
                    Period: 3600, // 1 hour periods
                    Statistics: ["Average", "Sum", "Minimum", "Maximum", "SampleCount"],
                })
            );

            metricStats = (resp.Datapoints ?? []).map((dp) => ({
                timestamp: dp.Timestamp?.toLocaleString() ?? "",
                average: dp.Average?.toFixed(2) ?? "-",
                sum: dp.Sum?.toFixed(2) ?? "-",
                min: dp.Minimum?.toFixed(2) ?? "-",
                max: dp.Maximum?.toFixed(2) ?? "-",
                count: dp.SampleCount ?? "-",
                unit: dp.Unit ?? "",
            })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        } catch (e) {
            error = String(e);
        } finally {
            metricStatsLoading = false;
        }
    }

    async function loadMetrics(token?: string) {
        if (!cwClient) return;
        try {
            metricsLoading = true;
            error = "";
            actionMsg = "";
            const resp = await cwClient.send(
                new ListMetricsCommand({ NextToken: token }),
            );
            metrics = (resp.Metrics ?? []).map((m) => ({
                namespace: m.Namespace ?? "",
                metricName: m.MetricName ?? "",
                dimensions: (m.Dimensions ?? []).map((d) => `${d.Name}=${d.Value}`).join(", "),
                rawDimensions: m.Dimensions ?? [],
            }));
            pushToken(metricsTokenMap, resp.NextToken);
            metricsCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            metricsLoading = false;
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

    // --- Log Groups / Streams / Events API ---
    async function loadLogGroupsTable(token?: string) {
        if (!logsClient) return;
        try {
            logGroupsLoading = true;
            error = "";
            actionMsg = "";
            const resp = await logsClient.send(
                new DescribeLogGroupsCommand({ limit: 50, nextToken: token }),
            );
            logGroupsTable = (resp.logGroups ?? []).map((g) => ({
                name: g.logGroupName ?? "",
                storedBytes: g.storedBytes ?? 0,
                retentionDays: g.retentionInDays ?? "Never expire",
                creationTime: g.creationTime ? new Date(g.creationTime).toLocaleString() : "-",
            }));
            pushToken(logGroupsTokenMap, resp.nextToken);
            logGroupsCurrentToken = resp.nextToken;
        } catch (e) {
            error = String(e);
        } finally {
            logGroupsLoading = false;
        }
    }

    async function loadLogStreams(logGroupName: string, token?: string) {
        if (!logsClient) return;
        try {
            selectedGroupForStreams = logGroupName;
            logStreamsLoading = true;
            error = "";
            actionMsg = "";
            const resp = await logsClient.send(
                new DescribeLogStreamsCommand({
                    logGroupName,
                    limit: 50,
                    nextToken: token,
                    orderBy: "LastEventTime",
                    descending: true,
                }),
            );
            logStreams = (resp.logStreams ?? []).map((s) => ({
                name: s.logStreamName ?? "",
                creationTime: s.creationTime ? new Date(s.creationTime).toLocaleString() : "-",
                lastEventTime: s.lastEventTimestamp ? new Date(s.lastEventTimestamp).toLocaleString() : "-",
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

    async function loadLogEvents(logGroupName: string, logStreamName: string, token?: string, direction: "next" | "prev" = "next") {
        if (!logsClient) return;
        try {
            selectedStreamForEvents = logStreamName;
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
                const resp = await logsClient.send(
                    new FilterLogEventsCommand(params),
                );
                logEvents = (resp.events ?? []).map((e) => ({
                    timestamp: e.timestamp ? new Date(e.timestamp).toLocaleString() : "-",
                    message: e.message ?? "",
                }));
                // FilterLogEvents only pages forward
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

                const resp = await logsClient.send(
                    new GetLogEventsCommand(params),
                );

                logEvents = (resp.events ?? []).map((e) => ({
                    timestamp: e.timestamp ? new Date(e.timestamp).toLocaleString() : "-",
                    message: e.message ?? "",
                }));

                // Only update tokens if there are actually events or if it's the first load
                if ((resp.events && resp.events.length > 0) || !token) {
                    logEventsNextToken = resp.nextForwardToken;
                    logEventsPrevToken = resp.nextBackwardToken;
                } else if (resp.events && resp.events.length === 0) {
                     actionMsg = direction === "next" ? "No newer log events found." : "No older log events found.";
                }
            }

        } catch (e) {
            error = String(e);
        } finally {
            logEventsLoading = false;
        }
    }

    // --- Logs API ---
    async function loadLogGroups() {
        if (!logsClient) return;
        try {
            lgLoading = true;
            error = "";
            actionMsg = "";
            logGroups = [];
            let nextToken: string | undefined = undefined;
            do {
                const resp: any = await logsClient.send(
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
            {#if selectedAlarm}
                <div
                    class="h-full flex flex-col p-4 pr-1 bg-gray-950 overflow-auto text-sm"
                >
                    <div
                        class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
                    >
                        <button
                            onclick={() => {
                                selectedAlarm = null;
                            }}
                            class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                            >← Back to Alarms</button
                        >
                        <span
                            class="text-sm font-bold text-gray-200 truncate flex-1"
                            >{selectedAlarm.name}</span
                        >
                    </div>

                    <div
                        class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 shrink-0"
                    >
                        <div
                            class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                        >
                            <div
                                class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                            >
                                State
                            </div>
                            <div
                                class="text-base font-bold {selectedAlarm.state ===
                                'ALARM'
                                    ? 'text-red-400'
                                    : selectedAlarm.state === 'OK'
                                      ? 'text-green-400'
                                      : 'text-yellow-400'}"
                            >
                                {selectedAlarm.state}
                            </div>
                        </div>
                        <div
                            class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                        >
                            <div
                                class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                            >
                                Namespace
                            </div>
                            <div class="text-base font-bold text-gray-200">
                                {selectedAlarm.namespace}
                            </div>
                        </div>
                        <div
                            class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                        >
                            <div
                                class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                            >
                                Metric Name
                            </div>
                            <div class="text-base font-bold text-gray-200">
                                {selectedAlarm.metric}
                            </div>
                        </div>
                        <div
                            class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                        >
                            <div
                                class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                            >
                                Condition
                            </div>
                            <div class="text-base font-bold text-gray-200">
                                {selectedAlarm.condition}
                            </div>
                        </div>
                    </div>

                    {#if selectedAlarm.description}
                        <div
                            class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm shrink-0 mb-6"
                        >
                            <h3
                                class="text-xs text-gray-400 uppercase tracking-widest font-bold mb-2"
                            >
                                Description
                            </h3>
                            <p
                                class="text-sm text-gray-300 whitespace-pre-wrap"
                            >
                                {selectedAlarm.description}
                            </p>
                        </div>
                    {/if}

                    <div class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 shadow-sm overflow-hidden flex flex-col">
                        <div class="px-4 py-2 border-b border-gray-800 bg-gray-900/80 shrink-0">
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest">State Change History</h3>
                        </div>
                        <div class="flex-1 overflow-auto bg-gray-950 p-2">
                            {#if alarmHistoryLoading}
                                <div class="text-gray-500 italic p-4 text-center">Loading history...</div>
                            {:else if alarmHistory.length === 0}
                                <div class="text-gray-500 italic p-4 text-center">No state change history found.</div>
                            {:else}
                                <div class="space-y-1">
                                    {#each alarmHistory as h}
                                        <div class="p-2 border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                                            <div class="text-gray-400 text-xs mb-1">{h.timestamp}</div>
                                            <div class="text-gray-200 text-sm whitespace-pre-wrap">{h.summary}</div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            {:else}
                <PaginatedTable
                    items={filteredAlarms}
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
                            key: "name",
                            label: "Alarm Name",
                            onClick: (item) => {
                                selectedAlarm = item;
                                loadAlarmHistory(item.name);
                            },
                        },
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
                        { key: "metric", label: "Metric" },
                        { key: "condition", label: "Condition" },
                        {
                            key: "updated",
                            label: "Last Updated",
                            format: (v) =>
                                v ? new Date(v).toLocaleString() : "-",
                        },
                    ]}
                >
                    {#snippet headerActionsSnippet()}
                        <label
                            class="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white transition mr-2 bg-gray-950 px-3 py-1.5 rounded border border-gray-800"
                        >
                            <input
                                type="checkbox"
                                bind:checked={hideAutoScaling}
                                class="rounded border-gray-600 text-blue-500 focus:ring-blue-500 cursor-pointer"
                            />
                            <span class="select-none font-medium text-xs"
                                >Hide Auto-Scaling</span
                            >
                        </label>
                    {/snippet}
                </PaginatedTable>
            {/if}
        {:else if activeTab === "metrics"}
            {#if selectedMetric}
                <div class="h-full flex flex-col p-4 pr-1 bg-gray-950">
                    <div class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0">
                        <button
                            onclick={() => { selectedMetric = null; metricStats = []; }}
                            class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back to Metrics</button>
                        <span class="text-sm font-bold text-gray-200 truncate flex-1">{selectedMetric.metricName} <span class="text-xs font-normal text-gray-500 ml-2">({selectedMetric.namespace})</span></span>
                    </div>

                    <div class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 shadow-sm overflow-hidden flex flex-col">
                        <div class="px-4 py-2 border-b border-gray-800 bg-gray-900/80 flex justify-between items-center shrink-0">
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest">Metric Statistics (Last 24 Hours)</h3>
                            <button
                                onclick={() => loadMetricStats(selectedMetric)}
                                disabled={metricStatsLoading}
                                class="text-xs text-blue-400 hover:text-blue-300 transition"
                            >↻ Refresh</button>
                        </div>
                        <div class="flex-1 overflow-auto bg-gray-950 p-2">
                            {#if metricStatsLoading && metricStats.length === 0}
                                <div class="text-gray-500 italic p-4 text-center">Loading statistics...</div>
                            {:else if metricStats.length === 0}
                                <div class="text-gray-500 italic p-4 text-center">No datapoints found in the last 24 hours.</div>
                            {:else}
                                <table class="w-full text-xs text-left">
                                    <thead class="sticky top-0 bg-gray-900 border-b border-gray-800/50 z-10">
                                        <tr>
                                            <th class="px-3 py-2 font-semibold text-gray-300">Timestamp</th>
                                            <th class="px-3 py-2 font-semibold text-gray-300">Average</th>
                                            <th class="px-3 py-2 font-semibold text-gray-300">Maximum</th>
                                            <th class="px-3 py-2 font-semibold text-gray-300">Minimum</th>
                                            <th class="px-3 py-2 font-semibold text-gray-300">Sum</th>
                                            <th class="px-3 py-2 font-semibold text-gray-300">Count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each metricStats as stat}
                                            <tr class="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                                                <td class="px-3 py-1.5 text-gray-400">{stat.timestamp}</td>
                                                <td class="px-3 py-1.5 text-gray-300">{stat.average}</td>
                                                <td class="px-3 py-1.5 text-gray-300">{stat.max}</td>
                                                <td class="px-3 py-1.5 text-gray-300">{stat.min}</td>
                                                <td class="px-3 py-1.5 text-gray-300">{stat.sum}</td>
                                                <td class="px-3 py-1.5 text-gray-300">{stat.count} {stat.unit}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            {/if}
                        </div>
                    </div>
                </div>
            {:else}
                <PaginatedTable
                    items={metrics}
                    loading={metricsLoading}
                    hasNext={!!metricsCurrentToken}
                    hasPrev={metricsTokenMap.length > 0}
                    onNext={() => loadMetrics(metricsCurrentToken)}
                    onPrev={() => loadMetrics(popToken(metricsTokenMap))}
                    onRefresh={() => {
                        metricsTokenMap = [];
                        loadMetrics();
                    }}
                    columns={[
                        { key: "namespace", label: "Namespace" },
                        {
                            key: "metricName",
                            label: "Metric Name",
                            onClick: (item) => loadMetricStats(item),
                        },
                        { key: "dimensions", label: "Dimensions" },
                    ]}
                />
            {/if}
        {:else if activeTab === "dashboards"}
            {#if selectedDash}
                <div class="p-4 pr-1 h-full flex flex-col pt-2">
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
        {:else if activeTab === "loggroups"}
            {#if selectedStreamForEvents}
                <div class="h-full flex flex-col p-4 pr-1 bg-gray-950">
                    <div class="mb-3 flex items-center gap-2 shrink-0">
                        <button
                            onclick={() => {
                                selectedStreamForEvents = "";
                                logEvents = [];
                            }}
                            class="text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded bg-blue-600/10 hover:bg-blue-600/20"
                            >← Back to Log Streams</button
                        >
                        <span class="text-sm font-bold text-gray-200"
                            >{selectedStreamForEvents}</span
                        >
                        <div class="flex-1"></div>

                        <div class="flex items-center gap-2">
                            <input
                                type="text"
                                bind:value={logEventsFilter}
                                onkeydown={(e) => { if (e.key === 'Enter') loadLogEvents(selectedGroupForStreams, selectedStreamForEvents); }}
                                placeholder="Filter pattern..."
                                class="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 text-gray-200 w-48"
                            />
                            <button
                                onclick={() => loadLogEvents(selectedGroupForStreams, selectedStreamForEvents)}
                                class="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1 rounded transition"
                            >Search</button>
                        </div>

                        <div class="h-4 border-l border-gray-700 mx-1"></div>

                        <button
                            onclick={() => loadLogEvents(selectedGroupForStreams, selectedStreamForEvents, logEventsPrevToken, "prev")}
                            disabled={!logEventsPrevToken || logEventsLoading}
                            class="text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded bg-blue-600/10 hover:bg-blue-600/20 disabled:opacity-50"
                        >Older Logs</button>
                        <button
                            onclick={() => loadLogEvents(selectedGroupForStreams, selectedStreamForEvents, logEventsNextToken, "next")}
                            disabled={!logEventsNextToken || logEventsLoading}
                            class="text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded bg-blue-600/10 hover:bg-blue-600/20 disabled:opacity-50"
                        >Newer Logs</button>
                    </div>

                    <div class="flex-1 bg-gray-900 rounded-lg border border-gray-800 text-xs text-gray-300 overflow-auto font-mono relative p-2 shadow-inner">
                        {#if logEventsLoading && logEvents.length === 0}
                            <div class="text-gray-500 italic p-4 text-center">Loading events...</div>
                        {:else if logEvents.length === 0}
                            <div class="text-gray-500 italic p-4 text-center">No events found.</div>
                        {:else}
                            <div class="space-y-1">
                                {#each logEvents as event}
                                    <div class="flex gap-4 hover:bg-gray-800/50 p-1 rounded transition-colors break-words">
                                        <div class="text-gray-500 shrink-0 w-40">{event.timestamp}</div>
                                        <div class="text-gray-300 whitespace-pre-wrap">{event.message}</div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if selectedGroupForStreams}
                <div class="h-full flex flex-col p-4 pr-1 pt-2">
                    <div class="mb-3 flex items-center gap-2 shrink-0">
                        <button
                            onclick={() => {
                                selectedGroupForStreams = "";
                                logStreams = [];
                                logStreamsTokenMap = [];
                                logStreamsCurrentToken = undefined;
                            }}
                            class="text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded bg-blue-600/10 hover:bg-blue-600/20"
                            >← Back to Log Groups</button
                        >
                        <span class="text-sm font-bold text-gray-200"
                            >{selectedGroupForStreams}</span
                        >
                    </div>

                    <PaginatedTable
                        items={logStreams}
                        loading={logStreamsLoading}
                        hasNext={!!logStreamsCurrentToken}
                        hasPrev={logStreamsTokenMap.length > 0}
                        onNext={() => loadLogStreams(selectedGroupForStreams, logStreamsCurrentToken)}
                        onPrev={() => loadLogStreams(selectedGroupForStreams, popToken(logStreamsTokenMap))}
                        onRefresh={() => {
                            logStreamsTokenMap = [];
                            loadLogStreams(selectedGroupForStreams);
                        }}
                        columns={[
                            {
                                key: "name",
                                label: "Log Stream Name",
                                onClick: (item) => {
                                    loadLogEvents(selectedGroupForStreams, item.name);
                                }
                            },
                            { key: "creationTime", label: "Creation Time" },
                            { key: "lastEventTime", label: "Last Event Time" },
                            { key: "storedBytes", label: "Stored Bytes", format: formatBytes },
                        ]}
                    />
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
                                loadLogStreams(item.name);
                            }
                        },
                        { key: "retentionDays", label: "Retention" },
                        { key: "creationTime", label: "Creation Time" },
                        { key: "storedBytes", label: "Stored Bytes", format: formatBytes },
                    ]}
                />
            {/if}
        {:else if activeTab === "logs"}
            <div class="h-full flex flex-col p-4 pr-1 bg-gray-950">
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
                                <option value=""
                                    >Select log group...{lgLoading
                                        ? " (loading...)"
                                        : ` (${logGroups.length})`}</option
                                >
                                {#each logGroups as g}<option value={g.name}
                                        >{g.name}</option
                                    >{/each}
                            </select>
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
