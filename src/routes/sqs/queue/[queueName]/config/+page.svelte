<script lang="ts">
    import {
        GetQueueAttributesCommand,
        SetQueueAttributesCommand,
    } from "@aws-sdk/client-sqs";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";

    let { data } = $props();
    let queueUrl = $derived(data.queueUrl || "");

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);
    let attributes = $state<Record<string, string>>({});

    let configForm = $state({
        VisibilityTimeout: "30",
        MessageRetentionPeriod: "345600",
        DelaySeconds: "0",
        MaximumMessageSize: "262144",
        ReceiveMessageWaitTimeSeconds: "0",
        SqsManagedSseEnabled: "true",
        ContentBasedDeduplication: "false",
        UseDeadLetterQueue: false,
        DeadLetterTargetArn: "",
        MaxReceiveCount: "10",
    });

    $effect(() => {
        if (aws.sqs && queueUrl) {
            loadAttributes();
        }
    });

    async function loadAttributes() {
        if (!aws.sqs || !queueUrl) return;
        try {
            loading = true;
            error = "";
            const resp = await aws.sqs.send(
                new GetQueueAttributesCommand({
                    QueueUrl: queueUrl,
                    AttributeNames: ["All"],
                }),
            );
            attributes = resp.Attributes ?? {};

            configForm = {
                VisibilityTimeout: attributes.VisibilityTimeout ?? "30",
                MessageRetentionPeriod:
                    attributes.MessageRetentionPeriod ?? "345600",
                DelaySeconds: attributes.DelaySeconds ?? "0",
                MaximumMessageSize: attributes.MaximumMessageSize ?? "262144",
                ReceiveMessageWaitTimeSeconds:
                    attributes.ReceiveMessageWaitTimeSeconds ?? "0",
                SqsManagedSseEnabled: attributes.SqsManagedSseEnabled ?? "true",
                ContentBasedDeduplication:
                    attributes.ContentBasedDeduplication ?? "false",
                UseDeadLetterQueue: false,
                DeadLetterTargetArn: "",
                MaxReceiveCount: "10",
            };

            if (attributes.RedrivePolicy) {
                try {
                    const rp = JSON.parse(attributes.RedrivePolicy);
                    if (rp.deadLetterTargetArn) {
                        configForm.UseDeadLetterQueue = true;
                        configForm.DeadLetterTargetArn = rp.deadLetterTargetArn;
                        configForm.MaxReceiveCount = String(
                            rp.maxReceiveCount ?? "10",
                        );
                    }
                } catch {
                    /* skip */
                }
            }
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function handleSave() {
        if (!aws.sqs || !queueUrl) return;
        try {
            loading = true;
            error = "";
            actionMsg = "";

            const attributesToUpdate: Record<string, string> = {
                VisibilityTimeout: String(configForm.VisibilityTimeout),
                DelaySeconds: String(configForm.DelaySeconds),
                ReceiveMessageWaitTimeSeconds: String(
                    configForm.ReceiveMessageWaitTimeSeconds,
                ),
                MessageRetentionPeriod: String(
                    configForm.MessageRetentionPeriod,
                ),
                MaximumMessageSize: String(configForm.MaximumMessageSize),
                SqsManagedSseEnabled: String(configForm.SqsManagedSseEnabled),
            };

            if (queueUrl.includes(".fifo")) {
                attributesToUpdate.ContentBasedDeduplication = String(
                    configForm.ContentBasedDeduplication,
                );
            }

            if (
                configForm.UseDeadLetterQueue &&
                configForm.DeadLetterTargetArn
            ) {
                attributesToUpdate.RedrivePolicy = JSON.stringify({
                    deadLetterTargetArn: configForm.DeadLetterTargetArn,
                    maxReceiveCount: Number(configForm.MaxReceiveCount),
                });
            } else {
                attributesToUpdate.RedrivePolicy = "";
            }

            await aws.sqs.send(
                new SetQueueAttributesCommand({
                    QueueUrl: queueUrl,
                    Attributes: attributesToUpdate,
                }),
            );
            actionMsg = "Configuration saved.";
            await loadAttributes();
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full bg-gray-950 p-6 overflow-y-auto relative">
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

    <div class="max-w-3xl mx-auto space-y-6 {error || actionMsg ? 'mt-8' : ''}">
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <h3
                class="text-lg font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2"
            >
                Queue Configuration
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-gray-400 mb-1"
                        >Visibility Timeout (s)</label
                    >
                    <input
                        type="number"
                        bind:value={configForm.VisibilityTimeout}
                        class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    />
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 mb-1"
                        >Message Retention (s)</label
                    >
                    <input
                        type="number"
                        bind:value={configForm.MessageRetentionPeriod}
                        class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    />
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 mb-1"
                        >Delivery Delay (s)</label
                    >
                    <input
                        type="number"
                        bind:value={configForm.DelaySeconds}
                        class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    />
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 mb-1"
                        >Maximum Message Size (B)</label
                    >
                    <input
                        type="number"
                        bind:value={configForm.MaximumMessageSize}
                        class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    />
                </div>
            </div>
            <div class="mt-6 flex justify-end">
                <button
                    onclick={handleSave}
                    disabled={loading}
                    class="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-bold transition flex items-center gap-2 shadow"
                >
                    {#if loading}<span class="animate-spin">⟳</span>{/if} Save Changes
                </button>
            </div>
        </div>
    </div>
</div>
