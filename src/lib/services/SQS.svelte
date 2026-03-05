<script lang="ts">
    import { onMount } from "svelte";
    import {
        SQSClient,
        ListQueuesCommand,
        GetQueueAttributesCommand,
        SendMessageCommand,
        ReceiveMessageCommand,
        DeleteMessageCommand,
        PurgeQueueCommand,
        CreateQueueCommand,
        DeleteQueueCommand,
        SetQueueAttributesCommand,
        ListQueueTagsCommand,
        TagQueueCommand,
        UntagQueueCommand,
    } from "@aws-sdk/client-sqs";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: SQSClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [{ id: "queues", label: "Queues" }];
    let activeTab = $state("queues");

    // --- Pagination Shared Helpers ---
    function pushToken(history: string[], currentNextToken?: string) {
        if (!currentNextToken) return;
        if (history[history.length - 1] !== currentNextToken)
            history.push(currentNextToken);
    }
    function popToken(history: string[]) {
        history.pop();
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    // --- Queues ---
    let queues = $state<any[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

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

    // --- Queue Detail View ---
    let selectedQueue = $state<any>(null);
    let queueDetailTab = $state<"messages" | "configuration" | "tags">("messages");
    let queueAttributes = $state<Record<string, string>>({});
    let queueTags = $state<Record<string, string>>({});
    let tagsLoading = $state(false);
    let configForm = $state({
        VisibilityTimeout: "30",
        MessageRetentionPeriod: "345600",
        Policy: "",
        DelaySeconds: "0",
        MaximumMessageSize: "262144",
        ReceiveMessageWaitTimeSeconds: "0",
        SqsManagedSseEnabled: "true",
        ContentBasedDeduplication: "false",
        UseDeadLetterQueue: false,
        DeadLetterTargetArn: "",
        MaxReceiveCount: "10"
    });
    let attributesLoading = $state(false);
    let messages = $state<any[]>([]);
    let msgLoading = $state(false);
    let sendBody = $state("");
    let sendLoading = $state(false);

    let pollSettings = $state({
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 3,
    });

    let sendDelaySeconds = $state("");
    let sendGroupId = $state("");
    let sendDeduplicationId = $state("");
    let sendAttributes = $state<{ name: string; type: string; value: string }[]>([]);
    let showAdvancedSend = $state(false);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new SQSClient({
                region: creds.region || "us-east-1",
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            });
            await loadQueues();
        } catch (e) {
            error = String(e);
        }
    });

    // --- Queues API ---
    async function loadQueues() {
        if (!client) return;
        try {
            loading = true;
            error = "";
            actionMsg = "";
            queues = [];
            let nextToken: string | undefined = undefined;
            do {
                const resp: any = await client.send(
                    new ListQueuesCommand({
                        MaxResults: 50,
                        NextToken: nextToken,
                    }),
                );
                const pageUrls = resp.QueueUrls ?? [];
                // Fetch attributes in parallel for this page
                const pageItems = await Promise.all(
                    pageUrls.map(async (url: string) => {
                        const name = url.split("/").pop() ?? url;
                        let msgsAvail = "N/A",
                            msgsFlight = "N/A";
                        try {
                            const attrs = await client!.send(
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

    async function selectQueue(q: any) {
        selectedQueue = q;
        messages = [];
        actionMsg = "";
        showCreate = false;
        queueDetailTab = "messages";
        await Promise.all([
            loadQueueAttributes(),
            loadTags(),
        ]);
    }

    async function loadTags() {
        if (!client || !selectedQueue) return;
        try {
            tagsLoading = true;
            error = "";
            const tagsResponse = await client.send(
                new ListQueueTagsCommand({
                    QueueUrl: selectedQueue.url,
                })
            );
            queueTags = tagsResponse.Tags ?? {};
        } catch (e) {
            error = String(e);
        } finally {
            tagsLoading = false;
        }
    }

    let newTagKey = $state("");
    let newTagValue = $state("");

    async function addTag() {
        if (!client || !selectedQueue || !newTagKey.trim()) return;
        try {
            tagsLoading = true;
            error = "";
            actionMsg = "";

            const tagsToUpdate: Record<string, string> = {
                [newTagKey]: newTagValue,
            };

            await client.send(
                new TagQueueCommand({
                    QueueUrl: selectedQueue.url,
                    Tags: tagsToUpdate,
                })
            );

            actionMsg = `Tag '${newTagKey}' added.`;
            newTagKey = "";
            newTagValue = "";
            await loadTags();
        } catch (e) {
            error = String(e);
        } finally {
            tagsLoading = false;
        }
    }

    async function deleteTag(key: string) {
        if (!client || !selectedQueue) return;
        if (!confirm(`Are you sure you want to delete tag '${key}'?`)) return;
        try {
            tagsLoading = true;
            error = "";
            actionMsg = "";

            await client.send(
                new UntagQueueCommand({
                    QueueUrl: selectedQueue.url,
                    TagKeys: [key],
                })
            );

            actionMsg = `Tag '${key}' deleted.`;
            await loadTags();
        } catch (e) {
            error = String(e);
        } finally {
            tagsLoading = false;
        }
    }

    async function loadQueueAttributes() {
        if (!client || !selectedQueue) return;
        try {
            attributesLoading = true;
            error = "";
            const attrs = await client.send(
                new GetQueueAttributesCommand({
                    QueueUrl: selectedQueue.url,
                    AttributeNames: ["All"],
                }),
            );
            queueAttributes = attrs.Attributes ?? {};

            configForm = {
                VisibilityTimeout: queueAttributes.VisibilityTimeout ?? "30",
                MessageRetentionPeriod: queueAttributes.MessageRetentionPeriod ?? "345600",
                Policy: queueAttributes.Policy ?? "",
                DelaySeconds: queueAttributes.DelaySeconds ?? "0",
                MaximumMessageSize: queueAttributes.MaximumMessageSize ?? "262144",
                ReceiveMessageWaitTimeSeconds: queueAttributes.ReceiveMessageWaitTimeSeconds ?? "0",
                SqsManagedSseEnabled: queueAttributes.SqsManagedSseEnabled ?? "true",
                ContentBasedDeduplication: queueAttributes.ContentBasedDeduplication ?? "false",
                UseDeadLetterQueue: false,
                DeadLetterTargetArn: "",
                MaxReceiveCount: "10",
            };

            if (queueAttributes.RedrivePolicy) {
                try {
                    const rp = JSON.parse(queueAttributes.RedrivePolicy);
                    if (rp.deadLetterTargetArn) {
                        configForm.UseDeadLetterQueue = true;
                        configForm.DeadLetterTargetArn = rp.deadLetterTargetArn;
                        configForm.MaxReceiveCount = String(rp.maxReceiveCount ?? "10");
                    }
                } catch {
                    // skip parsing errors
                }
            }
        } catch (e) {
            error = String(e);
        } finally {
            attributesLoading = false;
        }
    }

    async function saveQueueAttributes() {
        if (!client || !selectedQueue) return;
        try {
            attributesLoading = true;
            error = "";
            actionMsg = "";

            // Only update the ones we care about changing
            const attributesToUpdate: Record<string, string> = {
                VisibilityTimeout: String(configForm.VisibilityTimeout),
                DelaySeconds: String(configForm.DelaySeconds),
                ReceiveMessageWaitTimeSeconds: String(configForm.ReceiveMessageWaitTimeSeconds),
                MessageRetentionPeriod: String(configForm.MessageRetentionPeriod),
                MaximumMessageSize: String(configForm.MaximumMessageSize),
                SqsManagedSseEnabled: String(configForm.SqsManagedSseEnabled),
                Policy: configForm.Policy,
            };

            if (selectedQueue.name.endsWith('.fifo')) {
                attributesToUpdate.ContentBasedDeduplication = String(configForm.ContentBasedDeduplication);
            }

            if (configForm.UseDeadLetterQueue && configForm.DeadLetterTargetArn) {
                attributesToUpdate.RedrivePolicy = JSON.stringify({
                    deadLetterTargetArn: configForm.DeadLetterTargetArn,
                    maxReceiveCount: Number(configForm.MaxReceiveCount),
                });
            } else {
                attributesToUpdate.RedrivePolicy = ""; // Remove DLQ
            }

            await client.send(
                new SetQueueAttributesCommand({
                    QueueUrl: selectedQueue.url,
                    Attributes: attributesToUpdate,
                }),
            );
            actionMsg = "Queue configuration saved.";
        } catch (e) {
            error = String(e);
        } finally {
            attributesLoading = false;
        }
    }

    async function deleteQueue() {
        if (!client || !selectedQueue) return;
        if (
            !confirm(
                `Are you sure you want to delete queue ${selectedQueue.name}? This cannot be undone.`,
            )
        )
            return;
        try {
            loading = true;
            error = "";
            actionMsg = "";
            await client.send(
                new DeleteQueueCommand({
                    QueueUrl: selectedQueue.url,
                }),
            );
            actionMsg = `Queue ${selectedQueue.name} deleted.`;
            selectedQueue = null;
            await loadQueues();
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function createQueue() {
        if (!client || !createParams.QueueName) return;
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
                attributes.ContentBasedDeduplication = createParams.ContentBasedDeduplication;
            }

            attributes.SqsManagedSseEnabled = createParams.SqsManagedSseEnabled;

            if (createParams.UseDeadLetterQueue && createParams.DeadLetterTargetArn) {
                attributes.RedrivePolicy = JSON.stringify({
                    deadLetterTargetArn: createParams.DeadLetterTargetArn,
                    maxReceiveCount: Number(createParams.MaxReceiveCount),
                });
            }

            await client.send(
                new CreateQueueCommand({
                    QueueName: queueName,
                    Attributes: attributes,
                }),
            );

            actionMsg = `Queue ${queueName} created successfully.`;
            showCreate = false;
            createParams.QueueName = ""; // Reset
            await loadQueues();
        } catch (e) {
            error = String(e);
        } finally {
            createLoading = false;
        }
    }

    // --- Messages API ---
    async function pollMessages() {
        if (!client || !selectedQueue) return;
        try {
            msgLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new ReceiveMessageCommand({
                    QueueUrl: selectedQueue.url,
                    MaxNumberOfMessages: pollSettings.MaxNumberOfMessages,
                    WaitTimeSeconds: pollSettings.WaitTimeSeconds,
                    MessageAttributeNames: ["All"],
                    AttributeNames: ["All"],
                }),
            );
            messages = (resp.Messages ?? []).map((m) => ({
                id: m.MessageId,
                body: m.Body,
                receipt: m.ReceiptHandle,
                sentTimestamp: m.Attributes?.SentTimestamp,
                messageAttributes: m.MessageAttributes,
                groupId: m.Attributes?.MessageGroupId,
                deduplicationId: m.Attributes?.MessageDeduplicationId,
            }));
            if (messages.length === 0) actionMsg = "No messages available.";
        } catch (e) {
            error = String(e);
        } finally {
            msgLoading = false;
        }
    }

    async function deleteMessage(receipt: string) {
        if (!client || !selectedQueue) return;
        try {
            await client.send(
                new DeleteMessageCommand({
                    QueueUrl: selectedQueue.url,
                    ReceiptHandle: receipt,
                }),
            );
            messages = messages.filter((m) => m.receipt !== receipt);
            actionMsg = "Message deleted.";
        } catch (e) {
            error = String(e);
        }
    }

    async function sendMessage() {
        if (!client || !selectedQueue || !sendBody.trim()) return;
        try {
            sendLoading = true;
            error = "";
            actionMsg = "";

            const cmdInput: any = {
                QueueUrl: selectedQueue.url,
                MessageBody: sendBody,
            };

            if (sendDelaySeconds) {
                cmdInput.DelaySeconds = Number(sendDelaySeconds);
            }

            if (selectedQueue.name.endsWith('.fifo')) {
                if (sendGroupId) cmdInput.MessageGroupId = sendGroupId;
                if (sendDeduplicationId) cmdInput.MessageDeduplicationId = sendDeduplicationId;
            }

            if (sendAttributes.length > 0) {
                const attrs: Record<string, any> = {};
                for (const attr of sendAttributes) {
                    if (!attr.name || !attr.value) continue;

                    if (attr.type === "Binary") {
                        attrs[attr.name] = {
                            DataType: attr.type,
                            BinaryValue: new TextEncoder().encode(attr.value)
                        };
                    } else {
                        attrs[attr.name] = {
                            DataType: attr.type,
                            StringValue: attr.value
                        };
                    }
                }
                if (Object.keys(attrs).length > 0) {
                    cmdInput.MessageAttributes = attrs;
                }
            }

            await client.send(new SendMessageCommand(cmdInput));

            actionMsg = "Message sent!";
            sendBody = "";
            sendDelaySeconds = "";
            sendGroupId = "";
            sendDeduplicationId = "";
            sendAttributes = [];
        } catch (e) {
            error = String(e);
        } finally {
            sendLoading = false;
        }
    }

    async function purgeQueue() {
        if (!client || !selectedQueue) return;
        if (
            !confirm(
                `Purge all messages from ${selectedQueue.name}? This cannot be undone.`,
            )
        )
            return;
        try {
            error = "";
            actionMsg = "";
            await client.send(
                new PurgeQueueCommand({ QueueUrl: selectedQueue.url }),
            );
            actionMsg =
                "Queue purged. Note: it may take up to 60 seconds to complete.";
            messages = [];
        } catch (e) {
            error = String(e);
        }
    }

    const queueColumns = [
        {
            key: "name",
            label: "Queue Name",
            onClick: (item: any) => selectQueue(item),
        },
        { key: "messages_available", label: "Messages Available" },
        { key: "messages_in_flight", label: "Messages In Flight" },
    ];

    const messageColumns = [
        { key: "id", label: "Message ID" },
        {
            key: "body",
            label: "Body Preview",
            format: (v: string) =>
                v ? v.substring(0, 50) + (v.length > 50 ? "..." : "") : "-",
        },
        {
            key: "sentTimestamp",
            label: "Sent At",
            format: (v: string) =>
                v ? new Date(Number(v)).toLocaleString() : "-",
        },
    ];
</script>

<ServiceLayout title="SQS" {tabs} bind:activeTab>
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30 shadow"
        >
            {error}
        </div>{/if}
    {#if actionMsg}<div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30 shadow"
        >
            {actionMsg}
        </div>{/if}

    <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
        {#if showCreate}
            <div class="p-6 max-w-2xl mx-auto h-full overflow-y-auto">
                <div class="flex items-center gap-3 mb-6">
                    <button
                        onclick={() => {
                            showCreate = false;
                            error = "";
                            actionMsg = "";
                        }}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back to Queues</button
                    >
                    <h2 class="text-xl font-bold text-gray-100">
                        Create Queue
                    </h2>
                </div>

                <div class="space-y-6">
                    <!-- Details -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                        <h3 class="text-lg font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Details</h3>
                        <div class="space-y-5">
                            <div>
                                <label for="cq-type" class="block text-sm font-medium text-gray-300 mb-1">Type</label>
                                <select id="cq-type" bind:value={createParams.Type} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                                    <option value="Standard">Standard (at-least-once delivery, best-effort ordering)</option>
                                    <option value="FIFO">FIFO (first-in-first-out delivery, exact-once processing)</option>
                                </select>
                            </div>

                            <div>
                                <label for="cq-name" class="block text-sm font-medium text-gray-300 mb-1">Queue Name</label>
                                <input id="cq-name" type="text" bind:value={createParams.QueueName} placeholder="MyQueue" class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                                <p class="text-xs text-gray-500 mt-1">FIFO queues will automatically have '.fifo' appended if not provided.</p>
                            </div>
                        </div>
                    </div>

                    <!-- Configuration -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                        <h3 class="text-lg font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Configuration</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="cq-vis" class="block text-sm font-medium text-gray-300 mb-1">Visibility Timeout (seconds)</label>
                                <input id="cq-vis" type="number" bind:value={createParams.VisibilityTimeout} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                            </div>
                            <div>
                                <label for="cq-ret" class="block text-sm font-medium text-gray-300 mb-1">Message Retention Period (seconds)</label>
                                <input id="cq-ret" type="number" bind:value={createParams.MessageRetentionPeriod} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                            </div>
                            <div>
                                <label for="cq-del" class="block text-sm font-medium text-gray-300 mb-1">Delivery Delay (seconds)</label>
                                <input id="cq-del" type="number" bind:value={createParams.DeliveryDelay} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                            </div>
                            <div>
                                <label for="cq-max" class="block text-sm font-medium text-gray-300 mb-1">Maximum Message Size (bytes)</label>
                                <input id="cq-max" type="number" bind:value={createParams.MaximumMessageSize} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                            </div>
                            <div class="md:col-span-2">
                                <label for="cq-wait" class="block text-sm font-medium text-gray-300 mb-1">Receive Message Wait Time (seconds)</label>
                                <input id="cq-wait" type="number" bind:value={createParams.ReceiveMessageWaitTimeSeconds} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                            </div>
                        </div>
                    </div>

                    {#if createParams.Type === 'FIFO'}
                    <!-- FIFO Settings -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                        <h3 class="text-lg font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">FIFO Settings</h3>
                        <div>
                            <label for="cq-dedup" class="block text-sm font-medium text-gray-300 mb-1">Content-Based Deduplication</label>
                            <select id="cq-dedup" bind:value={createParams.ContentBasedDeduplication} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                                <option value="true">Enabled</option>
                                <option value="false">Disabled</option>
                            </select>
                            <p class="text-xs text-gray-500 mt-1">If enabled, Amazon SQS uses a SHA-256 hash to generate the message deduplication ID using the body of the message.</p>
                        </div>
                    </div>
                    {/if}

                    <!-- Encryption -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                        <h3 class="text-lg font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Encryption</h3>
                        <div>
                            <label for="cq-sse" class="block text-sm font-medium text-gray-300 mb-1">Server-Side Encryption (SQS managed key)</label>
                            <select id="cq-sse" bind:value={createParams.SqsManagedSseEnabled} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                                <option value="true">Enabled</option>
                                <option value="false">Disabled</option>
                            </select>
                        </div>
                    </div>

                    <!-- Dead-letter queue -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                        <h3 class="text-lg font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Dead-letter queue</h3>
                        <div class="space-y-4">
                            <label for="cq-dlq" class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input id="cq-dlq" type="checkbox" bind:checked={createParams.UseDeadLetterQueue} class="rounded bg-black border-gray-700 text-blue-500 focus:ring-blue-500" />
                                Enabled
                            </label>
                            {#if createParams.UseDeadLetterQueue}
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-gray-800">
                                <div>
                                    <label for="cq-dlq-arn" class="block text-sm font-medium text-gray-300 mb-1">Dead-letter queue ARN</label>
                                    <input id="cq-dlq-arn" type="text" bind:value={createParams.DeadLetterTargetArn} placeholder="arn:aws:sqs:..." class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                                </div>
                                <div>
                                    <label for="cq-dlq-max" class="block text-sm font-medium text-gray-300 mb-1">Maximum receives</label>
                                    <input id="cq-dlq-max" type="number" bind:value={createParams.MaxReceiveCount} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" min="1" max="1000" />
                                </div>
                            </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Action -->
                    <div class="pt-2 flex justify-end">
                        <button
                            onclick={createQueue}
                            disabled={createLoading || !createParams.QueueName.trim()}
                            class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-bold transition flex items-center gap-2"
                        >
                            {#if createLoading}<span class="animate-spin">⟳</span>{/if}
                            Create Queue
                        </button>
                    </div>
                </div>
            </div>
        {:else if selectedQueue}
            <div class="h-full flex flex-col bg-gray-950 p-4 pr-1">
                <!-- Header & Actions -->
                <div
                    class="flex items-center gap-3 mb-4 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm shrink-0"
                >
                    <button
                        onclick={() => {
                            selectedQueue = null;
                            messages = [];
                        }}
                        class="text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 px-3 py-1.5 rounded transition"
                        >← Back to Queues</button
                    >
                    <span
                        class="text-sm font-bold text-gray-200 truncate flex-1"
                        >{selectedQueue.name}</span
                    >

                    <div
                        class="flex gap-1 ml-auto border border-gray-800 rounded bg-black p-1"
                    >
                        <button
                            onclick={() => (queueDetailTab = "messages")}
                            class="px-3 py-1 text-xs rounded transition-colors {queueDetailTab ===
                            'messages'
                                ? 'bg-gray-800 text-white font-semibold'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'}"
                            >Messages</button
                        >
                        <button
                            onclick={() => (queueDetailTab = "configuration")}
                            class="px-3 py-1 text-xs rounded transition-colors {queueDetailTab ===
                            'configuration'
                                ? 'bg-gray-800 text-white font-semibold'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'}"
                            >Configuration</button
                        >
                        <button
                            onclick={() => (queueDetailTab = "tags")}
                            class="px-3 py-1 text-xs rounded transition-colors {queueDetailTab ===
                            'tags'
                                ? 'bg-gray-800 text-white font-semibold'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'}"
                            >Tags</button
                        >
                    </div>

                    {#if queueDetailTab === "messages"}
                        <button
                            onclick={purgeQueue}
                            class="bg-red-600/80 hover:bg-red-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow ml-2"
                            >Purge Queue</button
                        >
                        <button
                            onclick={pollMessages}
                            disabled={msgLoading}
                            class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow flex items-center gap-2"
                        >
                            {#if msgLoading}<span class="animate-spin">⟳</span
                                >{/if}
                            Poll Messages
                        </button>
                    {:else}
                        <button
                            onclick={deleteQueue}
                            class="bg-red-600/80 hover:bg-red-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow ml-2"
                            >Delete Queue</button
                        >
                        <button
                            onclick={saveQueueAttributes}
                            disabled={attributesLoading}
                            class="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow flex items-center gap-2"
                        >
                            {#if attributesLoading}<span class="animate-spin"
                                    >⟳</span
                                >{/if}
                            Save Config
                        </button>
                    {/if}
                </div>

                {#if queueDetailTab === "messages"}
                    <!-- Send Message -->
                    <div
                        class="mb-4 shrink-0 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm flex flex-col gap-2"
                    >
                        <div class="flex gap-2">
                            <textarea
                                bind:value={sendBody}
                                placeholder="Message body (JSON or text)"
                                rows="2"
                                class="flex-1 bg-black text-xs p-3 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 resize-none font-mono shadow-inner"
                            ></textarea>
                            <button
                                onclick={sendMessage}
                                disabled={!sendBody.trim() || sendLoading}
                                class="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 rounded text-xs font-bold transition shadow flex items-center gap-2 h-[auto]"
                            >
                                {#if sendLoading}<span class="animate-spin">⟳</span
                                    >{/if} Send
                            </button>
                        </div>
                        <div class="flex justify-between items-center">
                            <button
                                onclick={() => showAdvancedSend = !showAdvancedSend}
                                class="text-xs text-blue-400 hover:text-blue-300 font-medium transition"
                            >
                                {showAdvancedSend ? "− Hide Advanced Options" : "+ Show Advanced Options"}
                            </button>
                        </div>
                        {#if showAdvancedSend}
                            <div class="p-3 bg-black rounded border border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                <div>
                                    <label for="adv-delay" class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Delay Seconds</label>
                                    <input id="adv-delay" type="number" bind:value={sendDelaySeconds} class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500" placeholder="0 - 900" />
                                </div>
                                {#if selectedQueue.name.endsWith('.fifo')}
                                    <div>
                                        <label for="adv-group" class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Message Group ID *</label>
                                        <input id="adv-group" type="text" bind:value={sendGroupId} class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500" placeholder="Required for FIFO" />
                                    </div>
                                    <div>
                                        <label for="adv-dedup" class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Message Deduplication ID</label>
                                        <input id="adv-dedup" type="text" bind:value={sendDeduplicationId} class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500" placeholder="Optional" />
                                    </div>
                                {/if}
                                <div class="md:col-span-3 border-t border-gray-800 pt-3 mt-1">
                                    <div class="flex justify-between items-center mb-2">
                                        <label for="msg-attr-lbl" class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Message Attributes</label>
                                        <button id="msg-attr-lbl" onclick={() => sendAttributes = [...sendAttributes, {name: '', type: 'String', value: ''}]} class="text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 px-2 py-0.5 rounded transition font-bold">+ Add Attribute</button>
                                    </div>
                                    {#if sendAttributes.length === 0}
                                        <div class="text-[10px] text-gray-600 italic">No attributes added.</div>
                                    {:else}
                                        <div class="space-y-2">
                                            {#each sendAttributes as attr, i}
                                                <div class="flex gap-2 items-center">
                                                    <input type="text" bind:value={attr.name} placeholder="Name" class="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500" />
                                                    <select bind:value={attr.type} class="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500">
                                                        <option value="String">String</option>
                                                        <option value="Number">Number</option>
                                                        <option value="Binary">Binary</option>
                                                    </select>
                                                    <input type="text" bind:value={attr.value} placeholder="Value" class="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500" />
                                                    <button onclick={() => sendAttributes = sendAttributes.filter((_, idx) => idx !== i)} class="text-red-400 hover:text-red-300 px-2 text-lg leading-none" title="Remove Attribute">×</button>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Poll Settings -->
                    <div class="mb-4 shrink-0 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm flex flex-col gap-2">
                        <div class="flex justify-between items-center mb-1">
                            <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Poll Settings</h3>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="poll-max" class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Max Messages (1-10)</label>
                                <input id="poll-max" type="number" min="1" max="10" bind:value={pollSettings.MaxNumberOfMessages} class="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500" />
                            </div>
                            <div>
                                <label for="poll-wait" class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Wait Time Seconds (0-20)</label>
                                <input id="poll-wait" type="number" min="0" max="20" bind:value={pollSettings.WaitTimeSeconds} class="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-500" />
                            </div>
                        </div>
                    </div>

                    <!-- Messages Table -->
                    <div
                        class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 flex flex-col shadow-sm overflow-hidden"
                    >
                        <div
                            class="px-4 py-2 border-b border-gray-800 bg-gray-900/80 flex justify-between items-center shrink-0"
                        >
                            <h3
                                class="text-xs font-bold text-gray-400 uppercase tracking-widest"
                            >
                                Polled Messages
                            </h3>
                            <span class="text-xs text-gray-500"
                                >{messages.length > 0
                                    ? `${messages.length} messages`
                                    : "0 messages"}</span
                            >
                        </div>
                        <div class="flex-1 overflow-auto bg-gray-950 p-2">
                            {#if msgLoading && messages.length === 0}
                                <div
                                    class="h-full flex items-center justify-center text-gray-500"
                                >
                                    <span class="animate-spin text-xl mr-2"
                                        >⟳</span
                                    >
                                    Polling...
                                </div>
                            {:else if messages.length > 0}
                                <div class="space-y-2">
                                    {#each messages as msg}
                                        <div
                                            class="bg-gray-900 p-3 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
                                        >
                                            <div
                                                class="flex justify-between items-start mb-2"
                                            >
                                                <span
                                                    class="font-mono text-xs text-gray-500 truncate mr-4"
                                                    title={msg.id}
                                                    >{msg.id}</span
                                                >
                                                <button
                                                    onclick={() =>
                                                        deleteMessage(
                                                            msg.receipt,
                                                        )}
                                                    class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs shrink-0 transition"
                                                    >Delete</button
                                                >
                                            </div>
                                            <pre
                                                class="text-xs text-gray-300 whitespace-pre-wrap break-all bg-black p-2 rounded border border-gray-800 max-h-40 overflow-auto">{msg.body}</pre>

                                            {#if msg.groupId || msg.deduplicationId}
                                                <div class="mt-2 text-[10px] text-gray-400 flex gap-4">
                                                    {#if msg.groupId}<span><strong class="text-gray-500 uppercase tracking-wider">Group ID:</strong> {msg.groupId}</span>{/if}
                                                    {#if msg.deduplicationId}<span><strong class="text-gray-500 uppercase tracking-wider">Deduplication ID:</strong> {msg.deduplicationId}</span>{/if}
                                                </div>
                                            {/if}

                                            {#if msg.messageAttributes && Object.keys(msg.messageAttributes).length > 0}
                                                <div class="mt-2 bg-black/50 border border-gray-800 rounded p-2">
                                                    <div class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 border-b border-gray-800 pb-1">Message Attributes</div>
                                                    <ul class="space-y-1">
                                                        {#each Object.entries(msg.messageAttributes) as [k, v]}
                                                            <li class="text-[10px] flex">
                                                                <span class="text-blue-400 font-mono w-1/4 truncate" title={k}>{k}</span>
                                                                <span class="text-gray-500 w-16">[{((v as any).DataType)}]</span>
                                                                <span class="text-gray-300 font-mono flex-1 truncate" title={((v as any).StringValue) || (((v as any).BinaryValue) ? new TextDecoder().decode(((v as any).BinaryValue)) : "")}>{((v as any).StringValue) || (((v as any).BinaryValue) ? new TextDecoder().decode(((v as any).BinaryValue)) : "-")}</span>
                                                            </li>
                                                        {/each}
                                                    </ul>
                                                </div>
                                            {/if}

                                            {#if msg.sentTimestamp}<div
                                                    class="text-xs text-gray-600 mt-2 text-right"
                                                >
                                                    {new Date(
                                                        Number(
                                                            msg.sentTimestamp,
                                                        ),
                                                    ).toLocaleString()}
                                                </div>{/if}
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <div
                                    class="h-full flex items-center justify-center text-gray-600 text-sm italic"
                                >
                                    Click "Poll Messages" to retrieve messages.
                                </div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <div
                        class="flex-1 overflow-auto bg-gray-900 rounded-lg border border-gray-800 p-6 shadow-sm"
                    >
                        {#if attributesLoading && Object.keys(queueAttributes).length === 0}
                            <div
                                class="flex items-center justify-center text-gray-500 h-full"
                            >
                                <span class="animate-spin text-xl mr-2">⟳</span>
                                Loading Configuration...
                            </div>
                        {:else}
                            <div class="space-y-6">
                                <!-- Configuration -->
                                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                                    <h3 class="text-sm font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Configuration</h3>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
                                        <div>
                                            <label for="conf-vis" class="block text-xs font-medium text-gray-400 mb-1">Visibility Timeout (seconds)</label>
                                            <input id="conf-vis" type="number" bind:value={configForm.VisibilityTimeout} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                                        </div>
                                        <div>
                                            <label for="conf-ret" class="block text-xs font-medium text-gray-400 mb-1">Message Retention Period (seconds)</label>
                                            <input id="conf-ret" type="number" bind:value={configForm.MessageRetentionPeriod} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                                        </div>
                                        <div>
                                            <label for="conf-del" class="block text-xs font-medium text-gray-400 mb-1">Delivery Delay (seconds)</label>
                                            <input id="conf-del" type="number" bind:value={configForm.DelaySeconds} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                                        </div>
                                        <div>
                                            <label for="conf-max" class="block text-xs font-medium text-gray-400 mb-1">Maximum Message Size (bytes)</label>
                                            <input id="conf-max" type="number" bind:value={configForm.MaximumMessageSize} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                                        </div>
                                        <div class="md:col-span-2">
                                            <label for="conf-wait" class="block text-xs font-medium text-gray-400 mb-1">Receive Message Wait Time (seconds)</label>
                                            <input id="conf-wait" type="number" bind:value={configForm.ReceiveMessageWaitTimeSeconds} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                                        </div>
                                    </div>
                                </div>

                                {#if selectedQueue.name.endsWith('.fifo')}
                                <!-- FIFO Settings -->
                                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                                    <h3 class="text-sm font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">FIFO Settings</h3>
                                    <div class="max-w-3xl">
                                        <label for="conf-dedup" class="block text-xs font-medium text-gray-400 mb-1">Content-Based Deduplication</label>
                                        <select id="conf-dedup" bind:value={configForm.ContentBasedDeduplication} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                                            <option value="true">Enabled</option>
                                            <option value="false">Disabled</option>
                                        </select>
                                    </div>
                                </div>
                                {/if}

                                <!-- Encryption -->
                                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                                    <h3 class="text-sm font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Encryption</h3>
                                    <div class="max-w-3xl">
                                        <label for="conf-sse" class="block text-xs font-medium text-gray-400 mb-1">Server-Side Encryption (SQS managed key)</label>
                                        <select id="conf-sse" bind:value={configForm.SqsManagedSseEnabled} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500">
                                            <option value="true">Enabled</option>
                                            <option value="false">Disabled</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- Dead-letter queue -->
                                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                                    <h3 class="text-sm font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Dead-letter queue</h3>
                                    <div class="space-y-4 max-w-3xl">
                                        <label for="conf-dlq" class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                            <input id="conf-dlq" type="checkbox" bind:checked={configForm.UseDeadLetterQueue} class="rounded bg-black border-gray-700 text-blue-500 focus:ring-blue-500" />
                                            Enabled
                                        </label>
                                        {#if configForm.UseDeadLetterQueue}
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-gray-800">
                                            <div>
                                                <label for="conf-dlq-arn" class="block text-xs font-medium text-gray-400 mb-1">Dead-letter queue ARN</label>
                                                <input id="conf-dlq-arn" type="text" bind:value={configForm.DeadLetterTargetArn} placeholder="arn:aws:sqs:..." class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" />
                                            </div>
                                            <div>
                                                <label for="conf-dlq-max" class="block text-xs font-medium text-gray-400 mb-1">Maximum receives</label>
                                                <input id="conf-dlq-max" type="number" bind:value={configForm.MaxReceiveCount} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" min="1" max="1000" />
                                            </div>
                                        </div>
                                        {/if}
                                    </div>
                                </div>

                                <!-- Access Policy -->
                                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                                    <h3 class="text-sm font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Access Policy (JSON)</h3>
                                    <div class="max-w-3xl">
                                        <label for="conf-policy" class="block text-xs font-medium text-gray-400 mb-1 sr-only">Policy</label>
                                        <textarea id="conf-policy" bind:value={configForm.Policy} rows="8" class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 font-mono resize-y" placeholder="&#123;&quot;Version&quot;: &quot;2012-10-17&quot;, &quot;Statement&quot;: []&#125;"></textarea>
                                    </div>
                                </div>
                            </div>

                            <h3 class="text-sm font-bold text-gray-200 mt-10 mb-4 border-b border-gray-800 pb-2">
                                Queue Details (Read Only)
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-300">
                                <div class="bg-black/50 p-3 rounded border border-gray-800">
                                    <span class="text-gray-500 block mb-1">Queue ARN</span>
                                    <span class="font-mono break-all">{queueAttributes.QueueArn ?? "-"}</span>
                                </div>
                                <div class="bg-black/50 p-3 rounded border border-gray-800">
                                    <span class="text-gray-500 block mb-1">Created Timestamp</span>
                                    <span class="font-mono">
                                        {queueAttributes.CreatedTimestamp ? new Date(Number(queueAttributes.CreatedTimestamp) * 1000).toLocaleString() : "-"}
                                    </span>
                                </div>
                                <div class="bg-black/50 p-3 rounded border border-gray-800">
                                    <span class="text-gray-500 block mb-1">Messages Available</span>
                                    <span class="font-mono">{queueAttributes.ApproximateNumberOfMessages ?? "-"}</span>
                                </div>
                                <div class="bg-black/50 p-3 rounded border border-gray-800">
                                    <span class="text-gray-500 block mb-1">Messages In Flight</span>
                                    <span class="font-mono">{queueAttributes.ApproximateNumberOfMessagesNotVisible ?? "-"}</span>
                                </div>
                            </div>
                        {/if}
                    </div>
                {:else if queueDetailTab === "tags"}
                    <div class="flex-1 overflow-auto bg-gray-900 rounded-lg border border-gray-800 p-6 shadow-sm">
                        <div class="max-w-3xl">
                            <h3 class="text-sm font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Queue Tags</h3>

                            <div class="bg-black border border-gray-800 rounded-lg p-4 mb-6">
                                <h4 class="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Add New Tag</h4>
                                <div class="flex gap-3 items-end">
                                    <div class="flex-1">
                                        <label for="tag-key" class="block text-xs font-medium text-gray-400 mb-1">Key</label>
                                        <input id="tag-key" type="text" bind:value={newTagKey} class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" placeholder="e.g. Environment" />
                                    </div>
                                    <div class="flex-1">
                                        <label for="tag-value" class="block text-xs font-medium text-gray-400 mb-1">Value</label>
                                        <input id="tag-value" type="text" bind:value={newTagValue} class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" placeholder="e.g. Production" />
                                    </div>
                                    <button
                                        onclick={addTag}
                                        disabled={!newTagKey.trim() || tagsLoading}
                                        class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-bold transition h-[38px] flex items-center justify-center min-w-[100px]"
                                    >
                                        {#if tagsLoading}<span class="animate-spin mr-2">⟳</span>{/if}
                                        Add Tag
                                    </button>
                                </div>
                            </div>

                            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                                <div class="px-4 py-3 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                                    <span class="text-xs font-bold text-gray-300 uppercase tracking-wider">Existing Tags</span>
                                    <span class="text-xs text-gray-500">{Object.keys(queueTags).length} tags</span>
                                </div>
                                <div class="p-4">
                                    {#if tagsLoading && Object.keys(queueTags).length === 0}
                                        <div class="flex justify-center text-gray-500 py-4"><span class="animate-spin mr-2">⟳</span> Loading tags...</div>
                                    {:else if Object.keys(queueTags).length === 0}
                                        <div class="text-center text-gray-500 italic py-4">No tags found for this queue.</div>
                                    {:else}
                                        <div class="grid grid-cols-1 gap-2">
                                            {#each Object.entries(queueTags) as [key, val]}
                                                <div class="flex items-center justify-between bg-black border border-gray-800 rounded p-2 px-3">
                                                    <div class="flex items-center gap-4 flex-1 overflow-hidden">
                                                        <span class="text-blue-400 text-sm font-mono truncate min-w-[150px]">{key}</span>
                                                        <span class="text-gray-500 text-xs shrink-0">=</span>
                                                        <span class="text-gray-300 text-sm truncate">{val || '-'}</span>
                                                    </div>
                                                    <button onclick={() => deleteTag(key)} class="text-red-400 hover:text-red-300 hover:bg-red-900/30 px-2 py-1 rounded text-xs ml-4 transition shrink-0">Remove</button>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {:else}
            <PaginatedTable
                items={queues}
                {loading}
                hasNext={false}
                hasPrev={false}
                onRefresh={() => loadQueues()}
                columns={queueColumns}
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => {
                            showCreate = true;
                            selectedQueue = null;
                            error = "";
                        }}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Queue
                    </button>
                {/snippet}
            </PaginatedTable>
        {/if}
    </div>
</ServiceLayout>
