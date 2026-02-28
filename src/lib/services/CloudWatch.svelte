<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudWatchClient,
        DescribeAlarmsCommand,
        ListDashboardsCommand,
        GetDashboardCommand,
        GetMetricDataCommand,
    } from "@aws-sdk/client-cloudwatch";
    import {
        CloudWatchLogsClient,
        DescribeLogGroupsCommand,
        StartQueryCommand,
        GetQueryResultsCommand,
    } from "@aws-sdk/client-cloudwatch-logs";
    import { getAwsCredentials } from "./aws-creds";

    type Tab = "alarms" | "dashboards" | "logs";
    let tab = $state<Tab>("alarms");
    let cwClient: CloudWatchClient | null = null;
    let logsClient: CloudWatchLogsClient | null = null;
    let error = $state("");
    let actionMsg = $state("");

    // Alarms
    let alarms = $state<any[]>([]);
    let alarmsToken = $state<string | undefined>(undefined);
    let alarmsLoading = $state(false);

    // Dashboards
    let dashboards = $state<any[]>([]);
    let dashToken = $state<string | undefined>(undefined);
    let dashLoading = $state(false);
    let selectedDash = $state("");
    let dashBody = $state("");

    // Logs Insights
    let logGroups = $state<any[]>([]);
    let lgToken = $state<string | undefined>(undefined);
    let lgLoading = $state(false);
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
        } catch (e) {
            error = String(e);
        }
    });

    // --- Alarms ---
    async function loadAlarms(append = false) {
        if (!cwClient) return;
        try {
            alarmsLoading = true;
            error = "";
            const resp = await cwClient.send(
                new DescribeAlarmsCommand({
                    MaxRecords: 50,
                    NextToken: append ? alarmsToken : undefined,
                }),
            );
            const items = (resp.MetricAlarms ?? []).map((a) => ({
                name: a.AlarmName ?? "Unknown",
                state: a.StateValue ?? "UNKNOWN",
                description: a.AlarmDescription ?? null,
                metric: a.MetricName ?? "",
                namespace: a.Namespace ?? "",
                period: a.Period ?? 0,
                threshold: a.Threshold,
                comparison: a.ComparisonOperator,
                updated: a.StateUpdatedTimestamp?.toISOString(),
            }));
            alarms = append ? [...alarms, ...items] : items;
            alarmsToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            alarmsLoading = false;
        }
    }

    // --- Dashboards ---
    async function loadDashboards(append = false) {
        if (!cwClient) return;
        try {
            dashLoading = true;
            error = "";
            const resp = await cwClient.send(
                new ListDashboardsCommand({
                    NextToken: append ? dashToken : undefined,
                }),
            );
            const items = (resp.DashboardEntries ?? []).map((d) => ({
                name: d.DashboardName ?? "Unknown",
                arn: d.DashboardArn ?? "",
                size: d.Size ?? 0,
                lastModified: d.LastModified?.toISOString(),
            }));
            dashboards = append ? [...dashboards, ...items] : items;
            dashToken = resp.NextToken;
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
            dashBody = "";
            const resp = await cwClient.send(
                new GetDashboardCommand({ DashboardName: name }),
            );
            dashBody = resp.DashboardBody ?? "{}";
        } catch (e) {
            error = String(e);
        }
    }

    // --- Logs Insights ---
    async function loadLogGroups(append = false) {
        if (!logsClient) return;
        try {
            lgLoading = true;
            error = "";
            const resp = await logsClient.send(
                new DescribeLogGroupsCommand({
                    limit: 50,
                    nextToken: append ? lgToken : undefined,
                }),
            );
            const items = (resp.logGroups ?? []).map((g) => ({
                name: g.logGroupName ?? "",
                storedBytes: g.storedBytes ?? 0,
                retentionDays: g.retentionInDays,
                arn: g.arn ?? "",
            }));
            logGroups = append ? [...logGroups, ...items] : items;
            lgToken = resp.nextToken;
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

            // Poll for results
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
                }
            }

            // Transform results
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

    function formatBytes(b: number) {
        if (b === 0) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }
</script>

{#if error}<div class="bg-red-500/20 text-red-300 p-2 rounded text-xs mb-2">
        {error}
    </div>{/if}
{#if actionMsg}<div
        class="bg-blue-500/20 text-blue-300 p-2 rounded text-xs mb-2"
    >
        {actionMsg}
    </div>{/if}

<!-- Sub-tabs -->
<div class="flex gap-1 mb-3">
    {#each ["alarms", "dashboards", "logs"] as Tab[] as t}
        <button
            onclick={() => {
                tab = t;
                error = "";
                actionMsg = "";
                if (t === "dashboards" && dashboards.length === 0)
                    loadDashboards();
                if (t === "logs" && logGroups.length === 0) loadLogGroups();
            }}
            class="px-3 py-1 rounded text-xs font-semibold transition {tab === t
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800'}"
            >{t.charAt(0).toUpperCase() + t.slice(1)}</button
        >
    {/each}
</div>

{#if tab === "alarms"}
    <div class="space-y-2">
        {#each alarms as a}
            <div
                class="bg-gray-900 p-3 rounded-lg border-l-4 {a.state ===
                'ALARM'
                    ? 'border-red-500'
                    : a.state === 'OK'
                      ? 'border-green-500'
                      : 'border-gray-500'}"
            >
                <div class="flex items-center justify-between mb-1">
                    <h3 class="font-semibold text-sm text-gray-100 truncate">
                        {a.name}
                    </h3>
                    <span
                        class="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold {a.state ===
                        'ALARM'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-green-500/20 text-green-400'}">{a.state}</span
                    >
                </div>
                <p class="text-gray-500 text-xs truncate mb-1">
                    {a.description || "No description"}
                </p>
                <div class="flex gap-3 text-xs text-gray-600">
                    <span>{a.namespace}/{a.metric}</span>
                    {#if a.threshold != null}<span
                            >{a.comparison} {a.threshold}</span
                        >{/if}
                    {#if a.updated}<span
                            >{new Date(a.updated).toLocaleString()}</span
                        >{/if}
                </div>
            </div>
        {/each}
        {#if !alarmsLoading && alarms.length === 0}<div
                class="text-gray-600 text-center py-16 text-sm"
            >
                No alarms found.
            </div>{/if}
        {#if alarmsLoading}<div class="flex justify-center py-4">
                <div
                    class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                ></div>
            </div>{/if}
        {#if alarmsToken && !alarmsLoading}<button
                onclick={() => loadAlarms(true)}
                class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
                >Load More</button
            >{/if}
    </div>
{:else if tab === "dashboards"}
    {#if selectedDash}
        <div class="mb-3 flex items-center gap-2">
            <button
                onclick={() => {
                    selectedDash = "";
                    dashBody = "";
                }}
                class="text-xs text-blue-400 hover:underline"
                >← Dashboards</button
            >
            <span class="text-sm text-gray-300">{selectedDash}</span>
        </div>
        <pre
            class="bg-gray-900 p-3 rounded-lg border border-gray-800 text-xs text-gray-300 overflow-auto max-h-[60vh] whitespace-pre-wrap">{JSON.stringify(
                JSON.parse(dashBody || "{}"),
                null,
                2,
            )}</pre>
    {:else}
        <div
            class="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800"
        >
            {#each dashboards as d}
                <button
                    onclick={() => viewDashboard(d.name)}
                    class="p-3 flex justify-between items-center hover:bg-gray-800/50 transition w-full text-left"
                >
                    <span class="text-sm text-gray-200">{d.name}</span>
                    <span class="text-xs text-gray-500"
                        >{d.lastModified
                            ? new Date(d.lastModified).toLocaleDateString()
                            : ""}</span
                    >
                </button>
            {/each}
            {#if !dashLoading && dashboards.length === 0}<div
                    class="p-8 text-center text-gray-600 text-sm"
                >
                    No dashboards found.
                </div>{/if}
        </div>
        {#if dashLoading}<div class="flex justify-center py-4">
                <div
                    class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                ></div>
            </div>{/if}
        {#if dashToken && !dashLoading}<button
                onclick={() => loadDashboards(true)}
                class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
                >Load More</button
            >{/if}
    {/if}
{:else if tab === "logs"}
    <!-- Log Groups + Insights Query -->
    <div class="space-y-2 mb-3">
        <div class="flex gap-2">
            <select
                bind:value={selectedLogGroup}
                class="flex-1 bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
            >
                <option value="">Select log group...</option>
                {#each logGroups as g}<option value={g.name}>{g.name}</option
                    >{/each}
            </select>
            <select
                bind:value={timeRange}
                class="bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none"
            >
                <option value={900}>15 min</option>
                <option value={3600}>1 hour</option>
                <option value={14400}>4 hours</option>
                <option value={86400}>24 hours</option>
                <option value={604800}>7 days</option>
            </select>
            <button
                onclick={runInsightsQuery}
                disabled={!selectedLogGroup || logQueryLoading}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-xs font-bold transition"
                >Run</button
            >
        </div>
        <textarea
            bind:value={logQuery}
            rows="3"
            placeholder="CloudWatch Logs Insights query..."
            class="w-full bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 font-mono outline-none focus:border-blue-500 resize-none"
        ></textarea>
    </div>

    {#if lgToken && !lgLoading}
        <button
            onclick={() => loadLogGroups(true)}
            class="text-xs text-blue-400 hover:underline mb-2 block"
            >Load more log groups...</button
        >
    {/if}

    {#if logQueryLoading}<div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
            <span class="text-xs text-gray-500 ml-2">Querying...</span>
        </div>{/if}
    {#if logResults.length > 0}
        <div class="overflow-auto border border-gray-800 rounded-lg">
            <table class="w-full text-xs">
                <thead class="bg-gray-900 sticky top-0"
                    ><tr>
                        {#each logColumns as col}<th
                                class="px-3 py-2 text-left text-gray-400 font-semibold border-b border-gray-800 whitespace-nowrap"
                                >{col}</th
                            >{/each}
                    </tr></thead
                >
                <tbody>
                    {#each logResults as row}
                        <tr
                            class="border-b border-gray-800/50 hover:bg-gray-900/50"
                        >
                            {#each logColumns as col}<td
                                    class="px-3 py-2 text-gray-300 truncate max-w-[300px] whitespace-nowrap"
                                    >{row[col] ?? ""}</td
                                >{/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <div class="text-xs text-gray-500 mt-1">
            {logResults.length} results
        </div>
    {/if}
{/if}
