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
    let selectedStack = $state<Stack | null>(null);
    let selectedStackTab = $state("events");

    let stacksLoaded = $state(false);

    let stackEvents = $state<StackEvent[]>([]);
    let stackResources = $state<StackResource[]>([]);
    let stackTemplate = $state<string>("");
    let stackDetailsLoading = $state(false);

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

    $effect(() => {
        if (!client || !selectedStack) return;
        loadStackDetails(selectedStack.StackName!, selectedStackTab);
    });

    async function loadStackDetails(stackName: string, tab: string) {
        if (!client) return;
        stackDetailsLoading = true;
        error = "";
        try {
            if (tab === "events") {
                const res = await client.send(
                    new DescribeStackEventsCommand({ StackName: stackName })
                );
                stackEvents = res.StackEvents || [];
            } else if (tab === "resources") {
                const res = await client.send(
                    new DescribeStackResourcesCommand({ StackName: stackName })
                );
                stackResources = res.StackResources || [];
            } else if (tab === "template") {
                const res = await client.send(
                    new GetTemplateCommand({ StackName: stackName })
                );
                stackTemplate = res.TemplateBody || "";
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            stackDetailsLoading = false;
        }
    }

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
        {#if selectedStack}
            <div class="h-full flex flex-col {error || actionMsg ? 'pt-8' : ''}">
                <div class="flex items-center gap-4 p-4 border-b border-gray-800 bg-gray-900/50">
                    <button class="text-gray-400 hover:text-white" onclick={() => selectedStack = null}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                    <h2 class="text-lg font-bold text-gray-200">{selectedStack.StackName}</h2>
                    <span class="px-2 py-0.5 rounded text-xs {selectedStack.StackStatus?.includes('COMPLETE') ? 'bg-green-500/20 text-green-400' : selectedStack.StackStatus?.includes('FAILED') ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}">
                        {selectedStack.StackStatus}
                    </span>
                </div>

                <div class="flex border-b border-gray-800 bg-black">
                    {#each [
                        { id: 'events', label: 'Events' },
                        { id: 'resources', label: 'Resources' },
                        { id: 'outputs', label: 'Outputs' },
                        { id: 'parameters', label: 'Parameters' },
                        { id: 'template', label: 'Template' }
                    ] as tab}
                        <button
                            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {selectedStackTab === tab.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'}"
                            onclick={() => selectedStackTab = tab.id}
                        >
                            {tab.label}
                        </button>
                    {/each}
                </div>

                <div class="flex-1 overflow-auto bg-black p-4">
                    {#if stackDetailsLoading}
                        <div class="text-gray-400 text-sm animate-pulse">Loading...</div>
                    {:else if selectedStackTab === 'events'}
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-gray-900 border-b border-gray-700 text-xs text-gray-400">
                                    <th class="px-4 py-2 font-medium">Time</th>
                                    <th class="px-4 py-2 font-medium">Status</th>
                                    <th class="px-4 py-2 font-medium">Type</th>
                                    <th class="px-4 py-2 font-medium">Logical ID</th>
                                    <th class="px-4 py-2 font-medium">Status Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each stackEvents as event}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                                        <td class="px-4 py-2 text-sm text-gray-300 whitespace-nowrap">{event.Timestamp ? new Date(event.Timestamp).toLocaleString() : ''}</td>
                                        <td class="px-4 py-2 text-sm">
                                            <span class="px-2 py-0.5 rounded text-xs {event.ResourceStatus?.includes('COMPLETE') ? 'bg-green-500/20 text-green-400' : event.ResourceStatus?.includes('FAILED') ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}">
                                                {event.ResourceStatus}
                                            </span>
                                        </td>
                                        <td class="px-4 py-2 text-sm text-gray-400">{event.ResourceType}</td>
                                        <td class="px-4 py-2 text-sm text-gray-300">{event.LogicalResourceId}</td>
                                        <td class="px-4 py-2 text-sm text-gray-500">{event.ResourceStatusReason || '-'}</td>
                                    </tr>
                                {/each}
                                {#if stackEvents.length === 0}
                                    <tr><td colspan="5" class="px-4 py-4 text-center text-sm text-gray-500">No events found.</td></tr>
                                {/if}
                            </tbody>
                        </table>
                    {:else if selectedStackTab === 'resources'}
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-gray-900 border-b border-gray-700 text-xs text-gray-400">
                                    <th class="px-4 py-2 font-medium">Logical ID</th>
                                    <th class="px-4 py-2 font-medium">Physical ID</th>
                                    <th class="px-4 py-2 font-medium">Type</th>
                                    <th class="px-4 py-2 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each stackResources as resource}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                                        <td class="px-4 py-2 text-sm text-gray-300">{resource.LogicalResourceId}</td>
                                        <td class="px-4 py-2 text-sm text-gray-400">{resource.PhysicalResourceId}</td>
                                        <td class="px-4 py-2 text-sm text-gray-400">{resource.ResourceType}</td>
                                        <td class="px-4 py-2 text-sm">
                                            <span class="px-2 py-0.5 rounded text-xs {resource.ResourceStatus?.includes('COMPLETE') ? 'bg-green-500/20 text-green-400' : resource.ResourceStatus?.includes('FAILED') ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}">
                                                {resource.ResourceStatus}
                                            </span>
                                        </td>
                                    </tr>
                                {/each}
                                {#if stackResources.length === 0}
                                    <tr><td colspan="4" class="px-4 py-4 text-center text-sm text-gray-500">No resources found.</td></tr>
                                {/if}
                            </tbody>
                        </table>
                    {:else if selectedStackTab === 'outputs'}
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-gray-900 border-b border-gray-700 text-xs text-gray-400">
                                    <th class="px-4 py-2 font-medium">Key</th>
                                    <th class="px-4 py-2 font-medium">Value</th>
                                    <th class="px-4 py-2 font-medium">Description</th>
                                    <th class="px-4 py-2 font-medium">Export Name</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each selectedStack.Outputs || [] as output}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                                        <td class="px-4 py-2 text-sm text-gray-300">{output.OutputKey}</td>
                                        <td class="px-4 py-2 text-sm text-blue-400 break-all">{output.OutputValue}</td>
                                        <td class="px-4 py-2 text-sm text-gray-400">{output.Description || '-'}</td>
                                        <td class="px-4 py-2 text-sm text-gray-400">{output.ExportName || '-'}</td>
                                    </tr>
                                {/each}
                                {#if (selectedStack.Outputs || []).length === 0}
                                    <tr><td colspan="4" class="px-4 py-4 text-center text-sm text-gray-500">No outputs found.</td></tr>
                                {/if}
                            </tbody>
                        </table>
                    {:else if selectedStackTab === 'parameters'}
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-gray-900 border-b border-gray-700 text-xs text-gray-400">
                                    <th class="px-4 py-2 font-medium">Key</th>
                                    <th class="px-4 py-2 font-medium">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each selectedStack.Parameters || [] as param}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                                        <td class="px-4 py-2 text-sm text-gray-300">{param.ParameterKey}</td>
                                        <td class="px-4 py-2 text-sm text-gray-400">{param.ParameterValue}</td>
                                    </tr>
                                {/each}
                                {#if (selectedStack.Parameters || []).length === 0}
                                    <tr><td colspan="2" class="px-4 py-4 text-center text-sm text-gray-500">No parameters found.</td></tr>
                                {/if}
                            </tbody>
                        </table>
                    {:else if selectedStackTab === 'template'}
                        <div class="bg-gray-900 p-4 rounded text-sm text-gray-300 whitespace-pre font-mono overflow-auto border border-gray-800">
                            {stackTemplate}
                        </div>
                    {/if}
                </div>
            </div>
        {:else}
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
                    { label: "Drift Status", key: "DriftStatus", sortable: true },
                    {
                        label: "Creation Time",
                        key: "CreationTime",
                        sortable: true,
                    },
                    {
                        label: "Last Updated Time",
                        key: "LastUpdatedTime",
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
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium"
                    >
                        <button
                            class="text-blue-400 hover:underline focus:outline-none"
                            onclick={() => { selectedStack = stack; selectedStackTab = 'events'; }}
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
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        {#if stack.DriftInformation?.StackDriftStatus}
                            <span
                                class="px-2 py-0.5 rounded text-xs {stack.DriftInformation.StackDriftStatus === 'IN_SYNC'
                                    ? 'bg-green-500/20 text-green-400'
                                    : stack.DriftInformation.StackDriftStatus === 'DRIFTED'
                                      ? 'bg-red-500/20 text-red-400'
                                      : 'bg-gray-500/20 text-gray-400'}"
                            >
                                {stack.DriftInformation.StackDriftStatus}
                            </span>
                        {:else}
                            <span class="text-gray-500">-</span>
                        {/if}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {stack.CreationTime
                            ? new Date(stack.CreationTime).toLocaleString()
                            : ""}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {stack.LastUpdatedTime
                            ? new Date(stack.LastUpdatedTime).toLocaleString()
                            : "-"}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]"
                    >
                        {stack.Description || "-"}
                    </td>
                {/snippet}
            </PaginatedTable>
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
