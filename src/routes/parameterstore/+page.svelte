<script lang="ts">
    import {
        DescribeParametersCommand,
        PutParameterCommand,
        type ParameterMetadata,
    } from "@aws-sdk/client-ssm";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import Select from "$lib/components/Select.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading } from "@mdi/js";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";

    let parameters = $state<ParameterMetadata[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    let showCreateModal = $state(false);
    let newName = $state("");
    let newType = $state("String");
    let newValue = $state("");
    let newDescription = $state("");
    let creating = $state(false);

    async function handleCreate() {
        if (!aws.ssm || !newName.trim() || !newValue) return;
        try {
            creating = true;
            error = "";

            let valueToSave = newValue;
            try {
                valueToSave = JSON.stringify(JSON.parse(newValue));
            } catch (e) {}

            await aws.ssm.send(
                new PutParameterCommand({
                    Name: newName.trim(),
                    Value: valueToSave,
                    Type: newType as any,
                    Description: newDescription.trim() || undefined,
                }),
            );

            const created = newName.trim();
            showCreateModal = false;
            newName = "";
            newType = "String";
            newValue = "";
            newDescription = "";
            goto(`/parameterstore/${encodeURIComponent(created)}`);
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    let __initLoaded = false;
    $effect(() => {
        titleService.setResource("", undefined, $page.url.pathname);
        if (aws.ssm && !__initLoaded) {
            __initLoaded = true;
            loadParameters();
        }
    });

    async function loadParameters(token?: string) {
        if (!aws.ssm) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ssm.send(
                new DescribeParametersCommand({ MaxResults: 50, NextToken: token }),
            );
            parameters = res.Parameters || [];
            if (token) history.push(token);
            marker = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleSelectParameter(parameter: ParameterMetadata) {
        goto(`/parameterstore/${encodeURIComponent(parameter.Name || "")}`);
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={parameters}
        {loading}
        onRefresh={() => {
            history = [];
            loadParameters();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadParameters(marker)}
        onPrev={() => {
            history.pop();
            loadParameters(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Name",
                key: "Name",
                onClick: (item) => handleSelectParameter(item),
            },
            { label: "Type", key: "Type" },
            { label: "Tier", key: "Tier" },
            {
                label: "Last Modified",
                key: "LastModifiedDate",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
            { label: "Description", key: "Description" },
        ]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showCreateModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Create Parameter</button
            >
        {/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Parameter" overflowVisible>
    <div class="space-y-4 text-gray-300">
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Name</label
            >
            <input
                type="text"
                bind:value={newName}
                placeholder="/my/app/parameter"
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white font-mono outline-none focus:border-blue-500 transition"
            />
        </div>
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Type</label
            >
            <Select
                bind:value={newType}
                options={[
                    { value: "String", label: "String" },
                    { value: "StringList", label: "StringList" },
                    { value: "SecureString", label: "SecureString" },
                ]}
            />
        </div>
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Value</label
            >
            <textarea
                bind:value={newValue}
                rows="5"
                placeholder={'plaintext, key=value, or {"key": "value"}'}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white font-mono outline-none focus:border-blue-500 transition"
            ></textarea>
        </div>
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Description (optional)</label
            >
            <input
                type="text"
                bind:value={newDescription}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white outline-none focus:border-blue-500 transition"
            />
        </div>
        <div class="flex justify-end gap-2 pt-2">
            <button
                onclick={() => (showCreateModal = false)}
                class="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded text-xs font-bold transition"
                >Cancel</button
            >
            <button
                onclick={handleCreate}
                disabled={creating || !newName.trim() || !newValue}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if creating}<Icon path={mdiLoading} size={14} class="animate-spin" />{/if}
                Create
            </button>
        </div>
    </div>
</Modal>
