<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudFormationClient,
        DescribeStacksCommand,
        ListExportsCommand,
        ListStackSetsCommand,
        type Export,
        type StackSetSummary,
        type Stack,
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
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {stack.StackName}
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
