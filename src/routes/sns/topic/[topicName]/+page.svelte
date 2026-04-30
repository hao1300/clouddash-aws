<script lang="ts">
    import {
        GetTopicAttributesCommand,
        ListSubscriptionsByTopicCommand,
        SubscribeCommand,
        UnsubscribeCommand,
        type Subscription,
    } from "@aws-sdk/client-sns";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiRefresh } from "@mdi/js";

    let topicName = $derived($page.params.topicName);
    let arn = $derived($page.url.searchParams.get("arn") || "");

    let attributes = $state<Record<string, string>>({});
    let subs = $state<Subscription[]>([]);
    let loading = $state(false);
    let loadingAttrs = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    // Create Modal
    let showCreateModal = $state(false);
    let protocol = $state("email");
    let endpoint = $state("");
    let creating = $state(false);

    $effect(() => {
        titleService.setResource(topicName, undefined, "/sns");
    });

    let __initLoaded = false;
    $effect(() => {
        if (aws.sns && arn && !__initLoaded) {
            __initLoaded = true;
            loadAttributes();
            loadSubs();
        }
    });

    async function loadAttributes() {
        if (!aws.sns || !arn) return;
        try {
            loadingAttrs = true;
            const res = await aws.sns.send(
                new GetTopicAttributesCommand({ TopicArn: arn }),
            );
            attributes = res.Attributes || {};
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loadingAttrs = false;
        }
    }

    async function loadSubs(token?: string) {
        if (!aws.sns || !arn) return;
        try {
            loading = true;
            error = "";
            const res = await aws.sns.send(
                new ListSubscriptionsByTopicCommand({
                    TopicArn: arn,
                    NextToken: token,
                }),
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

    async function handleCreate() {
        if (!aws.sns || !arn || !endpoint) return;
        try {
            creating = true;
            await aws.sns.send(
                new SubscribeCommand({
                    TopicArn: arn,
                    Protocol: protocol,
                    Endpoint: endpoint,
                }),
            );
            actionMsg = `Subscription created for ${endpoint}.`;
            showCreateModal = false;
            endpoint = "";
            loadSubs();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(subArn: string) {
        if (
            !aws.sns ||
            !subArn ||
            subArn === "PendingConfirmation" ||
            !confirm("Delete this subscription?")
        )
            return;
        try {
            loading = true;
            await aws.sns.send(
                new UnsubscribeCommand({ SubscriptionArn: subArn }),
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

<div class="h-full relative overflow-hidden flex flex-col p-4 space-y-4">
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

    <div class="bg-gray-900 rounded-lg p-4 border border-gray-800 shrink-0">
        <h2
            class="text-sm font-bold text-gray-200 mb-4 flex items-center justify-between"
        >
            Topic Details
            <button
                onclick={loadAttributes}
                class="text-gray-400 hover:text-white transition"
            >
                <Icon
                    path={mdiRefresh}
                    size={16}
                    class={loadingAttrs ? "animate-spin" : ""}
                />
            </button>
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
                <span class="text-gray-500 block mb-1">Topic ARN</span>
                <span class="text-gray-300 font-mono break-all">{arn}</span>
            </div>
            <div>
                <span class="text-gray-500 block mb-1">Display Name</span>
                <span class="text-gray-300"
                    >{attributes.DisplayName || "-"}</span
                >
            </div>
            <div>
                <span class="text-gray-500 block mb-1"
                    >Subscriptions Confirmed</span
                >
                <span class="text-gray-300"
                    >{attributes.SubscriptionsConfirmed || "-"}</span
                >
            </div>
            <div>
                <span class="text-gray-500 block mb-1"
                    >Subscriptions Pending</span
                >
                <span class="text-gray-300"
                    >{attributes.SubscriptionsPending || "-"}</span
                >
            </div>
        </div>
    </div>

    <div
        class="flex-1 overflow-hidden relative border border-gray-800 rounded-lg"
    >
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
                {
                    label: "Subscription ID",
                    key: "SubscriptionArn",
                    format: (val) =>
                        val === "PendingConfirmation"
                            ? val
                            : val
                              ? val.split(":").pop()
                              : "-",
                },
                { label: "Protocol", key: "Protocol" },
                { label: "Endpoint", key: "Endpoint", wrap: true },
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
                    {#if creating}<Icon
                            path={mdiRefresh}
                            size={14}
                            class="animate-spin"
                        />{/if} Create
                </button>
            </div>
        </div>
    </Modal>
</div>
