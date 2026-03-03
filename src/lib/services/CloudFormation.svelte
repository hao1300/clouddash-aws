<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudFormationClient,
        DescribeStacksCommand,
        DescribeStackEventsCommand,
        DescribeStackResourcesCommand,
        DeleteStackCommand,
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
    const tabs = [{ id: "stacks", label: "Stacks" }];
    let activeTab = $state("stacks");

    // --- Detail State ---
    let selectedStack = $state<Stack | null>(null);
    let stackEvents = $state<StackEvent[]>([]);
    let stackResources = $state<StackResource[]>([]);
    let detailActiveSubTab = $state("events");

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
                region: creds.region,
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    sessionToken: creds.session_token || undefined,
                },
            });
            await loadStacks();
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
        }
    }

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

    async function loadStackDetails(stackName: string) {
        if (!client) return;
        loading = true;
        error = "";
        stackEvents = [];
        stackResources = [];
        detailActiveSubTab = "events";
        try {
            const [eventsRes, resourcesRes] = await Promise.all([
                client.send(new DescribeStackEventsCommand({ StackName: stackName })),
                client.send(new DescribeStackResourcesCommand({ StackName: stackName }))
            ]);
            stackEvents = eventsRes.StackEvents || [];
            stackResources = resourcesRes.StackResources || [];
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleDeleteStack(stackName: string) {
        if (!client) return;
        if (!confirm(`Are you sure you want to delete stack ${stackName}?`)) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(
                new DeleteStackCommand({ StackName: stackName }),
            );
            actionMsg = `Delete initiated for stack ${stackName}.`;
            if (selectedStack?.StackName === stackName) {
                selectedStack = null;
            }
            await loadStacks();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    {#if activeTab === "stacks"}
        {#if selectedStack}
            <!-- Detail View -->
            <div class="flex flex-col h-full {error || actionMsg ? 'pt-8' : ''}">
                <div class="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 shrink-0">
                    <div>
                        <h2 class="text-xl font-bold text-gray-200">
                            {selectedStack.StackName}
                        </h2>
                        <div class="mt-1 flex items-center gap-3">
                            <span
                                class="px-2 py-0.5 rounded text-xs {selectedStack.StackStatus?.includes('COMPLETE')
                                    ? 'bg-green-500/20 text-green-400'
                                    : selectedStack.StackStatus?.includes('FAILED')
                                      ? 'bg-red-500/20 text-red-400'
                                      : 'bg-yellow-500/20 text-yellow-400'}"
                            >
                                {selectedStack.StackStatus}
                            </span>
                            <span class="text-xs text-gray-500">{selectedStack.StackId}</span>
                        </div>
                    </div>
                    <button
                        onclick={() => { selectedStack = null; }}
                        class="text-gray-400 hover:text-white transition-colors"
                        >✕ Close</button
                    >
                </div>

                <div class="flex border-b border-gray-800 shrink-0 px-4 bg-gray-900/30">
                    <button
                        onclick={() => detailActiveSubTab = 'events'}
                        class="px-4 py-2 text-sm border-b-2 {detailActiveSubTab === 'events' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'} transition-colors"
                    >
                        Events
                    </button>
                    <button
                        onclick={() => detailActiveSubTab = 'resources'}
                        class="px-4 py-2 text-sm border-b-2 {detailActiveSubTab === 'resources' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'} transition-colors"
                    >
                        Resources
                    </button>
                    <button
                        onclick={() => detailActiveSubTab = 'outputs'}
                        class="px-4 py-2 text-sm border-b-2 {detailActiveSubTab === 'outputs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'} transition-colors"
                    >
                        Outputs
                    </button>
                </div>

                <div class="flex-1 overflow-hidden relative">
                    {#if detailActiveSubTab === 'events'}
                        <PaginatedTable
                            items={stackEvents}
                            {loading}
                            columns={[
                                { label: "Time", key: "Timestamp", sortable: true, format: (v) => v ? new Date(v).toLocaleString() : "-" },
                                { label: "Status", key: "ResourceStatus", sortable: true },
                                { label: "Type", key: "ResourceType", sortable: true },
                                { label: "Logical ID", key: "LogicalResourceId", sortable: true },
                                { label: "Status Reason", key: "ResourceStatusReason", sortable: true },
                            ]}
                        />
                    {:else if detailActiveSubTab === 'resources'}
                        <PaginatedTable
                            items={stackResources}
                            {loading}
                            columns={[
                                { label: "Logical ID", key: "LogicalResourceId", sortable: true },
                                { label: "Physical ID", key: "PhysicalResourceId", sortable: true },
                                { label: "Type", key: "ResourceType", sortable: true },
                                { label: "Status", key: "ResourceStatus", sortable: true },
                            ]}
                        />
                    {:else if detailActiveSubTab === 'outputs'}
                        <PaginatedTable
                            items={selectedStack.Outputs || []}
                            {loading}
                            columns={[
                                { label: "Key", key: "OutputKey", sortable: true },
                                { label: "Value", key: "OutputValue", sortable: true },
                                { label: "Description", key: "Description", sortable: true },
                            ]}
                        />
                    {/if}
                </div>
            </div>
        {:else}
            <!-- List View -->
            <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
                <PaginatedTable
                    items={stacks}
                    {loading}
                    columns={[
                        {
                            label: "Stack Name",
                            key: "StackName",
                            sortable: true,
                            onClick: (item) => {
                                selectedStack = item;
                                loadStackDetails(item.StackName!);
                            }
                        },
                        { label: "Status", key: "StackStatus", sortable: true },
                        {
                            label: "Creation Time",
                            key: "CreationTime",
                            sortable: true,
                            format: (v) => v ? new Date(v).toLocaleString() : "-"
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
                        loadStacks();
                    }}
                >
                    {#snippet children(stack: any)}
                        <td
                            class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                        >
                            <button
                                onclick={() => {
                                    selectedStack = stack;
                                    loadStackDetails(stack.StackName!);
                                }}
                                class="text-blue-400 hover:text-blue-300 hover:underline text-left font-medium transition-colors"
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
                    {#snippet actionsSnippet(stack: any)}
                        <button
                            onclick={() => handleDeleteStack(stack.StackName)}
                            class="text-red-400 hover:text-red-300 hover:underline text-xs"
                        >
                            Delete
                        </button>
                    {/snippet}
                </PaginatedTable>
            </div>
        {/if}
    {/if}
</ServiceLayout>
