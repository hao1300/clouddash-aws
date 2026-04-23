<script lang="ts">
    import {
        ListSubscriptionsCommand,
        SubscribeCommand,
        UnsubscribeCommand,
        ListTopicsCommand,
        type Subscription,
        type Topic,
    } from "@aws-sdk/client-sns";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiRefresh } from "@mdi/js";

    let subs = $state<Subscription[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    // Create Modal
    let showCreateModal = $state(false);
    let topics = $state<Topic[]>([]);
    let subTopicArn = $state("");
    let protocol = $state("email");
    let endpoint = $state("");
    let creating = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.sns && !__initLoaded) {
            __initLoaded = true;
            loadSubs();
            loadTopics();
        }
    });

    async function loadSubs(token?: string) {
        if (!aws.sns) return;
        try {
            loading = true;
            error = "";
            const res = await aws.sns.send(
                new ListSubscriptionsCommand({ NextToken: token }),
            );
            subs = res.Subscriptions || [];
            if (token) history.push(token);
            marker = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function loadTopics() {
        if (!aws.sns) return;
        try {
            const res = await aws.sns.send(new ListTopicsCommand({}));
            topics = res.Topics || [];
        } catch (e) {
            console.error("Failed to load topics for subscription modal", e);
        }
    }

    async function handleCreate() {
        if (!aws.sns || !subTopicArn || !endpoint) return;
        try {
            creating = true;
            await aws.sns.send(
                new SubscribeCommand({
                    TopicArn: subTopicArn,
                    Protocol: protocol,
                    Endpoint: endpoint,
                }),
            );
            actionMsg = `Subscription created for ${endpoint}.`;
            showCreateModal = false;
            subTopicArn = "";
            endpoint = "";
            loadSubs();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(arn: string) {
        if (
            !aws.sns ||
            !arn ||
            arn === "PendingConfirmation" ||
            !confirm("Delete this subscription?")
        )
            return;
        try {
            loading = true;
            await aws.sns.send(
                new UnsubscribeCommand({ SubscriptionArn: arn }),
            );
            actionMsg = "Subscription deleted.";
            loadSubs();
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
        items={subs}
        {loading}
        onRefresh={() => {
            history = [];
            loadSubs();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadSubs(marker)}
        onPrev={() => {
            history.pop();
            loadSubs(history[history.length - 1]);
        }}
        columns={[
            { label: "Subscription Name", key: "SubscriptionArn", format: (val) => val === "PendingConfirmation" ? val : val ? val.split(':').pop() : "-" },
            { label: "Protocol", key: "Protocol" },
            { label: "Endpoint", key: "Endpoint", wrap: true },
            { label: "Topic Name", key: "TopicArn", format: (val) => val ? val.split(':').pop() : "-" },
        ]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showCreateModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Create Subscription</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => handleDelete(item.SubscriptionArn!)}
                    disabled={!item.SubscriptionArn ||
                        item.SubscriptionArn === "PendingConfirmation"}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow disabled:opacity-50"
                >
                    Delete
                </button>
            </div>
        {/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Subscription">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Topic ARN</label
            >
            <select
                bind:value={subTopicArn}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            >
                <option value="" disabled>Select a Topic...</option>
                {#each topics as t}
                    <option value={t.TopicArn}>{t.TopicArn ? t.TopicArn.split(':').pop() : ""}</option>
                {/each}
            </select>
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Protocol</label
            >
            <select
                bind:value={protocol}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="email">Email</option>
                <option value="email-json">Email-JSON</option>
                <option value="sms">SMS</option>
                <option value="sqs">SQS</option>
                <option value="application">Application</option>
                <option value="lambda">Lambda</option>
                <option value="firehose">Firehose</option>
            </select>
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Endpoint</label
            >
            <input
                type="text"
                bind:value={endpoint}
                placeholder="user@example.com / arn"
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
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
