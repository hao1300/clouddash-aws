<script lang="ts">
    import { onMount } from "svelte";
    import {
        SecretsManagerClient,
        ListSecretsCommand,
        GetSecretValueCommand,
        CreateSecretCommand,
        DeleteSecretCommand,
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
    const tabs = [
        { id: "secrets", label: "Secrets" },
        { id: "create", label: "Create Secret" },
    ];
    let activeTab = $state("secrets");

    // --- Detail & Create State ---
    let selectedSecret = $state<SecretListEntry | null>(null);
    let secretValue = $state<string | null>(null);

    let newSecretName = $state("");
    let newSecretDescription = $state("");
    let newSecretValue = $state("");

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

    async function loadSecretValue(secretId: string) {
        if (!client) return;
        loading = true;
        error = "";
        secretValue = null;
        try {
            const res = await client.send(
                new GetSecretValueCommand({ SecretId: secretId }),
            );
            secretValue = res.SecretString || "";
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreateSecret() {
        if (!client) return;
        if (!newSecretName || !newSecretValue) {
            error = "Name and Value are required.";
            return;
        }
        loading = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(
                new CreateSecretCommand({
                    Name: newSecretName,
                    Description: newSecretDescription,
                    SecretString: newSecretValue,
                }),
            );
            actionMsg = `Secret ${newSecretName} created.`;
            newSecretName = "";
            newSecretDescription = "";
            newSecretValue = "";
            activeTab = "secrets";
            await loadSecrets();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleDeleteSecret(secretId: string) {
        if (!client) return;
        if (!confirm(`Are you sure you want to delete secret ${secretId}?`)) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(
                new DeleteSecretCommand({ SecretId: secretId, RecoveryWindowInDays: 7 }),
            );
            actionMsg = `Secret ${secretId} deleted.`;
            if (selectedSecret?.Name === secretId) {
                selectedSecret = null;
            }
            await loadSecrets();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (activeTab === "secrets") {
            selectedSecret = null;
        }
    });

</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    {#if activeTab === "secrets"}
        {#if selectedSecret}
            <!-- Detail View -->
            <div class="h-full overflow-auto p-4 space-y-4 {error || actionMsg ? 'pt-10' : ''}">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-bold text-gray-200">
                        {selectedSecret.Name}
                    </h2>
                    <button
                        onclick={() => { selectedSecret = null; secretValue = null; }}
                        class="text-gray-400 hover:text-white transition-colors"
                        >✕ Close</button
                    >
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
                    <p class="text-sm text-gray-300">
                        <strong class="text-gray-400">ARN:</strong> {selectedSecret.ARN}
                    </p>
                    <p class="text-sm text-gray-300">
                        <strong class="text-gray-400">Description:</strong> {selectedSecret.Description || "None"}
                    </p>
                    <p class="text-sm text-gray-300">
                        <strong class="text-gray-400">Last Changed:</strong> {selectedSecret.LastChangedDate ? new Date(selectedSecret.LastChangedDate).toLocaleString() : "Never"}
                    </p>
                </div>

                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-gray-200">Secret Value</h3>
                        <button
                            onclick={() => { if(selectedSecret?.Name) loadSecretValue(selectedSecret.Name); }}
                            class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors"
                        >
                            Retrieve Secret Value
                        </button>
                    </div>
                    {#if loading}
                        <p class="text-sm text-gray-500 italic">Loading...</p>
                    {:else if secretValue !== null}
                        <div class="relative bg-black rounded border border-gray-700 p-3 mt-2 overflow-x-auto">
                            <pre class="text-sm text-gray-300">{secretValue}</pre>
                        </div>
                    {/if}
                </div>
            </div>
        {:else}
            <!-- List View -->
            <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
                <PaginatedTable
                    items={secrets}
                    {loading}
                    columns={[
                        {
                            label: "Name",
                            key: "Name",
                            sortable: true,
                            onClick: (item) => {
                                selectedSecret = item;
                                secretValue = null;
                            }
                        },
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
                    {#snippet actionsSnippet(secret: any)}
                        <button
                            onclick={() => handleDeleteSecret(secret.Name)}
                            class="text-red-400 hover:text-red-300 hover:underline text-xs"
                        >
                            Delete
                        </button>
                    {/snippet}
                </PaginatedTable>
            </div>
        {/if}
    {:else if activeTab === "create"}
        <div class="h-full overflow-auto p-4 {error || actionMsg ? 'pt-10' : ''}">
            <div class="max-w-2xl mx-auto space-y-6">
                <h2 class="text-2xl font-bold text-gray-200">Create New Secret</h2>

                <div class="space-y-4 bg-gray-900 p-6 rounded-lg border border-gray-800">
                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-1" for="new-secret-name">Secret Name</label>
                        <input
                            id="new-secret-name"
                            type="text"
                            bind:value={newSecretName}
                            placeholder="e.g., prod/db/mysql"
                            class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none text-gray-200"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-1" for="new-secret-desc">Description (Optional)</label>
                        <input
                            id="new-secret-desc"
                            type="text"
                            bind:value={newSecretDescription}
                            placeholder="Brief description"
                            class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none text-gray-200"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-1" for="new-secret-value">Secret Value (Plaintext)</label>
                        <textarea
                            id="new-secret-value"
                            bind:value={newSecretValue}
                            placeholder="Enter the secret string..."
                            rows="6"
                            class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none text-gray-200 font-mono"
                        ></textarea>
                    </div>
                    <div class="pt-4 flex justify-end gap-3">
                        <button
                            onclick={() => { activeTab = "secrets"; }}
                            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onclick={handleCreateSecret}
                            disabled={loading || !newSecretName || !newSecretValue}
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Create Secret
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</ServiceLayout>
