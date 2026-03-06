<script lang="ts">
    import {
        GetSecretValueCommand,
        DescribeSecretCommand,
    } from "@aws-sdk/client-secrets-manager";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    let secretId = $derived($page.url.searchParams.get("id") || "");

    let loading = $state(false);
    let error = $state("");
    let secretDetails = $state<any>(null);
    let secretValue = $state<string | null>(null);
    let valueLoading = $state(false);

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
                secretValue = res.SecretString;
            } else if (res.SecretBinary) {
                secretValue = new TextDecoder().decode(res.SecretBinary);
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            valueLoading = false;
        }
    }

    function handleBack() {
        goto("/secretsmanager/secrets");
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div
        class="px-6 py-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center shrink-0 {error
            ? 'mt-8'
            : ''}"
    >
        <div class="flex items-center gap-3">
            <button
                onclick={handleBack}
                class="text-xs text-blue-400 hover:text-blue-300">← Back</button
            >
            <h2 class="text-sm font-bold text-gray-200">
                {secretId.split(":").pop() || "Secret Details"}
            </h2>
        </div>
    </div>

    <div class="flex-1 overflow-auto p-6 space-y-6">
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
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
                        Last Accessed Date
                    </h4>
                    <span class="text-xs text-gray-300"
                        >{secretDetails?.LastAccessedDate
                            ? new Date(
                                  secretDetails.LastAccessedDate,
                              ).toLocaleString()
                            : "-"}</span
                    >
                </div>
            </div>
        </div>

        <div
            class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm"
        >
            <div
                class="bg-gray-800/50 px-4 py-2 border-b border-gray-700 flex justify-between items-center"
            >
                <span
                    class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
                    >Secret Value</span
                >
                {#if valueLoading}<span
                        class="text-[10px] text-blue-400 animate-pulse font-bold uppercase"
                        >Loading...</span
                    >{/if}
            </div>
            <div class="p-4 bg-black overflow-x-auto min-h-[100px]">
                {#if secretValue}
                    <pre
                        class="text-xs text-green-400 font-mono whitespace-pre-wrap">{secretValue}</pre>
                {:else if !valueLoading}
                    <div class="text-xs text-gray-600 italic">
                        No secret value available.
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
