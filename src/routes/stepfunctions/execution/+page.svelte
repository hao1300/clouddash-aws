<script lang="ts">
    import {
        DescribeExecutionCommand,
        DescribeStateMachineCommand,
        GetExecutionHistoryCommand,
        RedriveExecutionCommand,
        StopExecutionCommand,
        StartExecutionCommand,
        type HistoryEvent,
    } from "@aws-sdk/client-sfn";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import JsonLogViewer from "$lib/components/JsonLogViewer.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import StepFunctionsGraph from "$lib/components/StepFunctionsGraph.svelte";
    import type { StateExecutionDetails } from "$lib/utils/sfnHistoryParser";
    import JsonEditor from "$lib/components/JsonEditor.svelte";

    let execArn = $derived($page.url.searchParams.get("id") || "");

    let loading = $state(false);
    let error = $state("");
    let details = $state<any>(null);
    let smDetails = $state<any>(null);
    let logGroupName = $state<string | null>(null);
    let historyEvents = $state<HistoryEvent[]>([]);
    let historyMarker = $state<string | undefined>(undefined);
    let historyTokens = $state<string[]>([]);

    let isStopping = $state(false);
    let isRedriving = $state(false);
    
    let eventModalOpen = $state(false);
    let selectedEvent = $state<HistoryEvent | null>(null);

    let viewMode = $state<"graph" | "table">("graph");
    let selectedNodeState = $state<string | null>(null);
    let selectedNodeDetails = $state<StateExecutionDetails | null>(null);
    let selectedNodeRaw = $state<any>(null);

    let startModalOpen = $state(false);
    let startInput = $state("{}");
    let startName = $state("");
    let isStarting = $state(false);

    function openStartModal() {
        startInput = details?.input || "{}";
        startName = "";
        startModalOpen = true;
    }

    async function handleStartNew() {
        if (!aws.sfn || !details?.stateMachineArn) return;
        try {
            isStarting = true;
            const res = await aws.sfn.send(
                new StartExecutionCommand({
                    stateMachineArn: details.stateMachineArn,
                    name: startName || undefined,
                    input: startInput,
                }),
            );
            startModalOpen = false;
            goto(`/stepfunctions/execution?id=${res.executionArn}`);
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            isStarting = false;
        }
    }

    function handleNodeSelect(stateName: string, details: StateExecutionDetails | null, rawDef: any) {
        selectedNodeState = stateName;
        selectedNodeDetails = details;
        selectedNodeRaw = rawDef;
    }

    function getResourceInfo(details: StateExecutionDetails | null, raw: any) {
        let baseArn = details?.resource || raw?.Resource;
        if (!baseArn || typeof baseArn !== 'string') return null;

        let arn = baseArn;
        let type = "";

        // Handle Optimized Integrations
        if (baseArn.startsWith("arn:aws:states:::")) {
            const service = baseArn.split(":")[6];
            
            // Try to find the actual resource identifier in Parameters or Arguments
            const actualResource = 
                raw?.Parameters?.FunctionName || 
                raw?.Parameters?.FunctionArn ||
                raw?.Parameters?.QueueUrl ||
                raw?.Parameters?.TopicArn ||
                raw?.Parameters?.StateMachineArn ||
                raw?.Arguments?.FunctionName ||
                raw?.Arguments?.FunctionArn ||
                details?.resource; // fallback

            if (actualResource && typeof actualResource === 'string') {
                arn = actualResource;
            }

            if (service === "lambda") type = "Lambda";
            else if (service === "sns") type = "SNS";
            else if (service === "sqs") type = "SQS";
            else if (service === "states") type = "StepFunctions";
            else if (service === "dynamodb") type = "DynamoDB";
        }

        // Determine type from ARN if not set
        if (!type) {
            if (arn.includes(":lambda:")) type = "Lambda";
            else if (arn.includes(":states:")) type = "StepFunctions";
            else if (arn.includes(":sns:")) type = "SNS";
            else if (arn.includes(":sqs:")) type = "SQS";
            else if (arn.includes(":dynamodb:")) type = "DynamoDB";
        }

        if (!type) return null;

        // Extract a friendly name
        let name = arn;
        if (arn.includes(":")) {
            const parts = arn.split(":");
            // For ARNs like arn:aws:lambda:region:account:function:name
            const functionIdx = parts.indexOf("function");
            const stateMachineIdx = parts.indexOf("stateMachine");
            
            if (functionIdx !== -1 && parts[functionIdx + 1]) name = parts[functionIdx + 1];
            else if (stateMachineIdx !== -1 && parts[stateMachineIdx + 1]) name = parts[stateMachineIdx + 1];
            else name = parts[parts.length - 1];
        }
        // If it's a URL (for SQS), take the last part
        if (name.includes("/")) {
            name = name.split("/").pop() || name;
        }

        let href = "#";
        let logGroup = "";
        let requestId = "";

        if (type === "Lambda") {
            href = `/lambda/function/${encodeURIComponent(arn)}`;
            logGroup = `/aws/lambda/${name}`;
            
            if (details?.error?.cause) {
                try {
                    const cause = JSON.parse(details.error.cause);
                    requestId = cause.requestId || "";
                } catch (e) { /* ignore */ }
            }
        } else if (type === "StepFunctions") {
            href = `/stepfunctions/details?id=${encodeURIComponent(arn)}`;
        } else if (type === "SQS") {
            href = `/sqs/queue?url=${encodeURIComponent(arn)}`;
        } else if (type === "SNS") {
            href = `/sns/topic?arn=${encodeURIComponent(arn)}`;
        }

        return {
            type,
            label: type === "StepFunctions" ? "State Machine" : `${type} Resource`,
            name,
            href,
            logGroup,
            requestId
        };
    }

    $effect(() => {
        if (aws.sfn && execArn) {
            loadDetails();
            loadHistory();
        }
    });

    $effect(() => {
        const parts = execArn.split(":");
        const isExecution = parts.length >= 8 && parts[5] === "execution";

        let machineName = "Unknown Machine";
        let executionName = "Unknown Execution";

        if (details) {
            machineName =
                details.stateMachineArn?.split(":").pop() || machineName;
            executionName = details.name || executionName;
        } else if (isExecution) {
            machineName = parts[6];
            executionName = parts[7];
        }

        const machineHref = details?.stateMachineArn
            ? `/stepfunctions/details?id=${details.stateMachineArn}`
            : undefined;

        titleService.setResources([
            {
                name: machineName,
                href: machineHref,
                path: "/stepfunctions/details",
            },
            { name: executionName, path: $page.url.pathname },
        ]);
    });

    async function loadDetails() {
        if (!aws.sfn || !execArn) return;
        try {
            const res = await aws.sfn.send(
                new DescribeExecutionCommand({ executionArn: execArn }),
            );
            details = res;

            if (res.stateMachineArn) {
                const sm = await aws.sfn.send(
                    new DescribeStateMachineCommand({
                        stateMachineArn: res.stateMachineArn,
                    }),
                );
                smDetails = sm;

                const logDest =
                    sm.loggingConfiguration?.destinations?.[0]
                        ?.cloudWatchLogsLogGroup?.logGroupArn;
                if (logDest) {
                    const parts = logDest.split(":log-group:");
                    if (parts.length > 1) {
                        logGroupName = parts[1].replace(/:\*$/, "");
                    }
                }
            }
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
                    maxResults: 500,
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

    function getEventResource(event: HistoryEvent) {
        let arn = event.lambdaFunctionScheduledEventDetails?.resource || 
                    event.taskScheduledEventDetails?.resource ||
                    event.stateMachineScheduledEventDetails?.stateMachineArn;
        
        if (!arn) return null;

        // Handle optimized integrations in history events
        if (arn.startsWith("arn:aws:states:::") && event.taskScheduledEventDetails?.parameters) {
            try {
                const params = JSON.parse(event.taskScheduledEventDetails.parameters);
                const actual = params.FunctionName || params.FunctionArn || params.QueueUrl || params.TopicArn || params.StateMachineArn;
                if (actual && typeof actual === 'string') {
                    arn = actual;
                }
            } catch (e) { /* ignore */ }
        }

        if (arn.includes(":lambda:")) {
            const parts = arn.split(":");
            const functionIdx = parts.indexOf("function");
            const name = functionIdx !== -1 && parts[functionIdx + 1] ? parts[functionIdx + 1] : parts[parts.length - 1];
            return { label: name, href: `/lambda/function/${encodeURIComponent(arn)}` };
        }
        if (arn.includes(":states:")) {
            const name = arn.split(":").pop() || "";
            return { label: name, href: `/stepfunctions/details?id=${encodeURIComponent(arn)}` };
        }
        if (arn.includes(":sqs:")) {
            return { label: arn.split("/").pop() || "Queue", href: `/sqs/queue?url=${encodeURIComponent(arn)}` };
        }
        if (arn.includes(":sns:")) {
            return { label: arn.split(":").pop() || "Topic", href: `/sns/topic?arn=${encodeURIComponent(arn)}` };
        }
        return { label: arn.split(":").pop() || "Resource", href: "#" };
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>
    {/if}

    <div class="px-6 border-b border-gray-800 bg-gray-900 shrink-0 flex justify-between items-center flex-wrap gap-y-2 {error ? 'mt-8' : ''}">
        <nav class="flex gap-4">
            <button
                onclick={() => (viewMode = "graph")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {viewMode ===
                'graph'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Visual Graph</button
            >
            <button
                onclick={() => (viewMode = "table")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {viewMode ===
                'table'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Event History</button
            >
        </nav>

        <div class="flex items-center gap-2 py-2 flex-wrap justify-end">
            {#if logGroupName}
                <a
                    href={`/cloudwatch/logs?group=${encodeURIComponent(logGroupName)}`}
                    class="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-3 py-1.5 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                    title="View CloudWatch Logs"
                >
                    ▤ Logs
                </a>
            {/if}
            {#if ["FAILED", "TIMED_OUT", "ABORTED"].includes(details?.status)}
                <button
                    onclick={handleRedrive}
                    disabled={isRedriving}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-2"
                >
                    {#if isRedriving}<span class="animate-spin">⟳</span>{/if}
                    Redrive
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
            <button
                onclick={openStartModal}
                class="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-2"
            >
                ▷ Start New
            </button>
        </div>
    </div>

    <div class="flex-1 overflow-hidden p-2 flex gap-2 relative">
        {#if viewMode === 'graph'}
            <div class="flex-1 rounded-lg overflow-hidden relative shadow-sm border border-gray-800">
                {#if smDetails?.definition}
                    <StepFunctionsGraph 
                        definition={smDetails.definition} 
                        {historyEvents} 
                        onNodeSelect={handleNodeSelect} 
                    />
                {:else}
                    <div class="absolute inset-0 flex items-center justify-center bg-gray-950 text-gray-500 text-sm">
                        Loading Definition...
                    </div>
                {/if}
            </div>

            {#if selectedNodeState}
                {@const resInfo = getResourceInfo(selectedNodeDetails, selectedNodeRaw)}
                <div class="w-80 shrink-0 bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden shadow-sm">
                    <div class="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                        <h3 class="font-bold text-sm text-gray-200 truncate pr-2" title={selectedNodeState}>{selectedNodeState}</h3>
                        <button onclick={() => selectedNodeState = null} class="text-gray-500 hover:text-gray-300">✕</button>
                    </div>
                    
                    <div class="flex-1 overflow-auto p-3 space-y-4">
                        <div class="flex items-center justify-between">
                            <div class="text-[11px] px-2 py-1 bg-gray-800 rounded text-gray-300 font-mono tracking-wider w-fit inline-block border border-gray-700">
                                Status: <span class="{selectedNodeDetails?.status === 'SUCCEEDED' ? 'text-green-400' : selectedNodeDetails?.status === 'FAILED' ? 'text-red-400' : selectedNodeDetails?.status === 'RUNNING' ? 'text-blue-400 animate-pulse' : 'text-gray-400'}">{selectedNodeDetails?.status || 'PENDING'}</span>
                            </div>
                            <span class="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{selectedNodeRaw?.Type || 'Unknown'}</span>
                        </div>

                        {#if selectedNodeDetails?.status === 'FAILED' && selectedNodeDetails?.error}
                            <div class="bg-red-500/5 border border-red-500/20 rounded p-3 space-y-2">
                                <div class="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                    Error Details
                                </div>
                                <div class="text-xs text-red-300 font-bold">{selectedNodeDetails.error.error || 'Unknown Error'}</div>
                                {#if selectedNodeDetails.error.cause}
                                    <div class="text-[10px] text-gray-400 font-mono bg-black/40 p-1.5 rounded border border-red-500/10 overflow-auto max-h-32">
                                        {selectedNodeDetails.error.cause}
                                    </div>
                                {/if}
                            </div>
                        {/if}

                        {#if resInfo}
                            <div class="bg-blue-500/5 border border-blue-500/20 rounded p-3 space-y-2">
                                <div class="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                    Linked {resInfo.label}
                                </div>
                                <div class="text-xs text-gray-300 font-bold truncate">{resInfo.name}</div>
                                <div class="flex gap-2 pt-1">
                                    <a href={resInfo.href} class="flex-1 text-center bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-[10px] font-bold transition shadow-sm">
                                        Definition
                                    </a>
                                    {#if resInfo.logGroup}
                                        <a href={`/cloudwatch/logs/${encodeURIComponent(resInfo.logGroup)}${resInfo.requestId ? '?filter=' + encodeURIComponent(resInfo.requestId) : ''}`} class="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-2 py-1 rounded text-[10px] font-bold transition">
                                            Logs {resInfo.requestId ? ' (Trace)' : ''}
                                        </a>
                                    {/if}
                                </div>
                            </div>
                        {/if}

                        <div class="space-y-4">
                            <div>
                                <h4 class="text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest border-b border-gray-800 pb-1">Input</h4>
                                <div class="bg-black p-2 rounded text-[11px] overflow-auto max-h-40 border border-gray-800/50">
                                    <JsonLogViewer message={selectedNodeDetails?.input} class="text-gray-300" />
                                </div>
                            </div>

                            {#if selectedNodeDetails?.output}
                                <div>
                                    <h4 class="text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest border-b border-gray-800 pb-1">Output</h4>
                                    <div class="bg-black p-2 rounded text-[11px] overflow-auto max-h-40 border border-gray-800/50">
                                        <JsonLogViewer message={selectedNodeDetails?.output} class="text-green-400" />
                                    </div>
                                </div>
                            {/if}

                            <div>
                                <h4 class="text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest border-b border-gray-800 pb-1">Definition</h4>
                                <div class="bg-black p-2 rounded text-[11px] overflow-auto max-h-48 border border-gray-800/50">
                                    <JsonLogViewer message={JSON.stringify(selectedNodeRaw, null, 2)} class="text-blue-300" />
                                </div>
                            </div>
                        </div>

                        {#if logGroupName && selectedNodeRaw?.Type === 'Task' && !resInfo?.logGroup}
                            <a href={`/cloudwatch/logs/${encodeURIComponent(logGroupName)}`} class="block w-full text-center bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-3 py-2 rounded text-xs font-bold transition shadow-sm mt-4">
                                ▤ View State Machine Logs
                            </a>
                        {/if}
                    </div>
                </div>
            {/if}
        {:else}
            <div class="flex-1 flex flex-col space-y-2 overflow-auto">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-sm shrink-0">
                    <div>
                        <h3 class="text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest border-b border-gray-800 pb-1">Overall Input</h3>
                        <div class="bg-black p-3 rounded text-[11px] overflow-auto max-h-48 border border-gray-800/50">
                            <JsonLogViewer message={details?.input || "None"} class="text-gray-300" />
                        </div>
                    </div>
                    <div>
                        <h3 class="text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest border-b border-gray-800 pb-1">Overall Output</h3>
                        <div class="bg-black p-3 rounded text-[11px] overflow-auto max-h-48 border border-gray-800/50">
                            <JsonLogViewer message={details?.output || "None"} class="text-green-400" />
                        </div>
                    </div>
                </div>

                <div class="flex-1 bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden min-h-[300px] shadow-sm">
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
                                { 
                                    label: "Type", 
                                    key: "type",
                                    onClick: (item) => {
                                        selectedEvent = item;
                                        eventModalOpen = true;
                                    }
                                },
                                {
                                    label: "Resource",
                                    key: "id",
                                    format: (_, item) => getEventResource(item)?.label || "",
                                    onClick: (item) => {
                                        const res = getEventResource(item);
                                        if (res && res.href !== "#") goto(res.href);
                                    }
                                },
                                {
                                    label: "Timestamp",
                                    key: "timestamp",
                                    format: (v) => v ? new Date(v).toLocaleString() : "",
                                },
                            ]}
                        />
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<Modal bind:open={eventModalOpen} title={`Event Detail: ${selectedEvent?.type || ""}`} maxWidth="max-w-4xl">
    <div class="bg-black border border-gray-800 rounded-lg p-4 max-h-[75vh] min-h-[30vh] overflow-auto shadow-inner">
        {#if selectedEvent}
            <JsonLogViewer message={JSON.stringify(selectedEvent, null, 2)} class="text-[11px] text-green-400" />
        {/if}
    </div>
</Modal>

<Modal bind:open={startModalOpen} title="Start New Execution" maxWidth="max-w-2xl">
    <div class="space-y-4">
        <div>
            <label for="new-exec-name" class="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest">
                Execution Name (Optional)
            </label>
            <input
                id="new-exec-name"
                type="text"
                bind:value={startName}
                class="w-full bg-black border border-gray-800 rounded p-2 text-xs text-gray-300 focus:border-blue-500 outline-none"
                placeholder="Leave blank for auto-generated name"
            />
        </div>
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest">
                Input JSON
            </label>
            <div class="h-64 border border-gray-800 rounded overflow-hidden bg-black">
                <JsonEditor bind:value={startInput} />
            </div>
        </div>
        <div class="flex justify-end gap-3 pt-2">
            <button onclick={() => startModalOpen = false} class="px-4 py-2 text-xs font-bold text-gray-400 hover:text-gray-200 transition">
                Cancel
            </button>
            <button
                onclick={handleStartNew}
                disabled={isStarting}
                class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow-sm flex items-center gap-2"
            >
                {#if isStarting}<span class="animate-spin">⟳</span>{/if}
                Run Execution
            </button>
        </div>
    </div>
</Modal>
