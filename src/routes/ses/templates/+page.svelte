<script lang="ts">
    import {
        ListTemplatesCommand,
        CreateTemplateCommand,
        DeleteTemplateCommand,
    } from "@aws-sdk/client-ses";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let templates = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let showCreateModal = $state(false);
    let newName = $state("");
    let subject = $state("");
    let textBody = $state("");
    let htmlBody = $state("");
    let creating = $state(false);

    $effect(() => {
        if (aws.ses && templates.length === 0) {
            loadTemplates();
        }
    });

    async function loadTemplates() {
        if (!aws.ses) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ses.send(new ListTemplatesCommand({}));
            templates = (res.TemplatesMetadata ?? []).map((t) => ({
                name: t.Name,
                created: t.CreatedTimestamp?.toLocaleString() ?? "-",
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
                new CreateTemplateCommand({
                    Template: {
                        TemplateName: newName,
                        SubjectPart: subject,
                        TextPart: textBody,
                        HtmlPart: htmlBody,
                    },
                }),
            );
            actionMsg = `Template ${newName} created.`;
            showCreateModal = false;
            newName = "";
            subject = "";
            textBody = "";
            htmlBody = "";
            loadTemplates();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(name: string) {
        if (!aws.ses || !confirm(`Delete template ${name}?`)) return;
        try {
            loading = true;
            await aws.ses.send(
                new DeleteTemplateCommand({ TemplateName: name }),
            );
            actionMsg = `Template ${name} deleted.`;
            loadTemplates();
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
        items={templates}
        {loading}
        onRefresh={loadTemplates}
        columns={[
            { label: "Template Name", key: "name" },
            { label: "Created", key: "created" },
        ]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showCreateModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Create Template</button
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

<Modal bind:open={showCreateModal} title="Create Email Template">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Template Name</label
            >
            <input
                type="text"
                bind:value={newName}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Subject Part</label
            >
            <input
                type="text"
                bind:value={subject}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Text Part</label
            >
            <textarea
                bind:value={textBody}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white h-20"
            ></textarea>
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >HTML Part</label
            >
            <textarea
                bind:value={htmlBody}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white h-20"
            ></textarea>
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
