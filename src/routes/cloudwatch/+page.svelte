<script lang="ts">
    import { goto } from "$app/navigation";
    import {
        DescribeAlarmsCommand,
        DescribeAlarmHistoryCommand,
        DeleteAlarmsCommand,
    } from "@aws-sdk/client-cloudwatch";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { pushToken, popToken } from "$lib/utils/pagination";
    import { aws } from "$lib/services/aws.svelte";

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);

    let alarms = $state<any[]>([]);
    let alarmsLoading = $state(false);
    let alarmsTokenMap = $state<string[]>([]);
    let alarmsCurrentToken = $state<string | undefined>(undefined);
    let selectedAlarm = $state<any>(null);
    let alarmHistory = $state<any[]>([]);
    let alarmHistoryLoading = $state(false);

    $effect(() => {
        if (aws.cw && alarms.length === 0) {
            loadAlarms();
        }
    });

    async function loadAlarms(token?: string) {
        if (!aws.cw) return;
        try {
            alarmsLoading = true;
            error = "";
            actionMsg = "";
            const params: any = { MaxRecords: 50, NextToken: token };
            const resp = await aws.cw.send(new DescribeAlarmsCommand(params));
            let fetched = (resp.MetricAlarms ?? []).map((a) => ({
                name: a.AlarmName ?? "Unknown",
                state: a.StateValue ?? "UNKNOWN",
                description: a.AlarmDescription ?? null,
                metric: a.MetricName ?? "",
                namespace: a.Namespace ?? "",
                condition: `${a.ComparisonOperator} ${a.Threshold}`,
                updated: a.StateUpdatedTimestamp?.toISOString(),
                dimensions: (a.Dimensions ?? [])
                    .map((d) => `${d.Name}=${d.Value}`)
                    .join(" "),
            }));

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

    async function loadAlarmHistory(alarmName: string) {
        if (!aws.cw) return;
        try {
            alarmHistoryLoading = true;
            error = "";
            actionMsg = "";
            const resp = await aws.cw.send(
                new DescribeAlarmHistoryCommand({
                    AlarmName: alarmName,
                    HistoryItemType: "StateUpdate",
                    MaxRecords: 50,
                }),
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

    async function deleteAlarm(alarmName: string) {
        if (!aws.cw) return;
        if (!confirm(`Are you sure you want to delete alarm "${alarmName}"?`))
            return;
        try {
            alarmsLoading = true;
            error = "";
            actionMsg = "";
            await aws.cw.send(
                new DeleteAlarmsCommand({
                    AlarmNames: [alarmName],
                }),
            );
            actionMsg = `Alarm "${alarmName}" deleted.`;
            selectedAlarm = null;
            alarmsTokenMap = [];
            await loadAlarms();
        } catch (e) {
            error = String(e);
            alarmsLoading = false;
        }
    }

    function navigateToMetric(item: any) {
        const dimensions = JSON.stringify(
            (item.dimensions || "")
                .split(" ")
                .map((d: string) => {
                    const [Name, Value] = d.split("=");
                    return { Name, Value };
                })
                .filter((d: any) => d.Name && d.Value),
        );
        const url = `/cloudwatch/metrics/detail?namespace=${encodeURIComponent(item.namespace)}&name=${encodeURIComponent(item.metric)}&dimensions=${encodeURIComponent(dimensions)}`;
        goto(url);
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

    <div class="flex-1 {error || actionMsg ? 'pt-8' : ''}">
        {#if selectedAlarm}
            <div class="h-full flex flex-col p-4 bg-gray-950">
                <div
                    class="flex items-center gap-3 mb-6 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
                >
                    <button
                        onclick={() => {
                            selectedAlarm = null;
                            alarmHistory = [];
                        }}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back</button
                    >
                    <div
                        class="flex-1 font-bold text-lg text-gray-200 truncate"
                    >
                        {selectedAlarm.name}
                    </div>
                    <div
                        class="px-5 py-2 rounded font-bold text-sm select-none border whitespace-nowrap"
                        class:bg-red-500={selectedAlarm.state === "ALARM"}
                        class:bg-green-500={selectedAlarm.state === "OK"}
                        class:text-white={selectedAlarm.state === "OK" ||
                            selectedAlarm.state === "ALARM"}
                        class:bg-gray-700={selectedAlarm.state !== "ALARM" &&
                            selectedAlarm.state !== "OK"}
                        class:text-gray-300={selectedAlarm.state !== "ALARM" &&
                            selectedAlarm.state !== "OK"}
                        class:border-red-600={selectedAlarm.state === "ALARM"}
                        class:border-green-600={selectedAlarm.state === "OK"}
                        class:border-gray-600={selectedAlarm.state !==
                            "ALARM" && selectedAlarm.state !== "OK"}
                    >
                        {selectedAlarm.state}
                    </div>
                </div>

                <div class="flex-1 min-h-0 flex flex-col gap-4 overflow-auto">
                    <div
                        class="p-6 bg-gray-900 rounded-lg border border-gray-800 bg-gray-900/50"
                    >
                        {#if selectedAlarm.description}
                            <div class="mb-6">
                                <div
                                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                                >
                                    Description
                                </div>
                                <div
                                    class="text-sm text-gray-300 bg-gray-950/50 p-3 rounded border border-gray-800 leading-relaxed font-mono"
                                >
                                    {selectedAlarm.description}
                                </div>
                            </div>
                        {/if}

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                                <button
                                    onclick={() =>
                                        navigateToMetric(selectedAlarm)}
                                    class="text-base font-bold text-blue-400 hover:text-blue-300 hover:underline transition-colors text-left"
                                >
                                    {selectedAlarm.metric}
                                </button>
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

                        <div class="mt-8 flex gap-3">
                            <button
                                onclick={() => deleteAlarm(selectedAlarm.name)}
                                class="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded font-bold text-sm transition-colors border border-red-900/30"
                            >
                                Delete Alarm
                            </button>
                        </div>
                    </div>

                    <div
                        class="flex-1 bg-gray-900 rounded-lg border border-gray-800 shadow-sm p-6 overflow-hidden flex flex-col"
                    >
                        <h3
                            class="text-sm font-bold text-gray-200 mb-4 tracking-wide uppercase"
                        >
                            Recent History
                        </h3>
                        {#if alarmHistoryLoading}
                            <div
                                class="text-gray-400 text-sm animate-pulse h-24 flex items-center justify-center bg-gray-950 border border-gray-800 rounded"
                            >
                                Loading history...
                            </div>
                        {:else if alarmHistory.length === 0}
                            <div
                                class="text-gray-500 text-sm italic h-24 flex items-center justify-center bg-gray-950 border border-gray-800 rounded"
                            >
                                No history found.
                            </div>
                        {:else}
                            <div class="flex-1 overflow-auto space-y-3">
                                {#each alarmHistory as h}
                                    <div
                                        class="bg-gray-950 border border-gray-800 rounded p-4 shadow-sm hover:border-gray-700 transition"
                                    >
                                        <div
                                            class="text-xs text-gray-500 mb-2 font-mono"
                                        >
                                            {h.timestamp}
                                        </div>
                                        <div
                                            class="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed"
                                        >
                                            {h.summary}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {:else}
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
                    {
                        key: "metric",
                        label: "Metric",
                        onClick: (item) => navigateToMetric(item),
                    },
                    { key: "condition", label: "Condition" },
                    {
                        key: "updated",
                        label: "Last Updated",
                        format: (v) => (v ? new Date(v).toLocaleString() : "-"),
                    },
                ]}
            >
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={(e) => {
                            e.stopPropagation();
                            deleteAlarm(item.name);
                        }}
                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                        >Delete</button
                    >
                {/snippet}
            </PaginatedTable>
        {/if}
    </div>
</div>
