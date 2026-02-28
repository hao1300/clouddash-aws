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

    // --- Queue Detail View ---
    let selectedQueue = $state<any>(null);
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

    function selectQueue(q: any) {
        selectedQueue = q;
        messages = [];
        actionMsg = "";
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
        {#if selectedQueue}
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
                    <button
                        onclick={purgeQueue}
                        class="bg-red-600/80 hover:bg-red-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow"
                        >Purge Queue</button
                    >
                    <button
                        onclick={pollMessages}
                        disabled={msgLoading}
                        class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow flex items-center gap-2"
                    >
                        {#if msgLoading}<span class="animate-spin">⟳</span>{/if}
                        Poll Messages
                    </button>
                </div>

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
                                <span class="animate-spin text-xl mr-2">⟳</span>
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
                                                title={msg.id}>{msg.id}</span
                                            >
                                            <button
                                                onclick={() =>
                                                    deleteMessage(msg.receipt)}
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
                                                    Number(msg.sentTimestamp),
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
            </div>
        {:else}
            <PaginatedTable
                items={queues}
                {loading}
                hasNext={false}
                hasPrev={false}
                onRefresh={() => loadQueues()}
                columns={queueColumns}
            />
        {/if}
    </div>
</ServiceLayout>
