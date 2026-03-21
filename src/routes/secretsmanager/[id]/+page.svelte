<script lang="ts">
    import {
        GetSecretValueCommand,
        DescribeSecretCommand,
        UpdateSecretCommand
    } from "@aws-sdk/client-secrets-manager";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import JsonEditor from "$lib/components/JsonEditor.svelte";

    let secretId = $derived($page.params.id || "");

    $effect(() => {
        const name = secretId.split(":").pop() || secretId;
        titleService.setResource(name, undefined, $page.url.pathname);
    });

    let loading = $state(false);
    let error = $state("");
    let secretDetails = $state<any>(null);
    let secretValue = $state<string | null>(null);
    let originalSecretValue = $state<string | null>(null);
    let valueLoading = $state(false);
    let saveLoading = $state(false);
    let actionMsg = $state("");

    let activeTab = $state<"json" | "key-value">("json");

    let parsedValue = $derived.by(() => {
        if (!secretValue) return null;
        try {
            return JSON.parse(secretValue);
        } catch {
            return null;
        }
    });

    let isSimpleKeyValue = $derived.by(() => {
        if (
            !parsedValue ||
            typeof parsedValue !== "object" ||
            Array.isArray(parsedValue)
        )
            return false;
        return Object.values(parsedValue).every(
            (v) =>
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean" ||
                v === null,
        );
    });

    let hasUnsavedChanges = $derived(secretValue !== null && originalSecretValue !== null && secretValue !== originalSecretValue);

    $effect(() => {
        if (aws.secretsManager && secretId) {
            loadDetails();
            loadValue();
        }
    });

    async function loadDetails() {
        if (!aws.secretsManager || !secretId) return;
        try {
            const res = await aws.secretsManager.send(
                new DescribeSecretCommand({ SecretId: secretId }),
            );
            secretDetails = res;
        } catch (e: any) {
            error = e.message || String(e);
        }
    }

    async function loadValue() {
        if (!aws.secretsManager || !secretId) return;
        try {
            valueLoading = true;
            const res = await aws.secretsManager.send(
                new GetSecretValueCommand({ SecretId: secretId }),
            );
            if (res.SecretString) {
                let formatted = res.SecretString;
                try {
                    formatted = JSON.stringify(JSON.parse(res.SecretString), null, 2);
                } catch(e) {}
                secretValue = formatted;
                originalSecretValue = formatted;
            } else if (res.SecretBinary) {
                const dec = new TextDecoder().decode(res.SecretBinary);
                let formatted = dec;
                try {
                    formatted = JSON.stringify(JSON.parse(dec), null, 2);
                } catch(e) {}
                secretValue = formatted;
                originalSecretValue = formatted;
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            valueLoading = false;
        }
    }

    async function handleSaveSecret() {
        if (!aws.secretsManager || !secretId || !secretValue) return;
        try {
            saveLoading = true;
            error = "";
            actionMsg = "";
            
            let toSave = secretValue;
            try {
                toSave = JSON.stringify(JSON.parse(secretValue));
            } catch (e) {}
            
            await aws.secretsManager.send(
                new UpdateSecretCommand({ SecretId: secretId, SecretString: toSave })
            );
            originalSecretValue = secretValue;
            actionMsg = "Secret updated successfully.";
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            saveLoading = false;
        }
    }
</script>

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

    <div class="flex-1 overflow-auto p-2 space-y-2 flex flex-col min-h-0">
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-5 shrink-0">
            <h3
                class="text-[10px] font-bold text-gray-500 uppercase mb-4 tracking-widest border-b border-gray-800 pb-1"
            >
                Metadata
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                    <h4
                        class="text-[10px] font-bold text-gray-600 uppercase mb-1"
                    >
                        ARN
                    </h4>
                    <span class="text-xs text-gray-300 font-mono break-all"
                        >{secretDetails?.ARN || secretId}</span
                    >
                </div>
                <div>
                    <h4
                        class="text-[10px] font-bold text-gray-600 uppercase mb-1"
                    >
                        Description
                    </h4>
                    <span class="text-xs text-gray-300 break-words"
                        >{secretDetails?.Description || "-"}</span
                    >
                </div>
                <div>
                    <h4
                        class="text-[10px] font-bold text-gray-600 uppercase mb-1"
                    >
                        Created Date
                    </h4>
                    <span class="text-xs text-gray-300"
                        >{secretDetails?.CreatedDate
                            ? new Date(
                                  secretDetails.CreatedDate,
                              ).toLocaleString()
                            : "-"}</span
                    >
                </div>
                <div>
                    <h4
                        class="text-[10px] font-bold text-gray-600 uppercase mb-1"
                    >
                        Last Accessed Date (UTC)
                    </h4>
                    <span class="text-xs text-gray-300"
                        >{secretDetails?.LastAccessedDate
                            ? new Date(
                                  secretDetails.LastAccessedDate,
                              ).toLocaleDateString(undefined, { timeZone: "UTC" })
                            : "-"}</span
                    >
                </div>
            </div>
        </div>

        <div
            class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm flex flex-col flex-1 min-h-[300px]"
        >
            <div
                class="bg-gray-800/50 px-4 py-0 border-b border-gray-700 flex justify-between items-center"
            >
                <div class="flex gap-4">
                    <button
                        class="text-[10px] font-bold uppercase tracking-widest py-3 border-b-2 {activeTab ===
                        'json'
                            ? 'border-blue-500 text-gray-200'
                            : 'border-transparent text-gray-500 hover:text-gray-300'}"
                        onclick={() => (activeTab = "json")}
                    >
                        JSON
                    </button>
                    <button
                        class="text-[10px] font-bold uppercase tracking-widest py-3 border-b-2 {activeTab ===
                        'key-value'
                            ? 'border-blue-500 text-gray-200'
                            : 'border-transparent text-gray-500 hover:text-gray-300'}"
                        onclick={() => (activeTab = "key-value")}
                    >
                        Key-value
                    </button>
                </div>
                {#if valueLoading}<span
                        class="text-[10px] text-blue-400 animate-pulse font-bold uppercase"
                        >Loading...</span
                    >{/if}
            </div>
            <div class="bg-black overflow-hidden flex-1 p-0 flex flex-col relative">
                {#if secretValue !== null}
                    {#if activeTab === "json"}
                        <div class="flex-1 w-full min-h-0 relative">
                            <JsonEditor bind:value={secretValue} />
                            {#if hasUnsavedChanges}
                                <div class="absolute bottom-4 right-4 z-10 flex gap-2">
                                    <button 
                                        onclick={() => { secretValue = originalSecretValue; error = ""; actionMsg = ""; }}
                                        class="bg-gray-700 hover:bg-gray-600 shadow border border-gray-600 text-white px-4 py-2 rounded text-xs transition"
                                    >
                                        Discard
                                    </button>
                                    <button 
                                        onclick={handleSaveSecret}
                                        disabled={saveLoading}
                                        class="bg-blue-600 hover:bg-blue-500 shadow border border-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
                                    >
                                        {#if saveLoading}<span class="animate-spin">⟳</span>{/if} Save Changes
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {:else if isSimpleKeyValue}
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr
                                    class="border-b border-gray-800 text-gray-500 text-[10px] uppercase tracking-widest bg-gray-900/50"
                                >
                                    <th class="p-3 font-bold w-1/3">Key</th>
                                    <th class="p-3 font-bold">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each Object.entries(parsedValue) as [key, val]}
                                    <tr
                                        class="border-b border-gray-800/50 hover:bg-gray-800/20"
                                    >
                                        <td
                                            class="p-3 text-xs font-mono text-gray-400 break-all align-top"
                                            >{key}</td
                                        >
                                        <td
                                            class="p-3 text-xs font-mono text-green-400 break-all align-top whitespace-pre-wrap"
                                            >{val}</td
                                        >
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    {:else}
                        <pre
                            class="text-xs text-green-400 font-mono whitespace-pre-wrap break-all p-4 m-0">{secretValue}</pre>
                    {/if}
                {:else if !valueLoading}
                    <div class="text-xs text-gray-600 italic p-4">
                        No secret value available.
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
