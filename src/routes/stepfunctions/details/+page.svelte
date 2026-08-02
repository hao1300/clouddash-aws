<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiCircle } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    import {
        DescribeStateMachineCommand,
        ListStateMachinesCommand,
        ListExecutionsCommand,
        StartExecutionCommand,
        DeleteStateMachineCommand,
        type SFNClient,
        type ExecutionListItem,
    } from "@aws-sdk/client-sfn";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import JsonLogViewer from "$lib/components/JsonLogViewer.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { confirmDialog } from "$lib/services/confirm.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import {
        getStateMachineName,
        resolveStateMachineArnByName,
    } from "$lib/utils/sfnStateMachine";

    let requestedStateMachine = $derived(
        $page.url.searchParams.get("name") ||
            $page.url.searchParams.get("id") ||
            "",
    );
    let stateMachineName = $derived(
        getStateMachineName(requestedStateMachine),
    );

    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let smDetails = $state<any>(null);
    let smArn = $state("");
    let detailTab = $state<"executions" | "start" | "definition">("executions");
    let stateMachineLoadGeneration = 0;

    $effect(() => {
        const name = smDetails?.name || stateMachineName;
        titleService.setResource(name, undefined, $page.url.pathname);
    });

    // Executions List
    let executions = $state<ExecutionListItem[]>([]);
    let execMarker = $state<string | undefined>(undefined);
    let execHistory = $state<string[]>([]);

    // Start Execution
    let startInput = $state("{}");
    let startName = $state("");

    $effect(() => {
        const client = aws.sfn;
        const name = stateMachineName;
        if (client && name) {
            refreshStateMachine(client, name);
        }
    });

    async function refreshStateMachine(client: SFNClient, name: string) {
        const generation = ++stateMachineLoadGeneration;
        loading = true;
        error = "";
        actionMsg = "";
        smArn = "";
        smDetails = null;
        executions = [];
        execMarker = undefined;
        execHistory = [];

        try {
            const resolvedArn = await resolveStateMachineArnByName(
                name,
                async (nextToken) =>
                    client.send(
                        new ListStateMachinesCommand({
                            maxResults: 1000,
                            nextToken,
                        }),
                    ),
            );

            if (generation !== stateMachineLoadGeneration) return;

            const [detailsResponse, executionsResponse] = await Promise.all([
                client.send(
                    new DescribeStateMachineCommand({
                        stateMachineArn: resolvedArn,
                    }),
                ),
                client.send(
                    new ListExecutionsCommand({
                        stateMachineArn: resolvedArn,
                        maxResults: 50,
                    }),
                ),
            ]);

            if (generation !== stateMachineLoadGeneration) return;

            smArn = resolvedArn;
            smDetails = detailsResponse;
            executions = executionsResponse.executions || [];
            execMarker = executionsResponse.nextToken;
        } catch (e: any) {
            if (generation !== stateMachineLoadGeneration) return;
            error = e.message || String(e);
        } finally {
            if (generation === stateMachineLoadGeneration) {
                loading = false;
            }
        }
    }

    async function loadExecutions(token?: string) {
        const client = aws.sfn;
        const stateMachineArn = smArn;
        const generation = stateMachineLoadGeneration;
        if (!client || !stateMachineArn) return;

        try {
            loading = true;
            error = "";
            const res = await client.send(
                new ListExecutionsCommand({
                    stateMachineArn,
                    maxResults: 50,
                    nextToken: token,
                }),
            );

            if (
                generation !== stateMachineLoadGeneration ||
                stateMachineArn !== smArn
            ) {
                return;
            }

            executions = res.executions || [];
            if (token) execHistory.push(token);
            execMarker = res.nextToken;
        } catch (e: any) {
            if (generation === stateMachineLoadGeneration) {
                error = e.message || String(e);
            }
        } finally {
            if (
                generation === stateMachineLoadGeneration &&
                stateMachineArn === smArn
            ) {
                loading = false;
            }
        }
    }

    async function handleStart() {
        if (!aws.sfn || !smArn) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await aws.sfn.send(
                new StartExecutionCommand({
                    stateMachineArn: smArn,
                    name: startName || undefined,
                    input: startInput || "{}",
                }),
            );
            actionMsg = `Started: ${res.executionArn?.split(":").pop()}`;
            startName = "";
            detailTab = "executions";
            loadExecutions();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleDelete() {
        if (!aws.sfn || !smArn) return;
        if (!(await confirmDialog({ message: "Delete this state machine?", confirmText: "Delete", destructive: true })))
            return;
        try {
            loading = true;
            await aws.sfn.send(
                new DeleteStateMachineCommand({ stateMachineArn: smArn }),
            );
            goto("/stepfunctions");
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleBack() {
        goto("/stepfunctions");
    }

    function handleSelectExecution(exec: ExecutionListItem) {
        goto(`/stepfunctions/execution?id=${exec.executionArn}`);
    }
</script>

{#snippet statusCell(v: string)}
    <div class="flex items-center gap-1.5">
        <Icon
            path={mdiCircle}
            size={10}
            color={v === "SUCCEEDED"
                ? COLORS.SUCCESS
                : v === "RUNNING"
                  ? COLORS.INFO
                  : COLORS.ERROR}
        />
        <span>{v}</span>
    </div>
{/snippet}

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
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

    <div class="px-6 border-b border-gray-800 bg-gray-900 shrink-0 flex justify-between items-center {error || actionMsg ? 'mt-8' : ''}">
        <nav class="flex gap-4">
            <button
                onclick={() => (detailTab = "executions")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'executions'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Executions</button
            >
            <button
                onclick={() => (detailTab = "start")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'start'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}"
                >Start Execution</button
            >
            <button
                onclick={() => (detailTab = "definition")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'definition'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Definition</button
            >
        </nav>
        <button
            onclick={handleDelete}
            class="text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-1.5 rounded transition border border-red-500/30"
        >Delete</button>
    </div>

    <div class="flex-1 overflow-auto p-6 min-h-0 relative">
        {#if detailTab === "executions"}
            <div class="absolute inset-0">
                <PaginatedTable
                    items={executions}
                    {loading}
                    onRefresh={() => {
                        execHistory = [];
                        loadExecutions();
                    }}
                    hasNext={!!execMarker}
                    hasPrev={execHistory.length > 0}
                    onNext={() => loadExecutions(execMarker)}
                    onPrev={() => {
                        execHistory.pop();
                        loadExecutions(execHistory[execHistory.length - 1]);
                    }}
                    columns={[
                        {
                            label: "Name",
                            key: "name",
                            onClick: (item) => handleSelectExecution(item),
                        },
                        {
                            label: "Status",
                            key: "status",
                            renderCell: statusCell,
                        },
                        {
                            label: "Start Date",
                            key: "startDate",
                            format: (v) =>
                                v ? new Date(v).toLocaleString() : "",
                        },
                    ]}
                />
            </div>
        {:else if detailTab === "start"}
            <div
                class="max-w-2xl bg-gray-900 p-5 rounded-lg border border-gray-800"
            >
                <div class="mb-4">
                    <label
                        for="start-name"
                        class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                    >
                        Execution Name (Optional)
                    </label>
                    <input
                        id="start-name"
                        type="text"
                        bind:value={startName}
                        class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
                    />
                </div>
                <div class="mb-4">
                    <label
                        for="start-input"
                        class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                    >
                        Input JSON
                    </label>
                    <textarea
                        id="start-input"
                        bind:value={startInput}
                        class="w-full h-48 bg-black border border-gray-700 rounded p-3 text-xs font-mono text-gray-300 outline-none focus:border-blue-500"
                    ></textarea>
                </div>
                <button
                    onclick={handleStart}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold shadow"
                    >Start Execution</button
                >
            </div>
        {:else if detailTab === "definition"}
            <div class="bg-gray-900 p-5 rounded-lg border border-gray-800">
                {#if smDetails?.definition}
                    <JsonLogViewer
                        message={smDetails.definition}
                        class="text-xs text-green-400"
                    />
                {:else}
                    <div class="text-xs text-green-400 font-mono">Loading...</div>
                {/if}
            </div>
        {/if}
    </div>
</div>
