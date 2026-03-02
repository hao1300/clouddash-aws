<script lang="ts">
    import { onMount } from "svelte";
    import {
        LambdaClient,
        ListFunctionsCommand,
        InvokeCommand,
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

    // --- Detail View ---
    let selectedFn = $state<FunctionConfiguration | null>(null);
    let invokeInput = $state("{}");
    let invokeResult = $state<{
        statusCode?: number;
        payload?: string;
        error?: string;
    } | null>(null);
    let invokeLoading = $state(false);

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

    function openFunction(fn: FunctionConfiguration) {
        selectedFn = fn;
        invokeInput = "{}";
        invokeResult = null;
    }

    async function invokeFunction() {
        if (!client || !selectedFn?.FunctionName) return;
        invokeLoading = true;
        invokeResult = null;
        try {
            const encoder = new TextEncoder();
            const res = await client.send(
                new InvokeCommand({
                    FunctionName: selectedFn.FunctionName,
                    Payload: encoder.encode(invokeInput),
                }),
            );

            let payloadStr = "";
            if (res.Payload) {
                const decoder = new TextDecoder();
                payloadStr = decoder.decode(res.Payload);
            }

            invokeResult = {
                statusCode: res.StatusCode,
                payload: payloadStr,
                error: res.FunctionError,
            };
        } catch (e: any) {
            invokeResult = {
                error: e.message || String(e),
            };
        } finally {
            invokeLoading = false;
        }
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
        {#if !selectedFn}
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
                        <td class="px-4 py-3 whitespace-nowrap">
                            <button
                                class="text-blue-400 hover:text-blue-300 font-medium hover:underline text-left text-sm"
                                onclick={() => openFunction(fn)}
                            >
                                {fn.FunctionName}
                            </button>
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
                                selectedFn = null;
                            }}
                        >
                            ← Back
                        </button>
                        <h2
                            class="text-lg font-bold text-gray-100 flex items-center gap-2"
                        >
                            <span class="text-orange-400">λ</span>
                            {selectedFn.FunctionName}
                        </h2>
                    </div>
                </div>

                <!-- Inner Content -->
                <div class="flex-1 overflow-auto p-4 sm:p-6">
                    <div class="max-w-3xl space-y-4">
                        <h3 class="text-lg font-bold text-gray-100 mb-4">
                            Invoke Function
                        </h3>

                        <div
                            class="space-y-4 bg-gray-900 border border-gray-800 p-4 sm:p-5 rounded-lg shadow-sm"
                        >
                            <div>
                                <label
                                    for="invokeInput"
                                    class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
                                >
                                    Event JSON
                                </label>
                                <textarea
                                    id="invokeInput"
                                    bind:value={invokeInput}
                                    class="w-full h-48 bg-gray-950 border border-gray-800 rounded p-3 text-sm font-mono text-gray-300 focus:border-blue-500 outline-none transition resize-y"
                                    disabled={invokeLoading}
                                ></textarea>
                            </div>

                            <div class="flex justify-end pt-2">
                                <button
                                    onclick={invokeFunction}
                                    disabled={invokeLoading}
                                    class="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-semibold transition shadow"
                                >
                                    {invokeLoading ? "Invoking..." : "Test / Invoke"}
                                </button>
                            </div>
                        </div>

                        {#if invokeResult}
                            <div class="mt-8 space-y-4">
                                <h3 class="text-lg font-bold text-gray-100">
                                    Execution Result
                                </h3>

                                {#if invokeResult.error && !invokeResult.payload}
                                    <div
                                        class="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded text-sm"
                                    >
                                        <div class="font-semibold mb-1">
                                            Invocation Error
                                        </div>
                                        {invokeResult.error}
                                    </div>
                                {:else}
                                    <div
                                        class="bg-gray-900 border border-gray-800 rounded overflow-hidden"
                                    >
                                        <div
                                            class="bg-gray-800 px-4 py-2 border-b border-gray-700 flex justify-between items-center text-sm"
                                        >
                                            <span class="text-gray-300 font-medium"
                                                >Response</span
                                            >
                                            <div class="flex gap-3 text-xs">
                                                {#if invokeResult.statusCode}
                                                    <span class="text-gray-400"
                                                        >Status:
                                                        <span
                                                            class={invokeResult.statusCode >=
                                                                200 &&
                                                            invokeResult.statusCode <
                                                                300
                                                                ? "text-green-400 font-bold"
                                                                : "text-red-400 font-bold"}
                                                            >{invokeResult.statusCode}</span
                                                        ></span
                                                    >
                                                {/if}
                                                {#if invokeResult.error}
                                                    <span
                                                        class="text-red-400 font-bold"
                                                    >
                                                        FunctionError: {invokeResult.error}
                                                    </span>
                                                {/if}
                                            </div>
                                        </div>
                                        <div class="p-4 bg-gray-950 overflow-x-auto">
                                            <pre
                                                class="text-sm text-green-400 font-mono whitespace-pre-wrap">{invokeResult.payload ||
                                                    ""}</pre>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</ServiceLayout>
