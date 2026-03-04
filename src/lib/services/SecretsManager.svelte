<script lang="ts">
    import { onMount } from "svelte";
    import {
        SecretsManagerClient,
        ListSecretsCommand,
        GetSecretValueCommand,
        type SecretListEntry,
    } from "@aws-sdk/client-secrets-manager";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: SecretsManagerClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [{ id: "secrets", label: "Secrets" }];
    let activeTab = $state("secrets");

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

    // --- Secrets ---
    let secrets = $state<SecretListEntry[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    // --- Detail View ---
    let selectedSecret = $state<SecretListEntry | null>(null);
    let secretValue = $state<string | null>(null);
    let secretValueLoading = $state(false);
    let secretValueError = $state("");

    async function loadSecretValue(secretId: string) {
        if (!client) return;
        secretValueLoading = true;
        secretValueError = "";
        secretValue = null;
        try {
            const res = await client.send(
                new GetSecretValueCommand({ SecretId: secretId }),
            );
            if (res.SecretString != null) {
                secretValue = res.SecretString;
            } else if (res.SecretBinary != null) {
                // Just base64 encode or convert to string if binary
                // Using TextDecoder as binary may be Uint8Array
                const decoder = new TextDecoder();
                secretValue = decoder.decode(res.SecretBinary);
            }
        } catch (e: any) {
            secretValueError = e.message || String(e);
        }
        secretValueLoading = false;
    }

    function openSecret(secret: SecretListEntry) {
        selectedSecret = secret;
        if (secret.ARN) {
            loadSecretValue(secret.ARN);
        } else if (secret.Name) {
            loadSecretValue(secret.Name);
        }
    }

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new SecretsManagerClient({
                region: creds.region,
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    sessionToken: creds.session_token || undefined,
                },
            });
            await loadSecrets();
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    async function loadSecrets(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListSecretsCommand({ MaxResults: 50, NextToken: token }),
            );
            secrets = res.SecretList || [];
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
            loadSecrets(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadSecrets(prevToken);
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    {#if activeTab === "secrets"}
        {#if !selectedSecret}
            <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
                <PaginatedTable
                    items={secrets}
                    {loading}
                    columns={[
                        { label: "Name", key: "Name", sortable: true },
                        {
                            label: "Description",
                            key: "Description",
                            sortable: true,
                        },
                        {
                            label: "Last Accessed",
                            key: "LastAccessedDate",
                            sortable: true,
                        },
                    ]}
                    hasNext={!!currentToken}
                    hasPrev={tokenMap.length > 0}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onRefresh={() => {
                        tokenMap = [];
                        loadSecrets();
                    }}
                >
                    {#snippet children(secret: any)}
                        <td class="px-4 py-3 whitespace-nowrap">
                            <button
                                class="text-blue-400 hover:text-blue-300 font-medium hover:underline text-left text-sm"
                                onclick={() => openSecret(secret)}
                            >
                                {secret.Name}
                            </button>
                        </td>
                        <td
                            class="px-4 py-3 whitespace-nowrap text-sm text-gray-300 truncate max-w-[200px]"
                        >
                            {secret.Description || "-"}
                        </td>
                        <td
                            class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                        >
                            {secret.LastAccessedDate
                                ? new Date(secret.LastAccessedDate).toLocaleString()
                                : ""}
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
                                selectedSecret = null;
                            }}
                        >
                            ← Back
                        </button>
                        <h2 class="text-lg font-bold text-gray-100 flex items-center gap-2">
                            <span class="text-green-400">🔒</span>
                            {selectedSecret.Name}
                        </h2>
                    </div>
                </div>

                <!-- Inner Content -->
                <div class="flex-1 overflow-auto p-4 sm:p-6 relative min-h-0 bg-gray-950">
                    <div class="max-w-4xl space-y-6">
                        <!-- Secret Details -->
                        <div class="bg-gray-900 border border-gray-800 p-4 sm:p-5 rounded-lg shadow-sm">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div>
                                    <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">ARN</h4>
                                    <span class="text-sm text-gray-300 font-mono break-all">{selectedSecret.ARN}</span>
                                </div>
                                <div>
                                    <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Description</h4>
                                    <span class="text-sm text-gray-300 break-words">{selectedSecret.Description || "-"}</span>
                                </div>
                                <div>
                                    <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Created Date</h4>
                                    <span class="text-sm text-gray-300">{selectedSecret.CreatedDate ? new Date(selectedSecret.CreatedDate).toLocaleString() : "-"}</span>
                                </div>
                                <div>
                                    <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">Last Accessed Date</h4>
                                    <span class="text-sm text-gray-300">{selectedSecret.LastAccessedDate ? new Date(selectedSecret.LastAccessedDate).toLocaleString() : "-"}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Secret Value -->
                        <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden mt-6">
                            <div class="px-4 py-3 border-b border-gray-800 bg-gray-900/80 flex items-center justify-between">
                                <h4 class="text-sm font-bold text-gray-300">Secret Value</h4>
                                {#if secretValueLoading}
                                    <span class="text-xs text-blue-400 animate-pulse">Loading...</span>
                                {/if}
                            </div>

                            <div class="p-4 bg-gray-950">
                                {#if secretValueError}
                                    <div class="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded text-sm mb-4">
                                        {secretValueError}
                                    </div>
                                {:else if secretValue !== null}
                                    <div class="relative group">
                                        <pre class="w-full min-h-24 bg-gray-950 border border-gray-800 rounded p-3 text-sm font-mono text-green-400 overflow-x-auto whitespace-pre-wrap">{secretValue}</pre>
                                    </div>
                                {:else if !secretValueLoading}
                                    <div class="text-sm text-gray-500 italic p-2 text-center">No secret value available.</div>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</ServiceLayout>
