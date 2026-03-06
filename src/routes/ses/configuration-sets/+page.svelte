<script lang="ts">
    import {
        ListConfigurationSetsCommand,
        CreateConfigurationSetCommand,
        DeleteConfigurationSetCommand,
    } from "@aws-sdk/client-ses";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let configSets = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let showCreateModal = $state(false);
    let newName = $state("");
    let creating = $state(false);

    $effect(() => {
        if (aws.ses && configSets.length === 0) {
            loadConfigSets();
        }
    });

    async function loadConfigSets() {
        if (!aws.ses) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ses.send(
                new ListConfigurationSetsCommand({}),
            );
            configSets = (res.ConfigurationSets ?? []).map((cs) => ({
                name: cs.Name,
            }));
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreate() {
        if (!aws.ses || !newName) return;
        try {
            creating = true;
            await aws.ses.send(
                new CreateConfigurationSetCommand({
                    ConfigurationSet: { Name: newName },
                }),
            );
            actionMsg = `Configuration set ${newName} created.`;
            showCreateModal = false;
            newName = "";
            loadConfigSets();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(name: string) {
        if (!aws.ses || !confirm(`Delete configuration set ${name}?`)) return;
        try {
            loading = true;
            await aws.ses.send(
                new DeleteConfigurationSetCommand({
                    ConfigurationSetName: name,
                }),
            );
            actionMsg = `Configuration set ${name} deleted.`;
            loadConfigSets();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
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

    <PaginatedTable
        items={configSets}
        {loading}
        onRefresh={loadConfigSets}
        columns={[{ label: "Name", key: "name" }]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showCreateModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Create Config Set</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => handleDelete(item.name)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Delete</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Configuration Set">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                for="configSetName"
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Set Name</label
            >
            <input
                id="configSetName"
                type="text"
                bind:value={newName}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleCreate}
                disabled={creating}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if creating}<span class="animate-spin">⟳</span>{/if} Create
            </button>
        </div>
    </div>
</Modal>
