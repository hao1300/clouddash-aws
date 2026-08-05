<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading } from "@mdi/js";

    import {
        GetSecretValueCommand,
        DescribeSecretCommand,
        UpdateSecretCommand,
        DeleteSecretCommand
    } from "@aws-sdk/client-secrets-manager";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import JsonEditor from "$lib/components/JsonEditor.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";
    import DeleteConfirmModal from "$lib/components/iam/DeleteConfirmModal.svelte";
    import {
        detectValueFormat,
        parseSimpleKeyValue,
    } from "$lib/utils/value-format";

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
    let detailsExpanded = $state(false);

    let showDeleteModal = $state(false);
    let deleting = $state(false);

    let secretName = $derived(secretDetails?.Name || secretId.split(":").pop() || secretId);

    let activeTab = $state<"json" | "key-value">("json");

    let valueFormat = $derived(detectValueFormat(secretValue ?? ""));
    let keyValueEntries = $derived(
        secretValue ? parseSimpleKeyValue(secretValue) : null,
    );

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

    async function handleDeleteSecret() {
        if (!aws.secretsManager || !secretId) return;
        try {
            deleting = true;
            error = "";
            await aws.secretsManager.send(
                new DeleteSecretCommand({ SecretId: secretId }),
            );
            showDeleteModal = false;
            goto("/secretsmanager");
        } catch (e: any) {
            error = e.message || String(e);
            showDeleteModal = false;
        } finally {
            deleting = false;
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
        <section
            class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm shrink-0"
        >
            <button
                type="button"
                class="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-gray-800/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                onclick={() => (detailsExpanded = !detailsExpanded)}
                aria-expanded={detailsExpanded}
                aria-controls="secret-details"
            >
                <span
                    class="text-[10px] font-bold uppercase tracking-widest text-gray-300"
                    >Secret details</span
                >
                <svg
                    class="w-4 h-4 text-gray-500 transition-transform duration-200 {detailsExpanded
                        ? 'rotate-180'
                        : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>

            {#if detailsExpanded}
                <div
                    id="secret-details"
                    class="border-t border-gray-800 p-3 space-y-3"
                >
                    <div class="flex justify-end">
                        <button
                            onclick={() => (showDeleteModal = true)}
                            class="text-[10px] bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-3 py-1.5 rounded shadow-sm transition border border-red-800/50 font-bold uppercase tracking-widest"
                        >
                            Delete Secret
                        </button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InfoCard
                            label="ARN"
                            value={secretDetails?.ARN || secretId}
                        />
                        <InfoCard
                            label="Description"
                            value={secretDetails?.Description || "-"}
                        />
                        <InfoCard
                            label="Created Date"
                            value={secretDetails?.CreatedDate
                                ? new Date(
                                      secretDetails.CreatedDate,
                                  ).toLocaleString()
                                : "-"}
                        />
                        <InfoCard
                            label="Last Accessed Date (UTC)"
                            value={secretDetails?.LastAccessedDate
                                ? new Date(
                                      secretDetails.LastAccessedDate,
                                  ).toLocaleDateString(undefined, {
                                      timeZone: "UTC",
                                  })
                                : "-"}
                        />
                    </div>
                </div>
            {/if}
        </section>

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
                        {valueFormat === "properties"
                            ? "Properties"
                            : valueFormat === "json"
                              ? "JSON"
                              : "Text"}
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
                            <JsonEditor
                                bind:value={secretValue}
                                language={valueFormat}
                            />
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
                                        {#if saveLoading}<Icon path={mdiLoading} size={14} class="animate-spin" />{/if} Save Changes
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {:else if keyValueEntries}
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
                                {#each keyValueEntries as [key, val]}
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

    <DeleteConfirmModal
        bind:show={showDeleteModal}
        title="Delete Secret"
        resourceName={secretName}
        onConfirm={handleDeleteSecret}
        loading={deleting}
        {error}
    />
</div>
