<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading } from "@mdi/js";

    import {
        GetParameterCommand,
        DescribeParametersCommand,
        PutParameterCommand,
        DeleteParameterCommand,
    } from "@aws-sdk/client-ssm";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import JsonEditor from "$lib/components/JsonEditor.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";
    import DeleteConfirmModal from "$lib/components/iam/DeleteConfirmModal.svelte";

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
    let detailsExpanded = $state(false);
    let showDeleteModal = $state(false);
    let deleting = $state(false);

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

    async function handleDeleteParameter() {
        if (!aws.ssm || !paramName) return;
        try {
            deleting = true;
            error = "";
            await aws.ssm.send(
                new DeleteParameterCommand({ Name: paramName }),
            );
            showDeleteModal = false;
            goto("/parameterstore");
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
                aria-controls="parameter-details"
            >
                <span
                    class="text-[10px] font-bold uppercase tracking-widest text-gray-300"
                    >Parameter details</span
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
                    id="parameter-details"
                    class="border-t border-gray-800 p-3 space-y-3"
                >
                    <div class="flex justify-end">
                        <button
                            onclick={() => (showDeleteModal = true)}
                            class="text-[10px] bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-3 py-1.5 rounded shadow-sm transition border border-red-800/50 font-bold uppercase tracking-widest"
                        >
                            Delete Parameter
                        </button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InfoCard label="Name" value={paramName} />
                        <InfoCard label="Type" value={paramType} />
                        <InfoCard label="ARN" value={details?.ARN || "-"} />
                        <InfoCard
                            label="Version"
                            value={details?.Version != null
                                ? String(details.Version)
                                : "-"}
                        />
                        <InfoCard label="Tier" value={metadata?.Tier || "-"} />
                        <InfoCard
                            label="Last Modified"
                            value={details?.LastModifiedDate
                                ? new Date(
                                      details.LastModifiedDate,
                                  ).toLocaleString()
                                : "-"}
                        />
                        <InfoCard
                            label="Description"
                            value={metadata?.Description || "-"}
                            className="md:col-span-2"
                        />
                    </div>
                </div>
            {/if}
        </section>

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

    <DeleteConfirmModal
        bind:show={showDeleteModal}
        title="Delete Parameter"
        resourceName={paramName}
        onConfirm={handleDeleteParameter}
        loading={deleting}
        {error}
    />
</div>
