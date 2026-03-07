<script lang="ts">
    import {
        ListQueuesCommand,
        GetQueueAttributesCommand,
        CreateQueueCommand,
        DeleteQueueCommand,
    } from "@aws-sdk/client-sqs";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let queues = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Create Queue ---
    let showCreate = $state(false);
    let createLoading = $state(false);
    let createParams = $state({
        QueueName: "",
        Type: "Standard",
        VisibilityTimeout: "30",
        MessageRetentionPeriod: "345600",
        DeliveryDelay: "0",
        MaximumMessageSize: "262144",
        ReceiveMessageWaitTimeSeconds: "0",
        SqsManagedSseEnabled: "true",
        ContentBasedDeduplication: "false",
        UseDeadLetterQueue: false,
        DeadLetterTargetArn: "",
        MaxReceiveCount: "10",
    });

    let queueToDelete = $state<any>(null);
    let showDeleteModal = $state(false);
    let deleteLoading = $state(false);

    $effect(() => {
        if (queueToDelete) showDeleteModal = true;
    });

    $effect(() => {
        if (!showDeleteModal) queueToDelete = null;
    });

    let _loadedQueues = false;
    $effect(() => {
        if (aws.sqs && !_loadedQueues) {
            _loadedQueues = true;
            loadQueues();
        }
    });

    async function loadQueues() {
        if (!aws.sqs) return;
        try {
            loading = true;
            error = "";
            actionMsg = "";
            queues = [];
            let nextToken: string | undefined = undefined;
            do {
                const resp: any = await aws.sqs.send(
                    new ListQueuesCommand({
                        MaxResults: 50,
                        NextToken: nextToken,
                    }),
                );
                const pageUrls = resp.QueueUrls ?? [];
                const pageItems = await Promise.all(
                    pageUrls.map(async (url: string) => {
                        const name = url.split("/").pop() ?? url;
                        let msgsAvail = "N/A",
                            msgsFlight = "N/A";
                        try {
                            const attrs = await aws.sqs!.send(
                                new GetQueueAttributesCommand({
                                    QueueUrl: url,
                                    AttributeNames: [
                                        "ApproximateNumberOfMessages",
                                        "ApproximateNumberOfMessagesNotVisible",
                                    ],
                                }),
                            );
                            msgsAvail =
                                attrs.Attributes?.ApproximateNumberOfMessages ??
                                "N/A";
                            msgsFlight =
                                attrs.Attributes
                                    ?.ApproximateNumberOfMessagesNotVisible ??
                                "N/A";
                        } catch {
                            /* skip */
                        }
                        return {
                            name,
                            url,
                            messages_available: msgsAvail,
                            messages_in_flight: msgsFlight,
                        };
                    }),
                );
                queues = [...queues, ...pageItems];
                nextToken = resp.NextToken;
            } while (nextToken);
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreateQueue() {
        if (!aws.sqs || !createParams.QueueName) return;
        try {
            createLoading = true;
            error = "";
            actionMsg = "";

            let queueName = createParams.QueueName;
            if (createParams.Type === "FIFO" && !queueName.endsWith(".fifo")) {
                queueName += ".fifo";
            }

            const attributes: Record<string, string> = {
                VisibilityTimeout: String(createParams.VisibilityTimeout),
                MessageRetentionPeriod: String(
                    createParams.MessageRetentionPeriod,
                ),
                DelaySeconds: String(createParams.DeliveryDelay),
                MaximumMessageSize: String(createParams.MaximumMessageSize),
                ReceiveMessageWaitTimeSeconds: String(
                    createParams.ReceiveMessageWaitTimeSeconds,
                ),
            };

            if (createParams.Type === "FIFO") {
                attributes.FifoQueue = "true";
                attributes.ContentBasedDeduplication =
                    createParams.ContentBasedDeduplication;
            }
            attributes.SqsManagedSseEnabled = createParams.SqsManagedSseEnabled;

            if (
                createParams.UseDeadLetterQueue &&
                createParams.DeadLetterTargetArn
            ) {
                attributes.RedrivePolicy = JSON.stringify({
                    deadLetterTargetArn: createParams.DeadLetterTargetArn,
                    maxReceiveCount: Number(createParams.MaxReceiveCount),
                });
            }

            await aws.sqs.send(
                new CreateQueueCommand({
                    QueueName: queueName,
                    Attributes: attributes,
                }),
            );
            actionMsg = `Queue ${queueName} created successfully.`;
            showCreate = false;
            createParams.QueueName = "";
            await loadQueues();
        } catch (e) {
            error = String(e);
        } finally {
            createLoading = false;
        }
    }

    async function confirmDeleteQueue() {
        if (!aws.sqs || !queueToDelete) return;
        try {
            deleteLoading = true;
            error = "";
            actionMsg = "";
            await aws.sqs.send(
                new DeleteQueueCommand({ QueueUrl: queueToDelete.url }),
            );
            actionMsg = `Queue ${queueToDelete.name} deleted.`;
            queueToDelete = null;
            await loadQueues();
        } catch (e) {
            error = String(e);
        } finally {
            deleteLoading = false;
        }
    }

    function handleSelectQueue(url: string) {
        goto(`/sqs/messages?url=${encodeURIComponent(url)}`);
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

    <div class="flex-1 min-h-0 {error || actionMsg ? 'pt-8' : ''}">
        <PaginatedTable
            items={queues}
            {loading}
            onRefresh={() => loadQueues()}
            columns={[
                {
                    key: "name",
                    label: "Queue Name",
                    onClick: (item) => handleSelectQueue(item.url),
                },
                { key: "messages_available", label: "Messages Available" },
                { key: "messages_in_flight", label: "Messages In Flight" },
            ]}
        >
            {#snippet headerActionsSnippet()}
                <button
                    onclick={() => (showCreate = true)}
                    class="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-xs font-bold transition"
                    >+ Create Queue</button
                >
            {/snippet}
            {#snippet actionsSnippet(item)}
                <div class="flex gap-1 justify-end">
                    <button
                        onclick={() => handleSelectQueue(item.url)}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                        >Details</button
                    >
                    <button
                        onclick={() => (queueToDelete = item)}
                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                        >Delete</button
                    >
                </div>
            {/snippet}
        </PaginatedTable>
    </div>
</div>

<Modal bind:open={showCreate} title="Create Queue" maxWidth="max-w-2xl">
    <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
                <label class="block text-xs font-bold text-gray-400 mb-1"
                    >Queue Name</label
                >
                <input
                    bind:value={createParams.QueueName}
                    class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    placeholder="MyQueue"
                />
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-400 mb-1"
                    >Type</label
                >
                <select
                    bind:value={createParams.Type}
                    class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                >
                    <option value="Standard">Standard</option>
                    <option value="FIFO">FIFO</option>
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-400 mb-1"
                    >Visibility Timeout (s)</label
                >
                <input
                    type="number"
                    bind:value={createParams.VisibilityTimeout}
                    class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-400 mb-1"
                    >Message Retention (s)</label
                >
                <input
                    type="number"
                    bind:value={createParams.MessageRetentionPeriod}
                    class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-400 mb-1"
                    >Delivery Delay (s)</label
                >
                <input
                    type="number"
                    bind:value={createParams.DeliveryDelay}
                    class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                />
            </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button
                onclick={() => (showCreate = false)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={handleCreateQueue}
                disabled={createLoading || !createParams.QueueName}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if createLoading}<span class="animate-spin">⟳</span>{/if} Create
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showDeleteModal} title="Delete Queue">
    <div class="space-y-4">
        <p class="text-sm text-gray-300">
            Are you sure you want to delete queue <strong
                >{queueToDelete?.name}</strong
            >? This action cannot be undone.
        </p>
        <div class="flex justify-end gap-2 mt-4">
            <button
                onclick={() => (queueToDelete = null)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={confirmDeleteQueue}
                disabled={deleteLoading}
                class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if deleteLoading}<span class="animate-spin">⟳</span>{/if} Delete
            </button>
        </div>
    </div>
</Modal>
