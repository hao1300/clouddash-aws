<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import {
        DescribeAlarmsCommand,
        DescribeAlarmHistoryCommand,
        DeleteAlarmsCommand,
    } from "@aws-sdk/client-cloudwatch";
    import { aws } from "$lib/services/aws.svelte";
    import DetailLayout from "$lib/components/DetailLayout.svelte";

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);

    let alarmName = $derived($page.params.name);
    let alarm = $state<any>(null);
    let alarmHistory = $state<any[]>([]);
    let historyLoading = $state(false);

    $effect(() => {
        if (aws.cw && alarmName) {
            loadAlarm();
            loadAlarmHistory();
        }
    });

    $effect(() => {
        titleService.setResource(alarmName || "");
    });

    async function loadAlarm() {
        if (!aws.cw) return;
        try {
            loading = true;
            error = "";
            const resp = await aws.cw.send(
                new DescribeAlarmsCommand({
                    AlarmNames: [alarmName],
                }),
            );
            const a = resp.MetricAlarms?.[0];
            if (a) {
                alarm = {
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
                };
            } else {
                error = "Alarm not found.";
            }
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function loadAlarmHistory() {
        if (!aws.cw) return;
        try {
            historyLoading = true;
            const resp = await aws.cw.send(
                new DescribeAlarmHistoryCommand({
                    AlarmName: alarmName,
                    HistoryItemType: "StateUpdate",
                    MaxRecords: 100, // Get more for the chart
                }),
            );
            alarmHistory = (resp.AlarmHistoryItems ?? []).map((h) => {
                let state = "UNKNOWN";
                try {
                    const data = JSON.parse(h.HistoryData || "{}");
                    state = data.newState?.stateValue || "UNKNOWN";
                } catch (e) {}
                
                return {
                    timestamp: h.Timestamp || new Date(),
                    displayTime: h.Timestamp?.toLocaleString() ?? "",
                    summary: h.HistorySummary ?? "",
                    state: state
                };
            }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        } catch (e) {
            console.error(e);
        } finally {
            historyLoading = false;
        }
    }

    // Helper for history chart
    let chartData = $derived.by(() => {
        if (alarmHistory.length < 2) return null;
        const startTime = alarmHistory[0].timestamp.getTime();
        const endTime = alarmHistory[alarmHistory.length - 1].timestamp.getTime();
        const range = endTime - startTime || 1;

        return alarmHistory.map((h, i) => {
            const x = ((h.timestamp.getTime() - startTime) / range) * 100;
            const nextX = i < alarmHistory.length - 1 
                ? ((alarmHistory[i+1].timestamp.getTime() - startTime) / range) * 100 
                : 100;
            
            return {
                x,
                width: Math.max(0.5, nextX - x),
                state: h.state,
                time: h.displayTime
            };
        });
    });

    async function deleteAlarm() {
        if (!aws.cw || !alarmName) return;
        if (!confirm(`Are you sure you want to delete alarm "${alarmName}"?`))
            return;
        try {
            loading = true;
            await aws.cw.send(
                new DeleteAlarmsCommand({
                    AlarmNames: [alarmName],
                }),
            );
            goto("/cloudwatch");
        } catch (e) {
            error = String(e);
            loading = false;
        }
    }

    function navigateToMetric() {
        if (!alarm) return;
        const dimensions = JSON.stringify(
            (alarm.dimensions || "")
                .split(" ")
                .map((d: string) => {
                    const [Name, Value] = d.split("=");
                    return { Name, Value };
                })
                .filter((d: any) => d.Name && d.Value),
        );
        const url = `/cloudwatch/metrics/detail?namespace=${encodeURIComponent(alarm.namespace)}&name=${encodeURIComponent(alarm.metric)}&dimensions=${encodeURIComponent(dimensions)}`;
        goto(url);
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col bg-gray-950">
    {#if error}
        <div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">
            {error}
        </div>
    {/if}

    <div class="flex-1 overflow-auto p-6">
        {#if loading && !alarm}
            <div class="flex items-center justify-center h-full text-gray-400">
                <div class="animate-pulse flex flex-col items-center gap-2">
                    <div class="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Loading alarm details...</span>
                </div>
            </div>
        {:else if alarm}
            <DetailLayout title={alarm.name}>
                {#snippet actionsSnippet()}
                    <button
                        onclick={deleteAlarm}
                        class="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded font-bold text-sm transition-colors border border-red-900/30 whitespace-nowrap"
                    >
                        Delete
                    </button>
                {/snippet}

                {#snippet mainSnippet()}
                    <div class="bg-gray-900 rounded-xl border border-gray-800 p-4 sm:p-6 space-y-6">
                        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div class="space-y-1 flex-1 min-w-0">
                                <div class="text-xs text-gray-500 uppercase font-bold tracking-wider">Description</div>
                                <p class="text-gray-300 leading-relaxed font-mono text-sm bg-gray-950/50 p-3 rounded border border-gray-800 break-words">
                                    {alarm.description || "No description provided."}
                                </p>
                            </div>
                            <div class="flex flex-col sm:items-end gap-1 shrink-0">
                                <div class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Current State</div>
                                <div
                                    class="px-4 py-1.5 rounded-full font-black text-xs uppercase tracking-tight border shadow-sm w-fit whitespace-nowrap"
                                    class:bg-red-500={alarm.state === "ALARM"}
                                    class:bg-green-500={alarm.state === "OK"}
                                    class:text-white={alarm.state === "OK" || alarm.state === "ALARM"}
                                    class:bg-gray-700={alarm.state !== "ALARM" && alarm.state !== "OK"}
                                    class:text-gray-300={alarm.state !== "ALARM" && alarm.state !== "OK"}
                                    class:border-red-600={alarm.state === "ALARM"}
                                    class:border-green-600={alarm.state === "OK"}
                                    class:border-gray-600={alarm.state !== "ALARM" && alarm.state !== "OK"}
                                >
                                    {alarm.state}
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div class="bg-gray-950 p-4 rounded-lg border border-gray-800 flex flex-col min-w-0">
                                <div class="text-[10px] text-gray-500 uppercase font-bold mb-1 shrink-0">Namespace</div>
                                <div class="text-sm font-bold text-gray-200 break-all">{alarm.namespace}</div>
                            </div>
                            <div class="bg-gray-950 p-4 rounded-lg border border-gray-800 flex flex-col min-w-0">
                                <div class="text-[10px] text-gray-500 uppercase font-bold mb-1 shrink-0">Metric</div>
                                <button onclick={navigateToMetric} class="text-sm font-bold text-blue-400 hover:underline text-left break-all">
                                    {alarm.metric}
                                </button>
                            </div>
                            <div class="bg-gray-950 p-4 rounded-lg border border-gray-800 flex flex-col min-w-0">
                                <div class="text-[10px] text-gray-500 uppercase font-bold mb-1 shrink-0">Condition</div>
                                <div class="text-sm font-bold text-gray-200 break-words">{alarm.condition}</div>
                            </div>
                        </div>
                    </div>

                    <!-- History Chart Section -->
                    <div class="bg-gray-900 rounded-xl border border-gray-800 p-6 flex flex-col gap-4">
                        <div class="flex items-center justify-between">
                            <h3 class="text-sm font-bold text-gray-200 uppercase tracking-widest">State History Chart</h3>
                            <div class="flex gap-4 text-[10px] font-bold">
                                <div class="flex items-center gap-1.5 text-green-400">
                                    <div class="w-2 h-2 rounded-full bg-green-500"></div> OK
                                </div>
                                <div class="flex items-center gap-1.5 text-red-400">
                                    <div class="w-2 h-2 rounded-full bg-red-500"></div> ALARM
                                </div>
                                <div class="flex items-center gap-1.5 text-gray-400">
                                    <div class="w-2 h-2 rounded-full bg-gray-500"></div> INSUFFICIENT
                                </div>
                            </div>
                        </div>

                        {#if historyLoading && alarmHistory.length === 0}
                            <div class="h-32 flex items-center justify-center text-gray-500 italic bg-gray-950/30 rounded-lg border border-gray-800/50">
                                Loading history chart...
                            </div>
                        {:else if chartData}
                            <div class="relative h-24 bg-gray-950/50 border border-gray-800 rounded-lg mt-2 overflow-hidden group">
                                <svg width="100%" height="100%" preserveAspectRatio="none">
                                    {#each chartData as segment}
                                        <rect 
                                            x="{segment.x}%" 
                                            y="0" 
                                            width="{segment.width}%" 
                                            height="100%" 
                                            fill={segment.state === 'ALARM' ? '#ef4444' : segment.state === 'OK' ? '#22c55e' : '#6b7280'}
                                            opacity="0.8"
                                            class="transition-opacity hover:opacity-100"
                                        >
                                            <title>{segment.time}: {segment.state}</title>
                                        </rect>
                                    {/each}
                                </svg>
                                
                                <!-- Time Labels -->
                                <div class="absolute inset-x-0 bottom-0 flex justify-between px-2 py-1 text-[8px] text-gray-500 uppercase bg-gray-950/80 backdrop-blur-sm pointer-events-none border-t border-gray-800/50 font-bold">
                                    <span>{alarmHistory[0].displayTime}</span>
                                    <span>{alarmHistory[alarmHistory.length - 1].displayTime}</span>
                                </div>
                            </div>
                            <div class="text-[9px] text-gray-500 italic mt-1">
                                * Visualization of state changes over time based on the last {alarmHistory.length} history items.
                            </div>
                        {:else}
                            <div class="h-32 flex items-center justify-center text-gray-600 italic bg-gray-950/30 rounded-lg border border-gray-800/50 text-xs">
                                Not enough history data to generate chart.
                            </div>
                        {/if}
                    </div>
                {/snippet}

                {#snippet sidebarSnippet()}
                    <!-- History List Sidebar -->
                    <div class="bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden h-full">
                        <div class="p-4 border-b border-gray-800 bg-gray-900/50">
                            <h3 class="text-xs font-bold text-gray-100 uppercase tracking-widest">Recent Events</h3>
                        </div>
                        <div class="flex-1 overflow-auto p-4 space-y-3 bg-gray-950/50 max-h-[800px]">
                            {#if historyLoading && alarmHistory.length === 0}
                                <div class="text-xs text-gray-600 animate-pulse">Loading events...</div>
                            {:else if alarmHistory.length === 0}
                                <div class="text-xs text-gray-600 italic">No events found.</div>
                            {:else}
                                {#each [...alarmHistory].reverse() as h}
                                    <div class="bg-gray-900 p-3 rounded border border-gray-800 hover:border-gray-700 transition-colors shadow-sm group">
                                        <div class="flex items-center gap-2 mb-1.5">
                                            <div 
                                                class="w-1.5 h-1.5 rounded-full shrink-0"
                                                class:bg-red-500={h.state === 'ALARM'}
                                                class:bg-green-500={h.state === 'OK'}
                                                class:bg-gray-500={h.state !== 'ALARM' && h.state !== 'OK'}
                                            ></div>
                                            <span class="text-[10px] text-gray-500 font-mono">{h.displayTime}</span>
                                        </div>
                                        <p class="text-xs text-gray-400 leading-normal line-clamp-2 group-hover:line-clamp-none transition-all">
                                            {h.summary}
                                        </p>
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    </div>
                {/snippet}
            </DetailLayout>
        {/if}
    </div>
</div>
