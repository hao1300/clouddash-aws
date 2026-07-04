<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading } from "@mdi/js";

    import {
        GetParameterCommand,
        DescribeParametersCommand,
        PutParameterCommand,
    } from "@aws-sdk/client-ssm";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import JsonEditor from "$lib/components/JsonEditor.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";

    let paramName = $derived($page.params.name || "");

    $effect(() => {
        const name = paramName.split("/").pop() || paramName;
        titleService.setResource(name, undefined, $page.url.pathname);
    });

    let error = $state("");
    let actionMsg = $state("");
    let metadata = $state<any>(null);
    let details = $state<any>(null);
    let paramValue = $state<string | null>(null);
    let originalValue = $state<string | null>(null);
    let paramType = $state<string>("String");
    let valueLoading = $state(false);
    let saveLoading = $state(false);

    let isJson = $derived.by(() => {
        if (!paramValue) return false;
        try {
            const parsed = JSON.parse(paramValue);
            return typeof parsed === "object" && parsed !== null;
        } catch {
            return false;
        }
    });

    let hasUnsavedChanges = $derived(
        paramValue !== null &&
            originalValue !== null &&
            paramValue !== originalValue,
    );

    $effect(() => {
        if (aws.ssm && paramName) {
            loadDetails();
            loadValue();
        }
    });

    async function loadDetails() {
        if (!aws.ssm || !paramName) return;
        try {
            const res = await aws.ssm.send(
                new DescribeParametersCommand({
                    ParameterFilters: [
                        { Key: "Name", Option: "Equals", Values: [paramName] },
                    ],
                }),
            );
            metadata = res.Parameters?.[0] || null;
        } catch (e: any) {
            error = e.message || String(e);
        }
    }

    async function loadValue() {
        if (!aws.ssm || !paramName) return;
        try {
            valueLoading = true;
            const res = await aws.ssm.send(
                new GetParameterCommand({
                    Name: paramName,
                    WithDecryption: true,
                }),
            );
            details = res.Parameter || null;
            paramType = res.Parameter?.Type || "String";
            let val = res.Parameter?.Value ?? "";
            try {
                val = JSON.stringify(JSON.parse(val), null, 2);
            } catch (e) {}
            paramValue = val;
            originalValue = val;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            valueLoading = false;
        }
    }

    async function handleSaveParameter() {
        if (!aws.ssm || !paramName || paramValue === null) return;
        try {
            saveLoading = true;
            error = "";
            actionMsg = "";

            let toSave = paramValue;
            try {
                toSave = JSON.stringify(JSON.parse(paramValue));
            } catch (e) {}

            await aws.ssm.send(
                new PutParameterCommand({
                    Name: paramName,
                    Value: toSave,
                    Type: paramType as any,
                    Overwrite: true,
                }),
            );
            originalValue = paramValue;
            actionMsg = "Parameter updated successfully.";
            loadDetails();
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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
            <InfoCard label="Name" value={paramName} />
            <InfoCard label="Type" value={paramType} />
            <InfoCard label="ARN" value={details?.ARN || "-"} />
            <InfoCard
                label="Version"
                value={details?.Version != null ? String(details.Version) : "-"}
            />
            <InfoCard label="Tier" value={metadata?.Tier || "-"} />
            <InfoCard
                label="Last Modified"
                value={details?.LastModifiedDate
                    ? new Date(details.LastModifiedDate).toLocaleString()
                    : "-"}
            />
            <InfoCard
                label="Description"
                value={metadata?.Description || "-"}
                className="md:col-span-2"
            />
        </div>

        <div
            class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm flex flex-col flex-1 min-h-[300px]"
        >
            <div
                class="bg-gray-800/50 px-4 py-3 border-b border-gray-700 flex justify-between items-center"
            >
                <span
                    class="text-[10px] font-bold uppercase tracking-widest text-gray-200"
                    >Value</span
                >
                {#if valueLoading}<span
                        class="text-[10px] text-blue-400 animate-pulse font-bold uppercase"
                        >Loading...</span
                    >{/if}
            </div>
            <div class="bg-black overflow-hidden flex-1 p-0 flex flex-col relative">
                {#if paramValue !== null}
                    <div class="flex-1 w-full min-h-0 relative">
                        <JsonEditor
                            bind:value={paramValue}
                            language={isJson ? "json" : "text"}
                        />
                        {#if hasUnsavedChanges}
                            <div class="absolute bottom-4 right-4 z-10 flex gap-2">
                                <button
                                    onclick={() => {
                                        paramValue = originalValue;
                                        error = "";
                                        actionMsg = "";
                                    }}
                                    class="bg-gray-700 hover:bg-gray-600 shadow border border-gray-600 text-white px-4 py-2 rounded text-xs transition"
                                >
                                    Discard
                                </button>
                                <button
                                    onclick={handleSaveParameter}
                                    disabled={saveLoading}
                                    class="bg-blue-600 hover:bg-blue-500 shadow border border-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
                                >
                                    {#if saveLoading}<Icon
                                            path={mdiLoading}
                                            size={14}
                                            class="animate-spin"
                                        />{/if} Save Changes
                                </button>
                            </div>
                        {/if}
                    </div>
                {:else if !valueLoading}
                    <div class="text-xs text-gray-600 italic p-4">
                        No parameter value available.
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>