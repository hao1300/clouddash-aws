<script lang="ts">
    import { onMount } from "svelte";
    import {
        LambdaClient,
        ListFunctionsCommand,
        InvokeCommand,
        GetFunctionConfigurationCommand,
        UpdateFunctionConfigurationCommand,
        DeleteFunctionCommand,
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
    let detailTab = $state<"invoke" | "configuration">("invoke");
    let isDeleting = $state(false);

    // Invoke state
    let invokeInput = $state("{}");
    let invokeResult = $state<{
        statusCode?: number;
        payload?: string;
        error?: string;
    } | null>(null);
    let invokeLoading = $state(false);

    // Config state
    let isEditingConfig = $state(false);
    let editMemory = $state(128);
    let editTimeout = $state(3);
    let editHandler = $state("");
    let configLoading = $state(false);
    let configError = $state("");

    // Environment Variables Edit State
    let isEditingEnv = $state(false);
    let editEnvVars = $state<{ key: string; value: string }[]>([]);
    let envLoading = $state(false);
    let envError = $state("");

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

    async function loadFunctionConfig(fnName: string) {
        if (!client) return;
        configLoading = true;
        configError = "";
        try {
            const res = await client.send(
                new GetFunctionConfigurationCommand({
                    FunctionName: fnName,
                })
            );
            selectedFn = res;
            editMemory = res.MemorySize || 128;
            editTimeout = res.Timeout || 3;
            editHandler = res.Handler || "";
        } catch (e: any) {
            configError = e.message || String(e);
        } finally {
            configLoading = false;
        }
    }

    async function deleteFunction() {
        if (!client || !selectedFn?.FunctionName) return;
        if (!confirm(`Are you sure you want to delete function ${selectedFn.FunctionName}?`)) return;
        isDeleting = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(
                new DeleteFunctionCommand({
                    FunctionName: selectedFn.FunctionName,
                })
            );
            actionMsg = `Deleted function: ${selectedFn.FunctionName}`;
            selectedFn = null;
            await loadFunctions();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            isDeleting = false;
        }
    }

    async function updateEnvVars() {
        if (!client || !selectedFn?.FunctionName) return;
        envLoading = true;
        envError = "";
        try {
            const variables: Record<string, string> = {};
            for (const { key, value } of editEnvVars) {
                if (key.trim()) {
                    variables[key.trim()] = value;
                }
            }

            const res = await client.send(
                new UpdateFunctionConfigurationCommand({
                    FunctionName: selectedFn.FunctionName,
                    Environment: { Variables: variables }
                })
            );
            selectedFn = res;
            isEditingEnv = false;
        } catch (e: any) {
            envError = e.message || String(e);
        } finally {
            envLoading = false;
        }
    }

    async function updateFunctionConfig() {
        if (!client || !selectedFn?.FunctionName) return;
        configLoading = true;
        configError = "";
        try {
            const res = await client.send(
                new UpdateFunctionConfigurationCommand({
                    FunctionName: selectedFn.FunctionName,
                    MemorySize: editMemory,
                    Timeout: editTimeout,
                    Handler: editHandler,
                })
            );
            selectedFn = res;
            isEditingConfig = false;
        } catch (e: any) {
            configError = e.message || String(e);
        } finally {
            configLoading = false;
        }
    }

    function openFunction(fn: FunctionConfiguration) {
        selectedFn = fn;
        detailTab = "invoke";
        isEditingConfig = false;
        invokeInput = "{}";
        invokeResult = null;
        if (fn.FunctionName) {
            loadFunctionConfig(fn.FunctionName);
        }
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
                    class="px-4 sm:px-6 py-4 bg-gray-900 border-b border-gray-800 shrink-0 flex justify-between items-center"
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
                    <button
                        onclick={deleteFunction}
                        disabled={isDeleting}
                        class="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50"
                    >
                        {#if isDeleting}<span class="animate-spin">⟳</span>{/if}
                        Delete Function
                    </button>
                </div>

                <!-- Inner Tabs -->
                <div
                    class="px-4 sm:px-6 border-b border-gray-800 bg-gray-900 shrink-0 overflow-x-auto scrollbar-hide"
                >
                    <nav class="flex gap-4 min-w-max">
                        <button
                            onclick={() => (detailTab = "invoke")}
                            class="py-3 text-sm font-semibold transition border-b-2 whitespace-nowrap {detailTab ===
                            'invoke'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'}"
                        >
                            Test / Invoke
                        </button>
                        <button
                            onclick={() => (detailTab = "configuration")}
                            class="py-3 text-sm font-semibold transition border-b-2 whitespace-nowrap {detailTab ===
                            'configuration'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'}"
                        >
                            Configuration
                        </button>
                    </nav>
                </div>

                <!-- Inner Content -->
                <div class="flex-1 overflow-auto p-4 sm:p-6 p-rel relative min-h-0">
                    {#if detailTab === "invoke"}
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
                    {:else if detailTab === "configuration"}
                        <div class="max-w-4xl space-y-6">
                            <div class="flex items-center justify-between">
                                <h3 class="text-lg font-bold text-gray-100">
                                    General Configuration
                                </h3>
                                {#if !isEditingConfig}
                                    <button
                                        onclick={() => (isEditingConfig = true)}
                                        class="bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-1.5 rounded text-sm font-semibold transition border border-gray-700 shadow-sm"
                                    >
                                        Edit
                                    </button>
                                {/if}
                            </div>

                            {#if configError}
                                <div class="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded text-sm mb-4">
                                    {configError}
                                </div>
                            {/if}

                            <div class="bg-gray-900 border border-gray-800 p-4 sm:p-5 rounded-lg shadow-sm">
                                {#if configLoading && !selectedFn.Runtime}
                                    <div class="text-sm text-gray-500 animate-pulse">Loading configuration...</div>
                                {:else}
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                        <!-- Readonly Fields -->
                                        <div>
                                            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">ARN</h4>
                                            <span class="text-sm text-gray-300 font-mono break-all">{selectedFn.FunctionArn}</span>
                                        </div>
                                        <div>
                                            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Role</h4>
                                            <span class="text-sm text-gray-300 font-mono break-all">{selectedFn.Role}</span>
                                        </div>
                                        <div>
                                            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Runtime</h4>
                                            <span class="text-sm text-gray-300">{selectedFn.Runtime}</span>
                                        </div>
                                        <div>
                                            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Code Size</h4>
                                            <span class="text-sm text-gray-300">{(selectedFn.CodeSize ? (selectedFn.CodeSize / (1024 * 1024)).toFixed(2) : 0)} MB</span>
                                        </div>
                                        <div>
                                            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Ephemeral Storage</h4>
                                            <span class="text-sm text-gray-300">{selectedFn.EphemeralStorage?.Size ? selectedFn.EphemeralStorage.Size + " MB" : "-"}</span>
                                        </div>
                                        <div>
                                            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">State</h4>
                                            <span class="text-sm {selectedFn.State === 'Active' ? 'text-green-400 font-medium' : 'text-gray-300'}">{selectedFn.State}</span>
                                        </div>

                                        <!-- Editable Fields -->
                                        <div class="md:col-span-2 border-t border-gray-800 pt-4 mt-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div>
                                                <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Memory (MB)</h4>
                                                {#if isEditingConfig}
                                                    <input type="number" bind:value={editMemory} class="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none" disabled={configLoading} />
                                                {:else}
                                                    <span class="text-sm text-gray-300">{selectedFn.MemorySize} MB</span>
                                                {/if}
                                            </div>
                                            <div>
                                                <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Timeout (s)</h4>
                                                {#if isEditingConfig}
                                                    <input type="number" bind:value={editTimeout} class="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none" disabled={configLoading} />
                                                {:else}
                                                    <span class="text-sm text-gray-300">{selectedFn.Timeout} s</span>
                                                {/if}
                                            </div>
                                            <div>
                                                <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Handler</h4>
                                                {#if isEditingConfig}
                                                    <input type="text" bind:value={editHandler} class="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none" disabled={configLoading} />
                                                {:else}
                                                    <span class="text-sm text-gray-300 font-mono">{selectedFn.Handler}</span>
                                                {/if}
                                            </div>
                                        </div>

                                        {#if isEditingConfig}
                                            <div class="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-gray-800">
                                                <button
                                                    onclick={() => {
                                                        isEditingConfig = false;
                                                        editMemory = selectedFn!.MemorySize || 128;
                                                        editTimeout = selectedFn!.Timeout || 3;
                                                        editHandler = selectedFn!.Handler || "";
                                                        configError = "";
                                                    }}
                                                    disabled={configLoading}
                                                    class="text-gray-400 hover:text-white px-4 py-2 text-sm transition"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onclick={updateFunctionConfig}
                                                    disabled={configLoading}
                                                    class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-semibold transition shadow flex items-center gap-2"
                                                >
                                                    {#if configLoading}<span class="animate-spin">⟳</span>{/if}
                                                    Save Changes
                                                </button>
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                            </div>

                            <!-- Environment Variables -->
                            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden mt-6">
                                <div class="px-4 py-3 border-b border-gray-800 bg-gray-900/80 flex items-center justify-between">
                                    <h4 class="text-sm font-bold text-gray-300">Environment Variables</h4>
                                    {#if !isEditingEnv}
                                        <button
                                            onclick={() => {
                                                editEnvVars = Object.entries(selectedFn?.Environment?.Variables || {}).map(([key, value]) => ({ key, value }));
                                                isEditingEnv = true;
                                            }}
                                            class="bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1 rounded text-xs font-semibold transition border border-gray-700 shadow-sm"
                                        >
                                            Edit
                                        </button>
                                    {/if}
                                </div>

                                {#if envError}
                                    <div class="m-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded text-sm">
                                        {envError}
                                    </div>
                                {/if}

                                <div class="p-4 bg-gray-950 overflow-x-auto">
                                    {#if isEditingEnv}
                                        <div class="space-y-3">
                                            {#each editEnvVars as envVar, index}
                                                <div class="flex gap-3 items-start">
                                                    <div class="flex-1">
                                                        <input type="text" bind:value={envVar.key} placeholder="Key" class="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white font-mono focus:border-blue-500 outline-none" disabled={envLoading} />
                                                    </div>
                                                    <div class="flex-[2]">
                                                        <input type="text" bind:value={envVar.value} placeholder="Value" class="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white font-mono focus:border-blue-500 outline-none" disabled={envLoading} />
                                                    </div>
                                                    <button
                                                        onclick={() => editEnvVars.splice(index, 1)}
                                                        disabled={envLoading}
                                                        class="mt-1 text-gray-500 hover:text-red-400 transition"
                                                        title="Remove Variable"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            {/each}

                                            <div class="pt-2">
                                                <button
                                                    onclick={() => editEnvVars.push({ key: "", value: "" })}
                                                    disabled={envLoading}
                                                    class="text-sm text-blue-400 hover:text-blue-300 font-medium"
                                                >
                                                    + Add environment variable
                                                </button>
                                            </div>

                                            <div class="flex justify-end gap-3 pt-4 border-t border-gray-800 mt-4">
                                                <button
                                                    onclick={() => {
                                                        isEditingEnv = false;
                                                        envError = "";
                                                    }}
                                                    disabled={envLoading}
                                                    class="text-gray-400 hover:text-white px-4 py-2 text-sm transition"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onclick={updateEnvVars}
                                                    disabled={envLoading}
                                                    class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-semibold transition shadow flex items-center gap-2"
                                                >
                                                    {#if envLoading}<span class="animate-spin">⟳</span>{/if}
                                                    Save Changes
                                                </button>
                                            </div>
                                        </div>
                                    {:else}
                                        {#if selectedFn.Environment?.Variables && Object.keys(selectedFn.Environment.Variables).length > 0}
                                            <table class="w-full text-left text-sm">
                                                <thead>
                                                    <tr>
                                                        <th class="px-3 py-2 text-gray-400 font-semibold border-b border-gray-800 w-1/3">Key</th>
                                                        <th class="px-3 py-2 text-gray-400 font-semibold border-b border-gray-800 w-2/3">Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {#each Object.entries(selectedFn.Environment.Variables) as [key, value]}
                                                        <tr class="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                                                            <td class="px-3 py-2 text-gray-300 font-mono font-medium">{key}</td>
                                                            <td class="px-3 py-2 text-green-400 font-mono break-all">{value}</td>
                                                        </tr>
                                                    {/each}
                                                </tbody>
                                            </table>
                                        {:else}
                                            <div class="text-sm text-gray-500 italic p-2 text-center">No environment variables configured.</div>
                                        {/if}
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</ServiceLayout>
