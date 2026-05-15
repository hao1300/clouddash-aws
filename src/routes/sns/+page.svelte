<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import {
        ListTopicsCommand,
        CreateTopicCommand,
        DeleteTopicCommand,
        PublishCommand,
        type Topic,
    } from "@aws-sdk/client-sns";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { confirmDialog } from "$lib/services/confirm.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiRefresh } from "@mdi/js";
    import { goto } from "$app/navigation";

    let topics = $state<Topic[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    // Create Modal
    let showCreateModal = $state(false);
    let newName = $state("");
    let isFifo = $state(false);
    let creating = $state(false);

    // Publish Modal
    let showPublishModal = $state(false);
    let publishArn = $state("");
    let publishSubject = $state("");
    let publishBody = $state("");
    let publishing = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.sns && !__initLoaded) {
            __initLoaded = true;
            loadTopics();
        }
    });

    async function loadTopics(token?: string) {
        if (!aws.sns) return;
        try {
            loading = true;
            error = "";
            const res = await aws.sns.send(
                new ListTopicsCommand({ NextToken: token }),
            );
            topics = res.Topics || [];
            if (token) history.push(token);
            marker = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreate() {
        if (!aws.sns || !newName) return;
        try {
            creating = true;
            let name = newName;
            const attributes: Record<string, string> = {};
            if (isFifo) {
                if (!name.endsWith(".fifo")) name += ".fifo";
                attributes["FifoTopic"] = "true";
            }
            await aws.sns.send(
                new CreateTopicCommand({ Name: name, Attributes: attributes }),
            );
            actionMsg = `Topic ${name} created.`;
            showCreateModal = false;
            newName = "";
            isFifo = false;
            loadTopics();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(arn: string) {
        if (!aws.sns) return;
        if (!(await confirmDialog({ message: "Delete this topic?", confirmText: "Delete", destructive: true }))) return;
        try {
            loading = true;
            await aws.sns.send(new DeleteTopicCommand({ TopicArn: arn }));
            actionMsg = "Topic deleted.";
            loadTopics();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handlePublish() {
        if (!aws.sns || !publishArn || !publishBody) return;
        try {
            publishing = true;
            await aws.sns.send(
                new PublishCommand({
                    TopicArn: publishArn,
                    Message: publishBody,
                    Subject: publishSubject || undefined,
                }),
            );
            actionMsg = "Message published.";
            showPublishModal = false;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            publishing = false;
        }
    }
</script>
<div class="h-full flex flex-col overflow-hidden">
<TabBar
    tabs={[
        { id: "topics", label: "Topics", href: "/sns" },
        { id: "subscriptions", label: "Subscriptions", href: "/sns/subscriptions" },
    ]}
    activeTab="topics"
/>
<div class="flex-1 overflow-hidden relative">
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
        items={topics}
        {loading}
        onRefresh={() => {
            history = [];
            loadTopics();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadTopics(marker)}
        onPrev={() => {
            history.pop();
            loadTopics(history[history.length - 1]);
        }}
        columns={[{ 
            label: "Topic Name", 
            key: "TopicArn", 
            format: (val) => val ? val.split(':').pop() : "-",
            onClick: (item) => goto(`/sns/topic/${encodeURIComponent(item.TopicArn!.split(':').pop()!)}?arn=${encodeURIComponent(item.TopicArn!)}`)
        }]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showCreateModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Create Topic</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => {
                        publishArn = item.TopicArn!;
                        publishSubject = "";
                        publishBody = "";
                        showPublishModal = true;
                    }}
                    class="text-[10px] bg-green-600/20 hover:bg-green-600/40 text-green-400 px-2 py-1 rounded border border-green-500/30 transition shadow"
                    >Publish</button
                >
                <button
                    onclick={() => handleDelete(item.TopicArn!)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Delete</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Topic">
    <div class="space-y-4 p-4">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Topic Name</label
            >
            <input
                type="text"
                bind:value={newName}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div class="flex items-center gap-2">
            <input
                type="checkbox"
                bind:checked={isFifo}
                id="isFifo"
                class="bg-black border-gray-700 rounded"
            />
            <label for="isFifo" class="text-xs text-gray-300">FIFO Topic</label>
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleCreate}
                disabled={creating}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if creating}<Icon path={mdiRefresh} size={14} class="animate-spin" />{/if} Create
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showPublishModal} title="Publish Message">
    <div class="space-y-4 p-4">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Subject (Optional)</label
            >
            <input
                type="text"
                bind:value={publishSubject}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Message Body</label
            >
            <textarea
                bind:value={publishBody}
                rows="5"
                class="w-full bg-black border border-gray-700 rounded p-3 text-xs font-mono text-gray-300"
            ></textarea>
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handlePublish}
                disabled={publishing}
                class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if publishing}<Icon path={mdiRefresh} size={14} class="animate-spin" />{/if} Publish
            </button>
        </div>
    </div>
</Modal>
</div>
</div>
