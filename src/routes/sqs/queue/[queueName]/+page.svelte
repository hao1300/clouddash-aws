<script lang="ts">
    import {
        ReceiveMessageCommand,
        DeleteMessageCommand,
        SendMessageCommand,
        PurgeQueueCommand,
        StartMessageMoveTaskCommand,
        GetQueueAttributesCommand,
    } from "@aws-sdk/client-sqs";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";

    let queueName = $derived($page.params.queueName || "");
    let queueUrl = $derived($page.url.searchParams.get("url") || "");

    $effect(() => {
        titleService.setResource(queueName);
    });

    let error = $state("");
    let actionMsg = $state("");
    let msgLoading = $state(false);
    let messages = $state<any[]>([]);

    let pollSettings = $state({
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 3,
    });

    let sendBody = $state("");
    let sendLoading = $state(false);
    let showAdvancedSend = $state(false);
    let sendDelaySeconds = $state("");
    let sendGroupId = $state("");
    let sendDeduplicationId = $state("");
    let sendAttributes = $state<
        { name: string; type: string; value: string }[]
    >([]);

    let viewingMessage = $state<any>(null);
    let showModal = $state(false);

    let queueArn = $state("");
    let redriveLoading = $state(false);

    $effect(() => {
        if (aws.sqs && queueUrl) {
            fetchQueueAttributes();
        }
    });

    async function fetchQueueAttributes() {
        if (!aws.sqs || !queueUrl) return;
        try {
            const resp = await aws.sqs.send(
                new GetQueueAttributesCommand({
                    QueueUrl: queueUrl,
                    AttributeNames: ["QueueArn"],
                }),
            );
            queueArn = resp.Attributes?.QueueArn || "";
        } catch (e) {
            console.error("Failed to fetch queue attributes", e);
        }
    }

    $effect(() => {
        if (viewingMessage) showModal = true;
    });

    $effect(() => {
        if (!showModal) viewingMessage = null;
    });

    async function pollMessages() {
        if (!aws.sqs || !queueUrl) return;
        try {
            msgLoading = true;
            error = "";
            actionMsg = "";
            const resp = await aws.sqs.send(
                new ReceiveMessageCommand({
                    QueueUrl: queueUrl,
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
        if (!aws.sqs || !queueUrl) return;
        try {
            await aws.sqs.send(
                new DeleteMessageCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: receipt,
                }),
            );
            messages = messages.filter((m) => m.receipt !== receipt);
            actionMsg = "Message deleted.";
        } catch (e) {
            error = String(e);
        }
    }

    async function handleSendMessage() {
        if (!aws.sqs || !queueUrl || !sendBody.trim()) return;
        try {
            sendLoading = true;
            error = "";
            actionMsg = "";

            const cmdInput: any = {
                QueueUrl: queueUrl,
                MessageBody: sendBody,
            };

            if (sendDelaySeconds)
                cmdInput.DelaySeconds = Number(sendDelaySeconds);
            if (queueUrl.includes(".fifo")) {
                if (sendGroupId) cmdInput.MessageGroupId = sendGroupId;
                if (sendDeduplicationId)
                    cmdInput.MessageDeduplicationId = sendDeduplicationId;
            }

            if (sendAttributes.length > 0) {
                const attrs: Record<string, any> = {};
                for (const attr of sendAttributes) {
                    if (!attr.name || !attr.value) continue;
                    attrs[attr.name] = {
                        DataType: attr.type,
                        [attr.type === "Binary"
                            ? "BinaryValue"
                            : "StringValue"]:
                            attr.type === "Binary"
                                ? new TextEncoder().encode(attr.value)
                                : attr.value,
                    };
                }
                if (Object.keys(attrs).length > 0)
                    cmdInput.MessageAttributes = attrs;
            }

            await aws.sqs.send(new SendMessageCommand(cmdInput));
            actionMsg = "Message sent!";
            sendBody = "";
            sendAttributes = [];
        } catch (e) {
            error = String(e);
        } finally {
            sendLoading = false;
        }
    }

    async function handlePurge() {
        if (!aws.sqs || !queueUrl) return;
        if (!confirm("Purge all messages? This cannot be undone.")) return;
        try {
            error = "";
            actionMsg = "";
            await aws.sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
            actionMsg = "Queue purged. (Takes up to 60s)";
            messages = [];
        } catch (e) {
            error = String(e);
        }
    }

    async function handleRedrive() {
        if (!aws.sqs || !queueArn) return;
        if (
            !confirm(
                "Start DLQ redrive? This will move messages back to their source queue.",
            )
        )
            return;
        try {
            redriveLoading = true;
            error = "";
            actionMsg = "";
            await aws.sqs.send(
                new StartMessageMoveTaskCommand({
                    SourceArn: queueArn,
                }),
            );
            actionMsg = "DLQ redrive task started successfully.";
        } catch (e) {
            error = String(e);
        } finally {
            redriveLoading = false;
        }
    }
</script>

<div class="h-full flex flex-col p-4 bg-gray-950 overflow-hidden relative">
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

    <div
        class="mb-4 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm flex items-center justify-between shrink-0 {error ||
        actionMsg
            ? 'mt-8'
            : ''}"
    >
        <span class="text-sm font-bold text-gray-200"
            >{$page.params.queueName}</span
        >
    </div>

    <div
        class="mb-4 shrink-0 bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
    >
        <div class="flex gap-2">
            <textarea
                bind:value={sendBody}
                placeholder="Message body..."
                rows="2"
                class="flex-1 bg-black text-xs p-3 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 resize-none font-mono"
            ></textarea>
            <button
                onclick={handleSendMessage}
                disabled={!sendBody.trim() || sendLoading}
                class="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if sendLoading}<span class="animate-spin">⟳</span>{/if} Send
            </button>
        </div>
        <div class="mt-2 flex items-center justify-between">
            <button
                onclick={() => (showAdvancedSend = !showAdvancedSend)}
                class="text-[10px] text-blue-400 font-bold uppercase tracking-wider"
                >{showAdvancedSend ? "Hide" : "Show"} Advanced</button
            >
            <div class="flex gap-2">
                <button
                    onclick={handlePurge}
                    class="bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-1 rounded text-[10px] font-bold transition"
                    >Purge Queue</button
                >
                <button
                    onclick={handleRedrive}
                    disabled={!queueArn || redriveLoading}
                    class="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-3 py-1 rounded text-[10px] font-bold transition flex items-center gap-2"
                >
                    {#if redriveLoading}<span class="animate-spin">⟳</span>{/if}
                    Start Redrive
                </button>
                <button
                    onclick={pollMessages}
                    disabled={msgLoading}
                    class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1 rounded text-[10px] font-bold transition flex items-center gap-2"
                >
                    {#if msgLoading}<span class="animate-spin">⟳</span>{/if} Poll
                    Messages
                </button>
            </div>
        </div>
    </div>

    <div
        class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 flex flex-col shadow-sm overflow-hidden"
    >
        <PaginatedTable
            items={messages}
            loading={msgLoading}
            columns={[
                { key: "id", label: "Message ID" },
                {
                    key: "body",
                    label: "Body",
                    format: (v) =>
                        v?.length > 50 ? v.substring(0, 50) + "..." : v,
                },
                {
                    key: "sentTimestamp",
                    label: "Sent At",
                    format: (v) =>
                        v ? new Date(Number(v)).toLocaleString() : "-",
                },
            ]}
        >
            {#snippet actionsSnippet(item)}
                <div class="flex gap-1 justify-end">
                    <button
                        onclick={() => (viewingMessage = item)}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                        >View</button
                    >
                    <button
                        onclick={() => deleteMessage(item.receipt)}
                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                        >Delete</button
                    >
                </div>
            {/snippet}
        </PaginatedTable>
    </div>
</div>

<Modal bind:open={showModal} title="Message Details" maxWidth="max-w-4xl">
    <div class="bg-black/50 p-4 rounded min-h-[40vh] overflow-auto">
        <pre
            class="text-xs text-green-400 font-mono whitespace-pre-wrap">{JSON.stringify(
                viewingMessage,
                null,
                2,
            )}</pre>
    </div>
</Modal>
