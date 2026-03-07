<script lang="ts">
    import {
        DescribeExecutionCommand,
        GetExecutionHistoryCommand,
        RedriveExecutionCommand,
        StopExecutionCommand,
        type HistoryEvent,
    } from "@aws-sdk/client-sfn";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    let execArn = $derived($page.url.searchParams.get("id") || "");

    let loading = $state(false);
    let error = $state("");
    let details = $state<any>(null);
    let historyEvents = $state<HistoryEvent[]>([]);
    let historyMarker = $state<string | undefined>(undefined);
    let historyTokens = $state<string[]>([]);

    let isStopping = $state(false);
    let isRedriving = $state(false);

    $effect(() => {
        if (aws.sfn && execArn) {
            loadDetails();
            loadHistory();
        }
    });

    async function loadDetails() {
        if (!aws.sfn || !execArn) return;
        try {
            const res = await aws.sfn.send(
                new DescribeExecutionCommand({ executionArn: execArn }),
            );
            details = res;
        } catch (e: any) {
            error = e.message || String(e);
        }
    }

    async function loadHistory(token?: string) {
        if (!aws.sfn || !execArn) return;
        try {
            loading = true;
            const res = await aws.sfn.send(
                new GetExecutionHistoryCommand({
                    executionArn: execArn,
                    maxResults: 50,
                    nextToken: token,
                    reverseOrder: true,
                }),
            );
            historyEvents = res.events || [];
            if (token) historyTokens.push(token);
            historyMarker = res.nextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleRedrive() {
        if (!aws.sfn || !execArn || !confirm("Redrive this execution?")) return;
        try {
            isRedriving = true;
            await aws.sfn.send(
                new RedriveExecutionCommand({ executionArn: execArn }),
            );
            await loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            isRedriving = false;
        }
    }

    async function handleStop() {
        if (!aws.sfn || !execArn || !confirm("Stop this execution?")) return;
        try {
            isStopping = true;
            await aws.sfn.send(
                new StopExecutionCommand({ executionArn: execArn }),
            );
            await loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            isStopping = false;
        }
    }

    function handleBack() {
        if (details?.stateMachineArn) {
            goto(`/stepfunctions/details?id=${details.stateMachineArn}`);
        } else {
            goto("/stepfunctions");
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div
        class="px-6 py-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center shrink-0 {error
            ? 'mt-8'
            : ''}"
    >
        <div class="flex items-center gap-3">
            <button
                onclick={handleBack}
                class="text-xs text-blue-400 hover:text-blue-300">← Back</button
            >
            <h2 class="text-sm font-bold text-gray-200">Execution Detail</h2>
        </div>
        <div class="flex gap-2">
            {#if ["FAILED", "TIMED_OUT", "ABORTED"].includes(details?.status)}
                <button
                    onclick={handleRedrive}
                    disabled={isRedriving}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-2"
                >
                    {#if isRedriving}<span class="animate-spin">⟳</span>{/if} Redrive
                </button>
            {/if}
            {#if details?.status === "RUNNING"}
                <button
                    onclick={handleStop}
                    disabled={isStopping}
                    class="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-2"
                >
                    {#if isStopping}<span class="animate-spin">⟳</span>{/if} Stop
                </button>
            {/if}
        </div>
    </div>

    <div class="flex-1 overflow-auto p-6 space-y-6">
        <div
            class="bg-gray-900 border border-gray-800 rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-sm"
        >
            <div>
                <h3
                    class="text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest border-b border-gray-800 pb-1"
                >
                    Input
                </h3>
                <pre
                    class="bg-black p-3 rounded text-[11px] text-gray-300 font-mono overflow-auto max-h-48 border border-gray-800/50">{details?.input ||
                        "None"}</pre>
            </div>
            <div>
                <h3
                    class="text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest border-b border-gray-800 pb-1"
                >
                    Output
                </h3>
                <pre
                    class="bg-black p-3 rounded text-[11px] text-green-400 font-mono overflow-auto max-h-48 border border-gray-800/50">{details?.output ||
                        "None"}</pre>
            </div>
        </div>

        <div
            class="flex-1 bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden min-h-[300px] shadow-sm"
        >
            <div class="px-4 py-3 border-b border-gray-800 bg-gray-900/50">
                <h3 class="text-xs font-bold text-gray-300">Event History</h3>
            </div>
            <div class="flex-1 relative">
                <PaginatedTable
                    items={historyEvents}
                    {loading}
                    onRefresh={() => {
                        historyTokens = [];
                        loadHistory();
                    }}
                    hasNext={!!historyMarker}
                    hasPrev={historyTokens.length > 0}
                    onNext={() => loadHistory(historyMarker)}
                    onPrev={() => {
                        historyTokens.pop();
                        loadHistory(historyTokens[historyTokens.length - 1]);
                    }}
                    columns={[
                        { label: "ID", key: "id" },
                        { label: "Type", key: "type" },
                        {
                            label: "Timestamp",
                            key: "timestamp",
                            format: (v) =>
                                v ? new Date(v).toLocaleString() : "",
                        },
                    ]}
                />
            </div>
        </div>
    </div>
</div>
