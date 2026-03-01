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
    });

    // --- Queue Detail View ---
    let selectedQueue = $state<any>(null);
    let queueDetailTab = $state<"messages" | "configuration">("messages");
    let queueAttributes = $state<Record<string, string>>({});
    let attributesLoading = $state(false);
    let messages = $state<any[]>([]);
    let msgLoading = $state(false);
    let sendBody = $state("");
    let sendLoading = $state(false);

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
        await loadQueueAttributes();
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
                VisibilityTimeout: String(queueAttributes.VisibilityTimeout),
                DelaySeconds: String(queueAttributes.DelaySeconds),
                ReceiveMessageWaitTimeSeconds: String(
                    queueAttributes.ReceiveMessageWaitTimeSeconds,
                ),
                MessageRetentionPeriod: String(
                    queueAttributes.MessageRetentionPeriod,
                ),
                MaximumMessageSize: String(queueAttributes.MaximumMessageSize),
            };

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
                    MaxNumberOfMessages: 10,
                    WaitTimeSeconds: 3,
                    MessageAttributeNames: ["All"],
                    AttributeNames: ["All"],
                }),
            );
            messages = (resp.Messages ?? []).map((m) => ({
                id: m.MessageId,
                body: m.Body,
                receipt: m.ReceiptHandle,
                sentTimestamp: m.Attributes?.SentTimestamp,
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
            await client.send(
                new SendMessageCommand({
                    QueueUrl: selectedQueue.url,
                    MessageBody: sendBody,
                }),
            );
            actionMsg = "Message sent!";
            sendBody = "";
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

                <div
                    class="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-5"
                >
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-300 mb-1"
                            >Queue Name</label
                        >
                        <input
                            type="text"
                            bind:value={createParams.QueueName}
                            placeholder="MyQueue"
                            class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                        />
                        <p class="text-xs text-gray-500 mt-1">
                            FIFO queues will automatically have '.fifo' appended
                            if not provided.
                        </p>
                    </div>

                    <div>
                        <label
                            class="block text-sm font-medium text-gray-300 mb-1"
                            >Type</label
                        >
                        <select
                            bind:value={createParams.Type}
                            class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                        >
                            <option value="Standard"
                                >Standard (at-least-once delivery, best-effort
                                ordering)</option
                            >
                            <option value="FIFO"
                                >FIFO (first-in-first-out delivery, exact-once
                                processing)</option
                            >
                        </select>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-300 mb-1"
                                >Visibility Timeout (seconds)</label
                            >
                            <input
                                type="number"
                                bind:value={createParams.VisibilityTimeout}
                                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-300 mb-1"
                                >Message Retention Period (seconds)</label
                            >
                            <input
                                type="number"
                                bind:value={createParams.MessageRetentionPeriod}
                                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-300 mb-1"
                                >Delivery Delay (seconds)</label
                            >
                            <input
                                type="number"
                                bind:value={createParams.DeliveryDelay}
                                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-300 mb-1"
                                >Maximum Message Size (bytes)</label
                            >
                            <input
                                type="number"
                                bind:value={createParams.MaximumMessageSize}
                                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                            />
                        </div>
                        <div class="md:col-span-2">
                            <label
                                class="block text-sm font-medium text-gray-300 mb-1"
                                >Receive Message Wait Time (seconds)</label
                            >
                            <input
                                type="number"
                                bind:value={
                                    createParams.ReceiveMessageWaitTimeSeconds
                                }
                                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div class="pt-4 flex justify-end">
                        <button
                            onclick={createQueue}
                            disabled={createLoading ||
                                !createParams.QueueName.trim()}
                            class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-bold transition flex items-center gap-2"
                        >
                            {#if createLoading}<span class="animate-spin"
                                    >⟳</span
                                >{/if}
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
                        class="flex gap-2 mb-4 shrink-0 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm"
                    >
                        <textarea
                            bind:value={sendBody}
                            placeholder="Message body (JSON or text)"
                            rows="2"
                            class="flex-1 bg-black text-xs p-3 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 resize-none font-mono shadow-inner"
                        ></textarea>
                        <button
                            onclick={sendMessage}
                            disabled={!sendBody.trim() || sendLoading}
                            class="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 rounded text-xs font-bold transition shadow flex items-center gap-2"
                        >
                            {#if sendLoading}<span class="animate-spin">⟳</span
                                >{/if} Send
                        </button>
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
                            <h3
                                class="text-sm font-bold text-gray-200 mb-6 border-b border-gray-800 pb-2"
                            >
                                Queue Configuration
                            </h3>
                            <div
                                class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl"
                            >
                                <div>
                                    <label
                                        class="block text-xs font-medium text-gray-400 mb-1"
                                        >Visibility Timeout (seconds)</label
                                    >
                                    <input
                                        type="number"
                                        bind:value={
                                            queueAttributes.VisibilityTimeout
                                        }
                                        class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label
                                        class="block text-xs font-medium text-gray-400 mb-1"
                                        >Message Retention Period (seconds)</label
                                    >
                                    <input
                                        type="number"
                                        bind:value={
                                            queueAttributes.MessageRetentionPeriod
                                        }
                                        class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label
                                        class="block text-xs font-medium text-gray-400 mb-1"
                                        >Delivery Delay (seconds)</label
                                    >
                                    <input
                                        type="number"
                                        bind:value={
                                            queueAttributes.DelaySeconds
                                        }
                                        class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label
                                        class="block text-xs font-medium text-gray-400 mb-1"
                                        >Maximum Message Size (bytes)</label
                                    >
                                    <input
                                        type="number"
                                        bind:value={
                                            queueAttributes.MaximumMessageSize
                                        }
                                        class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div class="md:col-span-2">
                                    <label
                                        class="block text-xs font-medium text-gray-400 mb-1"
                                        >Receive Message Wait Time (seconds)</label
                                    >
                                    <input
                                        type="number"
                                        bind:value={
                                            queueAttributes.ReceiveMessageWaitTimeSeconds
                                        }
                                        class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <h3
                                class="text-sm font-bold text-gray-200 mt-10 mb-4 border-b border-gray-800 pb-2"
                            >
                                Queue Details (Read Only)
                            </h3>
                            <div
                                class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-300"
                            >
                                <div
                                    class="bg-black/50 p-3 rounded border border-gray-800"
                                >
                                    <span class="text-gray-500 block mb-1"
                                        >Queue ARN</span
                                    >
                                    <span class="font-mono break-all"
                                        >{queueAttributes.QueueArn ?? "-"}</span
                                    >
                                </div>
                                <div
                                    class="bg-black/50 p-3 rounded border border-gray-800"
                                >
                                    <span class="text-gray-500 block mb-1"
                                        >Created Timestamp</span
                                    >
                                    <span class="font-mono"
                                        >{queueAttributes.CreatedTimestamp
                                            ? new Date(
                                                  Number(
                                                      queueAttributes.CreatedTimestamp,
                                                  ) * 1000,
                                              ).toLocaleString()
                                            : "-"}</span
                                    >
                                </div>
                                <div
                                    class="bg-black/50 p-3 rounded border border-gray-800"
                                >
                                    <span class="text-gray-500 block mb-1"
                                        >Messages Available</span
                                    >
                                    <span class="font-mono"
                                        >{queueAttributes.ApproximateNumberOfMessages ??
                                            "-"}</span
                                    >
                                </div>
                                <div
                                    class="bg-black/50 p-3 rounded border border-gray-800"
                                >
                                    <span class="text-gray-500 block mb-1"
                                        >Messages In Flight</span
                                    >
                                    <span class="font-mono"
                                        >{queueAttributes.ApproximateNumberOfMessagesNotVisible ??
                                            "-"}</span
                                    >
                                </div>
                            </div>
                        {/if}
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
                {#snippet children(queue: any)}
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
