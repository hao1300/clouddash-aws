<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudFormationClient,
        DescribeStacksCommand,
        ListExportsCommand,
        ListStackSetsCommand,
        DescribeStackEventsCommand,
        DescribeStackResourcesCommand,
        GetTemplateCommand,
        type Export,
        type StackSetSummary,
        type Stack,
        type StackEvent,
        type StackResource,
    } from "@aws-sdk/client-cloudformation";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: CloudFormationClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "stacks", label: "Stacks" },
        { id: "exports", label: "Exports" },
        { id: "stack-sets", label: "StackSets" }
    ];
    let activeTab = $state("stacks");



    // --- Resources State ---
    let stacksLoaded = $state(false);

    let exportsList = $state<Export[]>([]);
    let exportsLoading = $state(false);
    let exportsLoaded = $state(false);
    let exportTokenMap = $state<string[]>([]);
    let exportCurrentToken = $state<string | undefined>(undefined);

    let stackSets = $state<StackSetSummary[]>([]);
    let stackSetsLoading = $state(false);
    let stackSetsLoaded = $state(false);
    let stackSetTokenMap = $state<string[]>([]);
    let stackSetCurrentToken = $state<string | undefined>(undefined);

    $effect(() => {
        if (!client) return;
        if (activeTab === "stacks" && !stacksLoaded) loadStacks();
        else if (activeTab === "exports" && !exportsLoaded) loadExports();
        else if (activeTab === "stack-sets" && !stackSetsLoaded) loadStackSets();
    });

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

    // --- Stacks ---
    let stacks = $state<Stack[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    // --- Detail View ---
    let selectedStack = $state<Stack | null>(null);
    let detailTab = $state<"overview" | "events" | "resources" | "template">("overview");

    // Events state
    let stackEvents = $state<StackEvent[]>([]);
    let eventsLoading = $state(false);
    let eventsError = $state("");
    let eventsTokenMap = $state<string[]>([]);
    let eventsCurrentToken = $state<string | undefined>(undefined);

    // Resources state
    let stackResources = $state<StackResource[]>([]);
    let resourcesLoading = $state(false);
    let resourcesError = $state("");

    // Template state
    let stackTemplate = $state<string | null>(null);
    let templateLoading = $state(false);
    let templateError = $state("");

    $effect(() => {
        if (!selectedStack) return;
        if (detailTab === "events" && stackEvents.length === 0 && !eventsError) {
            loadStackEvents();
        } else if (detailTab === "resources" && stackResources.length === 0 && !resourcesError) {
            loadStackResources();
        } else if (detailTab === "template" && stackTemplate === null && !templateError) {
            loadStackTemplate();
        }
    });

    function openStack(stack: Stack) {
        selectedStack = stack;
        detailTab = "overview";
        stackEvents = [];
        eventsTokenMap = [];
        eventsCurrentToken = undefined;
        eventsError = "";
        stackResources = [];
        resourcesError = "";
        stackTemplate = null;
        templateError = "";
    }

    async function loadStackEvents(token?: string) {
        if (!client || !selectedStack?.StackName) return;
        eventsLoading = true;
        eventsError = "";
        try {
            const res = await client.send(
                new DescribeStackEventsCommand({ StackName: selectedStack.StackName, NextToken: token })
            );
            stackEvents = res.StackEvents || [];
            eventsCurrentToken = res.NextToken;
        } catch (e: any) {
            eventsError = e.message || String(e);
        } finally {
            eventsLoading = false;
        }
    }

    async function loadStackResources() {
        if (!client || !selectedStack?.StackName) return;
        resourcesLoading = true;
        resourcesError = "";
        try {
            const res = await client.send(
                new DescribeStackResourcesCommand({ StackName: selectedStack.StackName })
            );
            stackResources = res.StackResources || [];
        } catch (e: any) {
            resourcesError = e.message || String(e);
        } finally {
            resourcesLoading = false;
        }
    }

    async function loadStackTemplate() {
        if (!client || !selectedStack?.StackName) return;
        templateLoading = true;
        templateError = "";
        try {
            const res = await client.send(
                new GetTemplateCommand({ StackName: selectedStack.StackName })
            );
            stackTemplate = res.TemplateBody || null;
        } catch (e: any) {
            templateError = e.message || String(e);
        } finally {
            templateLoading = false;
        }
    }

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new CloudFormationClient({
                region: creds.region || "us-east-1",
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            });
            // loadStacks will be called by $effect
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    async function loadStacks(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new DescribeStacksCommand({ NextToken: token }),
            );
            stacks = res.Stacks || [];
            currentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
            stacksLoaded = true;
        }
    }


    async function loadExports(token?: string) {
        if (!client) return;
        exportsLoading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListExportsCommand({ NextToken: token }),
            );
            exportsList = res.Exports || [];
            exportCurrentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            exportsLoading = false;
            exportsLoaded = true;
        }
    }

    async function loadStackSets(token?: string) {
        if (!client) return;
        stackSetsLoading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListStackSetsCommand({ NextToken: token, Status: "ACTIVE" }),
            );
            stackSets = res.Summaries || [];
            stackSetCurrentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            stackSetsLoading = false;
            stackSetsLoaded = true;
        }
    }

    const exportColumns = [
        { label: "Name", key: "Name", sortable: true },
        { label: "Value", key: "Value", sortable: true },
        { label: "Exporting Stack ID", key: "ExportingStackId", sortable: true },
    ];

    const stackSetColumns = [
        { label: "StackSet Name", key: "StackSetName", sortable: true },
        { label: "StackSet ID", key: "StackSetId", sortable: true },
        { label: "Status", key: "Status", sortable: true },
        { label: "Description", key: "Description", sortable: true },
    ];

    function handleNext() {
        if (currentToken) {
            pushToken(tokenMap, currentToken);
            loadStacks(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadStacks(prevToken);
    }
</script>

<ServiceLayout title="CloudFormation" {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    {#if activeTab === "stacks"}
        {#if !selectedStack}
            <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
                <PaginatedTable
                    items={stacks}
                    {loading}
                    columns={[
                        {
                            label: "Stack Name",
                            key: "StackName",
                            sortable: true,
                        },
                        { label: "Status", key: "StackStatus", sortable: true },
                        {
                            label: "Creation Time",
                            key: "CreationTime",
                            sortable: true,
                        },
                        {
                            label: "Description",
                            key: "Description",
                            sortable: true,
                        },
                    ]}
                    hasNext={!!currentToken}
                    hasPrev={tokenMap.length > 0}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onRefresh={() => {
                        tokenMap = [];
                        stacksLoaded = false;
                        loadStacks();
                    }}
                >
                    {#snippet children(stack: any)}
                        <td class="px-4 py-3 whitespace-nowrap">
                            <button
                                class="text-blue-400 hover:text-blue-300 font-medium hover:underline text-left text-sm"
                                onclick={() => openStack(stack)}
                            >
                                {stack.StackName}
                            </button>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm">
                            <span
                                class="px-2 py-0.5 rounded text-xs {stack.StackStatus?.includes(
                                    'COMPLETE',
                                )
                                    ? 'bg-green-500/20 text-green-400'
                                    : stack.StackStatus?.includes('FAILED')
                                      ? 'bg-red-500/20 text-red-400'
                                      : 'bg-yellow-500/20 text-yellow-400'}"
                            >
                                {stack.StackStatus}
                            </span>
                        </td>
                        <td
                            class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                        >
                            {stack.CreationTime
                                ? new Date(stack.CreationTime).toLocaleString()
                                : ""}
                        </td>
                        <td
                            class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]"
                        >
                            {stack.Description || "-"}
                        </td>
                    {/snippet}
                </PaginatedTable>
            </div>
        {:else}
            <!-- Drill Down / Detail View -->
            <div class="h-full flex flex-col -m-4 sm:-m-6">
                <!-- Header -->
                <div class="px-4 sm:px-6 py-4 bg-gray-900 border-b border-gray-800 shrink-0">
                    <div class="flex items-center gap-3">
                        <button
                            class="text-gray-400 hover:text-white transition"
                            onclick={() => {
                                selectedStack = null;
                            }}
                        >
                            ← Back
                        </button>
                        <h2 class="text-lg font-bold text-gray-100 flex items-center gap-2">
                            <span class="text-indigo-400">📦</span>
                            {selectedStack.StackName}
                        </h2>
                    </div>
                </div>

                <!-- Inner Tabs -->
                <div class="px-4 sm:px-6 border-b border-gray-800 bg-gray-900 shrink-0 overflow-x-auto scrollbar-hide">
                    <nav class="flex gap-4 min-w-max">
                        <button
                            onclick={() => (detailTab = "overview")}
                            class="py-3 text-sm font-semibold transition border-b-2 whitespace-nowrap {detailTab ===
                            'overview'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'}"
                        >
                            Overview & Outputs
                        </button>
                        <button
                            onclick={() => (detailTab = "events")}
                            class="py-3 text-sm font-semibold transition border-b-2 whitespace-nowrap {detailTab ===
                            'events'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'}"
                        >
                            Events
                        </button>
                        <button
                            onclick={() => (detailTab = "resources")}
                            class="py-3 text-sm font-semibold transition border-b-2 whitespace-nowrap {detailTab ===
                            'resources'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'}"
                        >
                            Resources
                        </button>
                        <button
                            onclick={() => (detailTab = "template")}
                            class="py-3 text-sm font-semibold transition border-b-2 whitespace-nowrap {detailTab ===
                            'template'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'}"
                        >
                            Template
                        </button>
                    </nav>
                </div>

                <!-- Inner Content -->
                <div class="flex-1 overflow-auto p-4 sm:p-6 relative min-h-0 bg-gray-950">
                    <div class="max-w-4xl space-y-6">
                        {#if detailTab === "overview"}
                            <div class="bg-gray-900 border border-gray-800 p-4 sm:p-5 rounded-lg shadow-sm">
                                <h3 class="text-lg font-bold text-gray-100 mb-4">Stack Information</h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                    <div>
                                        <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Stack ID</h4>
                                        <span class="text-sm text-gray-300 font-mono break-all">{selectedStack.StackId}</span>
                                    </div>
                                    <div>
                                        <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Status</h4>
                                        <span class="text-sm {selectedStack.StackStatus?.includes('COMPLETE') ? 'text-green-400' : selectedStack.StackStatus?.includes('FAILED') ? 'text-red-400' : 'text-yellow-400'} font-medium">{selectedStack.StackStatus}</span>
                                    </div>
                                    <div>
                                        <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Description</h4>
                                        <span class="text-sm text-gray-300 break-words">{selectedStack.Description || "-"}</span>
                                    </div>
                                    <div>
                                        <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Creation Time</h4>
                                        <span class="text-sm text-gray-300">{selectedStack.CreationTime ? new Date(selectedStack.CreationTime).toLocaleString() : "-"}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden mt-6">
                                <div class="px-4 py-3 border-b border-gray-800 bg-gray-900/80">
                                    <h4 class="text-sm font-bold text-gray-300">Outputs</h4>
                                </div>
                                <div class="p-4 bg-gray-950 overflow-x-auto">
                                    {#if selectedStack.Outputs && selectedStack.Outputs.length > 0}
                                        <table class="w-full text-left text-sm">
                                            <thead>
                                                <tr>
                                                    <th class="px-3 py-2 text-gray-400 font-semibold border-b border-gray-800">Key</th>
                                                    <th class="px-3 py-2 text-gray-400 font-semibold border-b border-gray-800">Value</th>
                                                    <th class="px-3 py-2 text-gray-400 font-semibold border-b border-gray-800">Description</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {#each selectedStack.Outputs as output}
                                                    <tr class="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                                                        <td class="px-3 py-2 text-gray-300 font-mono font-medium">{output.OutputKey}</td>
                                                        <td class="px-3 py-2 text-green-400 font-mono break-all">{output.OutputValue}</td>
                                                        <td class="px-3 py-2 text-gray-400 text-xs">{output.Description || "-"}</td>
                                                    </tr>
                                                {/each}
                                            </tbody>
                                        </table>
                                    {:else}
                                        <div class="text-sm text-gray-500 italic p-2 text-center">No outputs for this stack.</div>
                                    {/if}
                                </div>
                            </div>

                        {:else if detailTab === "events"}
                            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden min-h-[400px] flex flex-col">
                                {#if eventsError}
                                    <div class="bg-red-500/10 border-b border-red-500/20 text-red-400 p-3 text-sm">{eventsError}</div>
                                {/if}
                                <div class="flex-1 relative">
                                    <PaginatedTable
                                        items={stackEvents}
                                        loading={eventsLoading}
                                        columns={[
                                            { label: "Time", key: "Timestamp", sortable: true },
                                            { label: "Status", key: "ResourceStatus", sortable: true },
                                            { label: "Type", key: "ResourceType", sortable: true },
                                            { label: "Logical ID", key: "LogicalResourceId", sortable: true },
                                            { label: "Status Reason", key: "ResourceStatusReason", sortable: true }
                                        ]}
                                        hasNext={!!eventsCurrentToken}
                                        hasPrev={eventsTokenMap.length > 0}
                                        onNext={() => {
                                            if (eventsCurrentToken) {
                                                if (eventsTokenMap[eventsTokenMap.length - 1] !== eventsCurrentToken) eventsTokenMap.push(eventsCurrentToken);
                                                loadStackEvents(eventsCurrentToken);
                                            }
                                        }}
                                        onPrev={() => {
                                            eventsTokenMap.pop();
                                            const prevToken = eventsTokenMap.length > 0 ? eventsTokenMap[eventsTokenMap.length - 1] : undefined;
                                            loadStackEvents(prevToken);
                                        }}
                                        onRefresh={() => {
                                            eventsTokenMap = [];
                                            loadStackEvents();
                                        }}
                                    >
                                        {#snippet children(ev: any)}
                                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">{ev.Timestamp ? new Date(ev.Timestamp).toLocaleString() : ""}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium {ev.ResourceStatus?.includes('FAILED') ? 'text-red-400' : ev.ResourceStatus?.includes('COMPLETE') ? 'text-green-400' : 'text-yellow-400'}">{ev.ResourceStatus}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{ev.ResourceType}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-sm text-blue-400">{ev.LogicalResourceId}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]" title={ev.ResourceStatusReason}>{ev.ResourceStatusReason || "-"}</td>
                                        {/snippet}
                                    </PaginatedTable>
                                </div>
                            </div>

                        {:else if detailTab === "resources"}
                            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden min-h-[400px] flex flex-col">
                                {#if resourcesError}
                                    <div class="bg-red-500/10 border-b border-red-500/20 text-red-400 p-3 text-sm">{resourcesError}</div>
                                {/if}
                                <div class="flex-1 relative">
                                    <PaginatedTable
                                        items={stackResources}
                                        loading={resourcesLoading}
                                        columns={[
                                            { label: "Logical ID", key: "LogicalResourceId", sortable: true },
                                            { label: "Physical ID", key: "PhysicalResourceId", sortable: true },
                                            { label: "Type", key: "ResourceType", sortable: true },
                                            { label: "Status", key: "ResourceStatus", sortable: true },
                                            { label: "Last Updated", key: "Timestamp", sortable: true }
                                        ]}
                                    >
                                        {#snippet children(res: any)}
                                            <td class="px-4 py-3 whitespace-nowrap text-sm text-blue-400">{res.LogicalResourceId}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-300 font-mono text-xs">{res.PhysicalResourceId}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{res.ResourceType}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium {res.ResourceStatus?.includes('FAILED') ? 'text-red-400' : res.ResourceStatus?.includes('COMPLETE') ? 'text-green-400' : 'text-yellow-400'}">{res.ResourceStatus}</td>
                                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">{res.Timestamp ? new Date(res.Timestamp).toLocaleString() : ""}</td>
                                        {/snippet}
                                    </PaginatedTable>
                                </div>
                            </div>

                        {:else if detailTab === "template"}
                            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden">
                                <div class="px-4 py-3 border-b border-gray-800 bg-gray-900/80 flex items-center justify-between">
                                    <h4 class="text-sm font-bold text-gray-300">Template Body</h4>
                                    {#if templateLoading}
                                        <span class="text-xs text-blue-400 animate-pulse">Loading...</span>
                                    {/if}
                                </div>
                                <div class="p-4 bg-gray-950">
                                    {#if templateError}
                                        <div class="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded text-sm mb-4">
                                            {templateError}
                                        </div>
                                    {:else if stackTemplate !== null}
                                        <pre class="w-full bg-gray-950 border border-gray-800 rounded p-3 text-sm font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">{stackTemplate}</pre>
                                    {:else if !templateLoading}
                                        <div class="text-sm text-gray-500 italic p-2 text-center">No template available.</div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    {:else if activeTab === "exports"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={exportsList}
                loading={exportsLoading}
                columns={exportColumns}
                hasNext={!!exportCurrentToken}
                hasPrev={exportTokenMap.length > 0}
                onNext={() => {
                    if (exportCurrentToken) {
                        pushToken(exportTokenMap, exportCurrentToken);
                        loadExports(exportCurrentToken);
                    }
                }}
                onPrev={() => {
                    const prevToken = popToken(exportTokenMap);
                    loadExports(prevToken);
                }}
                onRefresh={() => {
                    exportTokenMap = [];
                    exportsLoaded = false;
                    loadExports();
                }}
            >
                {#snippet children(exp: any)}
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400">{exp.Name}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{exp.Value}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]">{exp.ExportingStackId}</td>
                {/snippet}
            </PaginatedTable>
        </div>
    {:else if activeTab === "stack-sets"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={stackSets}
                loading={stackSetsLoading}
                columns={stackSetColumns}
                hasNext={!!stackSetCurrentToken}
                hasPrev={stackSetTokenMap.length > 0}
                onNext={() => {
                    if (stackSetCurrentToken) {
                        pushToken(stackSetTokenMap, stackSetCurrentToken);
                        loadStackSets(stackSetCurrentToken);
                    }
                }}
                onPrev={() => {
                    const prevToken = popToken(stackSetTokenMap);
                    loadStackSets(prevToken);
                }}
                onRefresh={() => {
                    stackSetTokenMap = [];
                    stackSetsLoaded = false;
                    loadStackSets();
                }}
            >
                {#snippet children(ss: any)}
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400">{ss.StackSetName}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{ss.StackSetId}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span class="px-2 py-0.5 rounded text-xs {ss.Status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">
                            {ss.Status}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]">{ss.Description || "-"}</td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
</ServiceLayout>
