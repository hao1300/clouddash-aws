<script lang="ts">
    import { onMount, untrack } from "svelte";
    import {
        SFNClient,
        ListStateMachinesCommand,
        ListExecutionsCommand,
        StartExecutionCommand,
        DescribeExecutionCommand,
        GetExecutionHistoryCommand,
        type StateMachineListItem,
        type ExecutionListItem,
        type HistoryEvent,
    } from "@aws-sdk/client-sfn";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: SFNClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [{ id: "statemachines", label: "State Machines" }];
    let activeTab = $state("statemachines");

    // --- Pagination Shared Helpers ---
    function pushToken(history: string[], currentNextToken?: string) {
        if (!currentNextToken) return;
        if (history[history.length - 1] !== currentNextToken)
            history.push(currentNextToken);
    }
    function popToken(history: string[]) {
        history.pop();
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    // --- State Machines ---
    let stateMachines = $state<StateMachineListItem[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    // --- Detail View ---
    let selectedSM = $state<StateMachineListItem | null>(null);
    let detailTab = $state<"executions" | "start">("executions");

    // Executions
    let executions = $state<ExecutionListItem[]>([]);
    let execTokenMap = $state<string[]>([]);
    let execCurrentToken = $state<string | undefined>(undefined);

    // Selected Execution Detail
    let selectedExecution = $state<ExecutionListItem | null>(null);
    let executionDetails = $state<any>(null);
    let executionHistory = $state<HistoryEvent[]>([]);
    let historyTokenMap = $state<string[]>([]);
    let historyCurrentToken = $state<string | undefined>(undefined);

    // Start Execution
    let startInput = $state("{}");
    let startName = $state("");

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new SFNClient({
                region: creds.region,
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    sessionToken: creds.session_token || undefined,
                },
            });
            await loadStateMachines();
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    // --- State Machines Methods ---
    async function loadStateMachines(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListStateMachinesCommand({
                    maxResults: 50,
                    nextToken: token,
                }),
            );
            stateMachines = res.stateMachines || [];
            currentToken = res.nextToken;
            selectedSM = null;
            executions = [];
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleNext() {
        if (currentToken) {
            pushToken(tokenMap, currentToken);
            loadStateMachines(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadStateMachines(prevToken);
    }

    // --- Executions Methods ---
    async function loadExecutions(token?: string) {
        if (!client || !selectedSM) return;
        loading = true;
        error = "";
        try {
            const res = await client.send(
                new ListExecutionsCommand({
                    stateMachineArn: selectedSM.stateMachineArn,
                    maxResults: 50,
                    nextToken: token,
                }),
            );
            executions = res.executions || [];
            execCurrentToken = res.nextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleExecNext() {
        if (execCurrentToken) {
            pushToken(execTokenMap, execCurrentToken);
            loadExecutions(execCurrentToken);
        }
    }

    function handleExecPrev() {
        const prevToken = popToken(execTokenMap);
        loadExecutions(prevToken);
    }

    async function startExecution() {
        if (!client || !selectedSM) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new StartExecutionCommand({
                    stateMachineArn: selectedSM.stateMachineArn,
                    name: startName || undefined,
                    input: startInput || "{}",
                }),
            );
            actionMsg = `Started execution: ${res.executionArn?.split(":").pop()}`;
            startName = "";
            detailTab = "executions";
            execTokenMap = [];
            await loadExecutions();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function openStateMachine(sm: StateMachineListItem) {
        selectedSM = sm;
        detailTab = "executions";
        execTokenMap = [];
        execCurrentToken = undefined;
        executions = [];
        selectedExecution = null;
        loadExecutions();
    }

    function openExecution(exec: ExecutionListItem) {
        selectedExecution = exec;
        executionDetails = null;
        executionHistory = [];
        historyTokenMap = [];
        historyCurrentToken = undefined;
        loadExecutionDetails();
        loadExecutionHistory();
    }

    async function loadExecutionDetails() {
        if (!client || !selectedExecution?.executionArn) return;
        try {
            const res = await client.send(
                new DescribeExecutionCommand({
                    executionArn: selectedExecution.executionArn,
                }),
            );
            executionDetails = res;
        } catch (e: any) {
            error = e.message || String(e);
        }
    }

    async function loadExecutionHistory(token?: string) {
        if (!client || !selectedExecution?.executionArn) return;
        loading = true;
        try {
            const res = await client.send(
                new GetExecutionHistoryCommand({
                    executionArn: selectedExecution.executionArn,
                    maxResults: 50,
                    nextToken: token,
                    reverseOrder: true,
                }),
            );
            executionHistory = res.events || [];
            historyCurrentToken = res.nextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleHistoryNext() {
        if (historyCurrentToken) {
            pushToken(historyTokenMap, historyCurrentToken);
            loadExecutionHistory(historyCurrentToken);
        }
    }

    function handleHistoryPrev() {
        const prevToken = popToken(historyTokenMap);
        loadExecutionHistory(prevToken);
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if activeTab === "statemachines"}
        {#if !selectedSM}
            <PaginatedTable
                items={stateMachines}
                {loading}
                columns={[
                    {
                        label: "Name",
                        key: "name",
                        sortable: true,
                    },
                    { label: "Type", key: "type", sortable: true },
                    {
                        label: "Creation Date",
                        key: "creationDate",
                        sortable: true,
                    },
                ]}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={handleNext}
                onPrev={handlePrev}
                onRefresh={() => {
                    tokenMap = [];
                    loadStateMachines();
                }}
            >
                {#snippet children(sm: any)}
                    <td class="px-4 py-3 whitespace-nowrap">
                        <button
                            class="text-blue-400 hover:text-blue-300 font-medium hover:underline text-left text-sm"
                            onclick={() => openStateMachine(sm)}
                        >
                            {sm.name}
                        </button>
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        <span
                            class="px-2 py-0.5 rounded text-xs {sm.type ===
                            'STANDARD'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-orange-500/20 text-orange-300'}"
                        >
                            {sm.type}
                        </span>
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {sm.creationDate
                            ? new Date(sm.creationDate).toLocaleString()
                            : ""}
                    </td>
                {/snippet}
            </PaginatedTable>
        {:else}
            <!-- Drill Down / Detail View -->
            <div class="h-full flex flex-col -m-4 sm:-m-6">
                <!-- Header -->
                <div
                    class="px-4 sm:px-6 py-4 bg-gray-900 border-b border-gray-800 shrink-0"
                >
                    <div class="flex items-center gap-3">
                        <button
                            class="text-gray-400 hover:text-white transition"
                            onclick={() => {
                                selectedSM = null;
                            }}
                        >
                            ← Back
                        </button>
                        <h2
                            class="text-lg font-bold text-gray-100 flex items-center gap-2"
                        >
                            <span class="text-orange-400">❖</span>
                            {selectedSM.name}
                        </h2>
                    </div>
                </div>

                <!-- Inner Tabs -->
                <div
                    class="px-4 sm:px-6 border-b border-gray-800 bg-gray-900 shrink-0 overflow-x-auto scrollbar-hide"
                >
                    <nav class="flex gap-4 min-w-max">
                        <button
                            onclick={() => (detailTab = "executions")}
                            class="py-3 text-sm font-semibold transition border-b-2 whitespace-nowrap {detailTab ===
                            'executions'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'}"
                        >
                            Executions
                        </button>
                        <button
                            onclick={() => (detailTab = "start")}
                            class="py-3 text-sm font-semibold transition border-b-2 whitespace-nowrap {detailTab ===
                            'start'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'}"
                        >
                            Start Execution
                        </button>
                    </nav>
                </div>

                <!-- Inner Content -->
                <div
                    class="flex-1 overflow-auto p-4 sm:p-6 p-rel relative min-h-0"
                >
                    {#if detailTab === "executions"}
                        {#if !selectedExecution}
                            <div class="absolute inset-0">
                                <PaginatedTable
                                items={executions}
                                {loading}
                                columns={[
                                    {
                                        label: "Start Date",
                                        key: "startDate",
                                        sortable: true,
                                    },
                                    {
                                        label: "Stop Date",
                                        key: "stopDate",
                                        sortable: true,
                                    },
                                ]}
                                hasNext={!!execCurrentToken}
                                hasPrev={execTokenMap.length > 0}
                                onNext={handleExecNext}
                                onPrev={handleExecPrev}
                                    onRefresh={() => {
                                        execTokenMap = [];
                                        loadExecutions();
                                    }}
                                >
                                    {#snippet children(exec: any)}
                                        <td
                                            class="px-4 py-3 whitespace-nowrap text-sm font-mono"
                                        >
                                            <button
                                                class="text-blue-400 hover:text-blue-300 font-medium hover:underline text-left"
                                                onclick={() => openExecution(exec)}
                                            >
                                                {exec.name}
                                            </button>
                                        </td>
                                        <td
                                            class="px-4 py-3 whitespace-nowrap text-sm"
                                        >
                                        <span
                                            class="px-2 py-0.5 rounded text-xs
                                                {exec.status === 'SUCCEEDED'
                                                ? 'bg-green-500/20 text-green-400'
                                                : ''}
                                                {exec.status === 'RUNNING'
                                                ? 'bg-blue-500/20 text-blue-400'
                                                : ''}
                                                {exec.status === 'FAILED'
                                                ? 'bg-red-500/20 text-red-400'
                                                : ''}
                                                {exec.status === 'TIMED_OUT' ||
                                            exec.status === 'ABORTED'
                                                ? 'bg-orange-500/20 text-orange-400'
                                                : ''}
                                            "
                                        >
                                            {exec.status}
                                        </span>
                                    </td>
                                    <td
                                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                                    >
                                        {exec.startDate
                                            ? new Date(
                                                  exec.startDate,
                                              ).toLocaleString()
                                            : ""}
                                    </td>
                                    <td
                                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                                    >
                                            {exec.stopDate
                                                ? new Date(
                                                      exec.stopDate,
                                                  ).toLocaleString()
                                                : "-"}
                                        </td>
                                    {/snippet}
                                </PaginatedTable>
                            </div>
                        {:else}
                            <div class="h-full flex flex-col -m-4 sm:-m-6">
                                <div
                                    class="px-4 sm:px-6 py-4 bg-gray-900 border-b border-gray-800 shrink-0"
                                >
                                    <div class="flex items-center gap-3">
                                        <button
                                            class="text-gray-400 hover:text-white transition"
                                            onclick={() => {
                                                selectedExecution = null;
                                            }}
                                        >
                                            ← Back to Executions
                                        </button>
                                        <h2
                                            class="text-lg font-bold text-gray-100 flex items-center gap-2"
                                        >
                                            {selectedExecution.name}
                                        </h2>
                                    </div>
                                </div>
                                <div class="flex-1 overflow-auto p-4 sm:p-6 flex flex-col gap-6">
                                    <!-- Details Box -->
                                    <div class="bg-gray-900 border border-gray-800 rounded p-4 shadow-sm shrink-0">
                                        {#if executionDetails}
                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <h3 class="text-xs font-semibold text-gray-500 uppercase mb-1">Status</h3>
                                                    <span
                                                        class="px-2 py-0.5 rounded text-xs font-medium
                                                            {executionDetails.status === 'SUCCEEDED' ? 'bg-green-500/20 text-green-400' : ''}
                                                            {executionDetails.status === 'RUNNING' ? 'bg-blue-500/20 text-blue-400' : ''}
                                                            {executionDetails.status === 'FAILED' ? 'bg-red-500/20 text-red-400' : ''}
                                                            {executionDetails.status === 'TIMED_OUT' || executionDetails.status === 'ABORTED' ? 'bg-orange-500/20 text-orange-400' : ''}
                                                        "
                                                    >
                                                        {executionDetails.status}
                                                    </span>
                                                </div>
                                                <div>
                                                    <h3 class="text-xs font-semibold text-gray-500 uppercase mb-1">Duration</h3>
                                                    <span class="text-sm text-gray-300">
                                                        {#if executionDetails.startDate && executionDetails.stopDate}
                                                            {((new Date(executionDetails.stopDate).getTime() - new Date(executionDetails.startDate).getTime()) / 1000).toFixed(2)}s
                                                        {:else}
                                                            -
                                                        {/if}
                                                    </span>
                                                </div>
                                                <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-800 pt-4 mt-2">
                                                    <div>
                                                        <h3 class="text-xs font-semibold text-gray-500 uppercase mb-2">Input</h3>
                                                        <pre class="bg-gray-950 p-2 rounded text-xs text-gray-300 font-mono overflow-auto max-h-48">{executionDetails.input || "None"}</pre>
                                                    </div>
                                                    <div>
                                                        <h3 class="text-xs font-semibold text-gray-500 uppercase mb-2">Output</h3>
                                                        <pre class="bg-gray-950 p-2 rounded text-xs text-green-400 font-mono overflow-auto max-h-48">{executionDetails.output || "None"}</pre>
                                                    </div>
                                                </div>
                                            </div>
                                        {:else}
                                            <div class="text-sm text-gray-500 animate-pulse">Loading details...</div>
                                        {/if}
                                    </div>

                                    <!-- Event History Table -->
                                    <div class="flex-1 bg-gray-900 border border-gray-800 rounded flex flex-col overflow-hidden min-h-[300px]">
                                        <div class="px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
                                            <h3 class="text-sm font-semibold text-gray-200">Event History</h3>
                                        </div>
                                        <div class="flex-1 relative">
                                            <div class="absolute inset-0">
                                                <PaginatedTable
                                                    items={executionHistory}
                                                    {loading}
                                                    columns={[
                                                        { label: "ID", key: "id", sortable: true },
                                                        { label: "Type", key: "type", sortable: true },
                                                        { label: "Timestamp", key: "timestamp", sortable: true },
                                                    ]}
                                                    hasNext={!!historyCurrentToken}
                                                    hasPrev={historyTokenMap.length > 0}
                                                    onNext={handleHistoryNext}
                                                    onPrev={handleHistoryPrev}
                                                    onRefresh={() => {
                                                        historyTokenMap = [];
                                                        loadExecutionHistory();
                                                    }}
                                                >
                                                    {#snippet children(event: any)}
                                                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 w-16">
                                                            {event.id}
                                                        </td>
                                                        <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-200">
                                                            {event.type}
                                                        </td>
                                                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                                                            {event.timestamp ? new Date(event.timestamp).toLocaleString() : ""}
                                                        </td>
                                                    {/snippet}
                                                </PaginatedTable>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    {:else if detailTab === "start"}
                        <div class="max-w-3xl space-y-4">
                            <h3 class="text-lg font-bold text-gray-100 mb-4">
                                Start Execution
                            </h3>
                            {#if error}
                                <div
                                    class="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded text-sm mb-4"
                                >
                                    {error}
                                </div>
                            {/if}

                            <div
                                class="space-y-4 bg-gray-900 border border-gray-800 p-4 sm:p-5 rounded-lg shadow-sm"
                            >
                                <div>
                                    <label
                                        for="startName"
                                        class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
                                    >
                                        Execution Name <span
                                            class="text-gray-600 font-normal lowercase"
                                            >(Optional)</span
                                        >
                                    </label>
                                    <input
                                        id="startName"
                                        type="text"
                                        bind:value={startName}
                                        class="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:border-blue-500 outline-none transition"
                                        placeholder="my-custom-execution-name"
                                        disabled={loading}
                                    />
                                </div>

                                <div>
                                    <label
                                        for="startInput"
                                        class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
                                    >
                                        Input JSON
                                    </label>
                                    <textarea
                                        id="startInput"
                                        bind:value={startInput}
                                        class="w-full h-48 bg-gray-950 border border-gray-800 rounded p-3 text-sm font-mono text-gray-300 focus:border-blue-500 outline-none transition resize-y"
                                        disabled={loading}
                                    ></textarea>
                                </div>

                                <div class="flex justify-end pt-2">
                                    <button
                                        onclick={startExecution}
                                        disabled={loading}
                                        class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-semibold transition shadow"
                                    >
                                        {loading
                                            ? "Starting..."
                                            : "Start Execution"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</ServiceLayout>
