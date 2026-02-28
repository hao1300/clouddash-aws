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

    let queues = $state<any[]>([]);
    let nextToken = $state<string | undefined>(undefined);
    let loading = $state(false);
    let error = $state("");
    let client: SQSClient | null = null;

    // Queue detail view
    let selectedQueue = $state<any>(null);
    let messages = $state<any[]>([]);
    let msgLoading = $state(false);
    let sendBody = $state("");
    let sendLoading = $state(false);
    let actionMsg = $state("");

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

    async function loadQueues(append = false) {
        if (!client) return;
        try {
            loading = true;
            error = "";
            const resp = await client.send(
                new ListQueuesCommand({
                    MaxResults: 50,
                    NextToken: append ? nextToken : undefined,
                }),
            );
            const newItems: any[] = [];
            for (const url of resp.QueueUrls ?? []) {
                const name = url.split("/").pop() ?? url;
                let msgsAvail = "N/A",
                    msgsFlight = "N/A";
                try {
                    const attrs = await client.send(
                        new GetQueueAttributesCommand({
                            QueueUrl: url,
                            AttributeNames: [
                                "ApproximateNumberOfMessages",
                                "ApproximateNumberOfMessagesNotVisible",
                            ],
                        }),
                    );
                    msgsAvail =
                        attrs.Attributes?.ApproximateNumberOfMessages ?? "N/A";
                    msgsFlight =
                        attrs.Attributes
                            ?.ApproximateNumberOfMessagesNotVisible ?? "N/A";
                } catch {
                    /* skip */
                }
                newItems.push({
                    name,
                    url,
                    messages_available: msgsAvail,
                    messages_in_flight: msgsFlight,
                });
            }
            queues = append ? [...queues, ...newItems] : newItems;
            nextToken = resp.NextToken;
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
                attributes: m.Attributes,
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
</script>

{#if error}<div class="bg-red-500/20 text-red-300 p-2 rounded text-xs mb-2">
        {error}
    </div>{/if}
{#if actionMsg}<div
        class="bg-blue-500/20 text-blue-300 p-2 rounded text-xs mb-2"
    >
        {actionMsg}
    </div>{/if}

{#if selectedQueue}
    <!-- Queue Detail -->
    <div class="flex items-center gap-2 mb-3">
        <button
            onclick={() => {
                selectedQueue = null;
                messages = [];
                actionMsg = "";
            }}
            class="text-xs text-blue-400 hover:underline">← Queues</button
        >
        <span class="text-sm text-gray-300 font-mono truncate"
            >{selectedQueue.name}</span
        >
        <div class="ml-auto flex gap-2">
            <button
                onclick={pollMessages}
                disabled={msgLoading}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1 rounded text-xs font-bold transition"
                >Poll</button
            >
            <button
                onclick={purgeQueue}
                class="bg-red-600/80 hover:bg-red-500 px-3 py-1 rounded text-xs font-bold transition"
                >Purge</button
            >
        </div>
    </div>

    <!-- Send Message -->
    <div class="flex gap-2 mb-3">
        <textarea
            bind:value={sendBody}
            placeholder="Message body (JSON or text)"
            rows="2"
            class="flex-1 bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 resize-none font-mono"
        ></textarea>
        <button
            onclick={sendMessage}
            disabled={!sendBody.trim() || sendLoading}
            class="bg-green-600 hover:bg-green-500 disabled:opacity-50 px-4 rounded text-xs font-bold self-end transition"
            >Send</button
        >
    </div>

    <!-- Messages -->
    {#if msgLoading}<div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>{/if}
    <div class="space-y-2">
        {#each messages as msg}
            <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
                <div class="flex justify-between items-start mb-2">
                    <span class="font-mono text-xs text-gray-500 truncate"
                        >{msg.id}</span
                    >
                    <button
                        onclick={() => deleteMessage(msg.receipt)}
                        class="text-red-400 hover:text-red-300 text-xs shrink-0 ml-2"
                        >Delete</button
                    >
                </div>
                <pre
                    class="text-xs text-gray-300 whitespace-pre-wrap break-all max-h-32 overflow-auto">{msg.body}</pre>
                {#if msg.sentTimestamp}<div class="text-xs text-gray-600 mt-1">
                        {new Date(Number(msg.sentTimestamp)).toLocaleString()}
                    </div>{/if}
            </div>
        {/each}
    </div>
{:else}
    <!-- Queue List -->
    <div
        class="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800"
    >
        {#each queues as q}
            <button
                onclick={() => selectQueue(q)}
                class="p-3 flex items-center justify-between hover:bg-gray-800/50 transition w-full text-left"
            >
                <div class="min-w-0 mr-3">
                    <span
                        class="text-sm font-semibold text-gray-200 truncate block"
                        >{q.name}</span
                    >
                </div>
                <div class="flex gap-3 shrink-0">
                    <div class="text-center">
                        <div class="text-xs text-gray-500">Avail</div>
                        <div class="text-sm font-bold text-blue-400">
                            {q.messages_available}
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="text-xs text-gray-500">Flight</div>
                        <div class="text-sm font-bold text-yellow-400">
                            {q.messages_in_flight}
                        </div>
                    </div>
                </div>
            </button>
        {/each}
        {#if !loading && queues.length === 0}<div
                class="p-8 text-center text-gray-600 text-sm"
            >
                No SQS queues found.
            </div>{/if}
    </div>
    {#if loading}<div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>{/if}
    {#if nextToken && !loading}<button
            onclick={() => loadQueues(true)}
            class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
            >Load More</button
        >{/if}
{/if}
