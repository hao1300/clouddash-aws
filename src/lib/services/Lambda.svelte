<script lang="ts">
    import { onMount } from "svelte";
    import {
        LambdaClient,
        ListFunctionsCommand,
        type FunctionConfiguration,
    } from "@aws-sdk/client-lambda";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: LambdaClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [{ id: "functions", label: "Functions" }];
    let activeTab = $state("functions");

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

    // --- Functions ---
    let functions = $state<FunctionConfiguration[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new LambdaClient({
                region: creds.region,
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    sessionToken: creds.session_token || undefined,
                },
            });
            await loadFunctions();
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    async function loadFunctions(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListFunctionsCommand({ MaxItems: 50, Marker: token }),
            );
            functions = res.Functions || [];
            currentToken = res.NextMarker;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleNext() {
        if (currentToken) {
            pushToken(tokenMap, currentToken);
            loadFunctions(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadFunctions(prevToken);
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
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
    {#if activeTab === "functions"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={functions}
                {loading}
                columns={[
                    {
                        label: "Function Name",
                        key: "FunctionName",
                        sortable: true,
                    },
                    { label: "Runtime", key: "Runtime", sortable: true },
                    {
                        label: "Last Modified",
                        key: "LastModified",
                        sortable: true,
                    },
                    {
                        label: "Memory (MB)",
                        key: "MemorySize",
                        sortable: true,
                    },
                ]}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={handleNext}
                onPrev={handlePrev}
                onRefresh={() => {
                    tokenMap = [];
                    loadFunctions();
                }}
            >
                {#snippet children(fn: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {fn.FunctionName}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        {fn.Runtime}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {fn.LastModified
                            ? new Date(fn.LastModified).toLocaleString()
                            : ""}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {fn.MemorySize}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
</ServiceLayout>
