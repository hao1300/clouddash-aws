<script lang="ts">
    import { onMount } from "svelte";
    import {
        SNSClient,
        ListPlatformApplicationsCommand,
        CreatePlatformApplicationCommand,
        DeletePlatformApplicationCommand,
        type PlatformApplication,
        ListTopicsCommand,
        ListSubscriptionsCommand,
        CreateTopicCommand,
        DeleteTopicCommand,
        PublishCommand,
        SubscribeCommand,
        UnsubscribeCommand,
        type Topic,
        type Subscription,
    } from "@aws-sdk/client-sns";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";

    let client: SNSClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "platform-applications", label: "Platform Applications" },
        { id: "topics", label: "Topics" },
        { id: "subscriptions", label: "Subscriptions" }
    ];
    let activeTab = $state("topics");

    $effect(() => {
        if (!client) return;
        if (activeTab === "topics" && !hasLoadedTopics) loadTopics();
        else if (activeTab === "subscriptions" && !hasLoadedSubscriptions) loadSubscriptions();
        else if (activeTab === "platform-applications" && !hasLoadedPlatformApplications) loadPlatformApplications();
    });

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

    // --- Topics ---
    let topics = $state<Topic[]>([]);
    let hasLoadedTopics = $state(false);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    // --- Create Topic Modal ---
    let showCreateTopicModal = $state(false);
    let newTopicName = $state("");
    let newTopicFifo = $state(false);
    let creatingTopic = $state(false);

    // --- Publish Message Modal ---
    let showPublishModal = $state(false);
    let publishTopicArn = $state("");
    let publishSubject = $state("");
    let publishMessageBody = $state("");
    let publishingMessage = $state(false);

    // --- Subscriptions ---
    let subscriptions = $state<Subscription[]>([]);
    let hasLoadedSubscriptions = $state(false);
    let subLoading = $state(false);
    let subTokenMap = $state<string[]>([]);
    let subCurrentToken = $state<string | undefined>(undefined);
    // --- Platform Applications ---
    let platformApplications = $state<PlatformApplication[]>([]);
    let hasLoadedPlatformApplications = $state(false);
    let paLoading = $state(false);
    let paTokenMap = $state<string[]>([]);
    let paCurrentToken = $state<string | undefined>(undefined);

    // --- Create Platform Application Modal ---
    let showCreatePlatformAppModal = $state(false);
    let newPaName = $state("");
    let newPaPlatform = $state("GCM");
    let newPaPrincipal = $state("");
    let newPaCredential = $state("");
    let creatingPlatformApp = $state(false);

    // --- Create Subscription Modal ---
    let showCreateSubscriptionModal = $state(false);
    let subTopicArn = $state("");
    let subProtocol = $state("email");
    let subEndpoint = $state("");
    let creatingSubscription = $state(false);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new SNSClient({
                region: creds.region,
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    sessionToken: creds.session_token || undefined,
                },
            });
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    async function createTopic() {
        if (!client || !newTopicName) return;
        creatingTopic = true;
        error = "";
        actionMsg = "";
        try {
            let topicName = newTopicName;
            const attributes: Record<string, string> = {};
            if (newTopicFifo) {
                if (!topicName.endsWith(".fifo")) {
                    topicName += ".fifo";
                }
                attributes["FifoTopic"] = "true";
            }
            await client.send(new CreateTopicCommand({ Name: topicName, Attributes: attributes }));
            actionMsg = `Topic ${topicName} created successfully.`;
            showCreateTopicModal = false;
            newTopicName = "";
            newTopicFifo = false;
            tokenMap = [];
            loadTopics();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creatingTopic = false;
        }
    }

    async function deleteTopic(topicArn: string) {
        if (!client) return;
        if (!confirm(`Are you sure you want to delete topic ${topicArn}?`)) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(new DeleteTopicCommand({ TopicArn: topicArn }));
            actionMsg = `Topic deleted.`;
            tokenMap = [];
            loadTopics();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function openPublishModal(topicArn: string) {
        publishTopicArn = topicArn;
        publishSubject = "";
        publishMessageBody = "";
        showPublishModal = true;
    }

    async function publishMessage() {
        if (!client || !publishTopicArn || !publishMessageBody) return;
        publishingMessage = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(new PublishCommand({
                TopicArn: publishTopicArn,
                Message: publishMessageBody,
                Subject: publishSubject || undefined
            }));
            actionMsg = `Message published to ${publishTopicArn}.`;
            showPublishModal = false;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            publishingMessage = false;
        }
    }

    async function createSubscription() {
        if (!client || !subTopicArn || !subEndpoint) return;
        creatingSubscription = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(new SubscribeCommand({
                TopicArn: subTopicArn,
                Protocol: subProtocol,
                Endpoint: subEndpoint
            }));
            actionMsg = `Subscription created for ${subEndpoint}.`;
            showCreateSubscriptionModal = false;
            subTopicArn = "";
            subEndpoint = "";
            subTokenMap = [];
            loadSubscriptions();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creatingSubscription = false;
        }
    }

    async function deleteSubscription(subscriptionArn: string) {
        if (!client) return;
        if (!confirm(`Are you sure you want to delete subscription ${subscriptionArn}?`)) return;
        subLoading = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }));
            actionMsg = `Subscription deleted.`;
            subTokenMap = [];
            loadSubscriptions();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            subLoading = false;
        }
    }

    async function loadTopics(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListTopicsCommand({ NextToken: token }),
            );
            topics = res.Topics || [];
            currentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
            hasLoadedTopics = true;
        }
    }

    async function loadSubscriptions(token?: string) {
        if (!client) return;
        subLoading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListSubscriptionsCommand({ NextToken: token }),
            );
            subscriptions = res.Subscriptions || [];
            subCurrentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            subLoading = false;
            hasLoadedSubscriptions = true;
        }
    }

    function handleNext() {
        if (currentToken) {
            pushToken(tokenMap, currentToken);
            loadTopics(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadTopics(prevToken);
    }

    async function createPlatformApplication() {
        if (!client || !newPaName || !newPaPlatform || !newPaPrincipal || !newPaCredential) return;
        creatingPlatformApp = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(
                new CreatePlatformApplicationCommand({
                    Name: newPaName,
                    Platform: newPaPlatform,
                    Attributes: {
                        ...(newPaPrincipal ? { PlatformPrincipal: newPaPrincipal } : {}),
                        PlatformCredential: newPaCredential
                    }
                })
            );
            actionMsg = `Platform application ${newPaName} created.`;
            showCreatePlatformAppModal = false;
            newPaName = "";
            newPaPlatform = "GCM";
            newPaPrincipal = "";
            newPaCredential = "";
            paTokenMap = [];
            loadPlatformApplications();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creatingPlatformApp = false;
        }
    }

    async function deletePlatformApplication(arn: string) {
        if (!client) return;
        if (!confirm(`Are you sure you want to delete platform application ${arn}?`)) return;
        paLoading = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(new DeletePlatformApplicationCommand({ PlatformApplicationArn: arn }));
            actionMsg = `Platform application deleted.`;
            paTokenMap = [];
            loadPlatformApplications();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            paLoading = false;
        }
    }

    async function loadPlatformApplications(token?: string) {
        if (!client) return;
        paLoading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListPlatformApplicationsCommand({ NextToken: token }),
            );
            platformApplications = res.PlatformApplications || [];
            paCurrentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            paLoading = false;
            hasLoadedPlatformApplications = true;
        }
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
        {#if activeTab === "topics"}
            <PaginatedTable
                items={topics}
                {loading}
                columns={[
                    { label: "Topic ARN", key: "TopicArn", sortable: true },
                ]}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={handleNext}
                onPrev={handlePrev}
                onRefresh={() => {
                    tokenMap = [];
                    loadTopics();
                }}
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => {
                            newTopicName = "";
                            newTopicFifo = false;
                            showCreateTopicModal = true;
                        }}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Topic
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <div class="flex gap-2 justify-end">
                        <button
                            onclick={() => openPublishModal(item.TopicArn!)}
                            class="text-green-400 hover:text-green-300 bg-green-900/40 hover:bg-green-800/60 px-2 py-1 rounded text-xs transition"
                            title="Publish Message"
                            disabled={!item.TopicArn}
                        >
                            Publish
                        </button>
                        <button
                            onclick={() => deleteTopic(item.TopicArn!)}
                            class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                            title="Delete Topic"
                            disabled={!item.TopicArn}
                        >
                            Delete
                        </button>
                    </div>
                {/snippet}
            </PaginatedTable>
        {:else if activeTab === "platform-applications"}
            <PaginatedTable
                items={platformApplications}
                loading={paLoading}
                columns={[
                    { label: "Application ARN", key: "PlatformApplicationArn", sortable: true },
                ]}
                hasNext={!!paCurrentToken}
                hasPrev={paTokenMap.length > 0}
                onNext={() => {
                    if (paCurrentToken) {
                        pushToken(paTokenMap, paCurrentToken);
                        loadPlatformApplications(paCurrentToken);
                    }
                }}
                onPrev={() => loadPlatformApplications(popToken(paTokenMap))}
                onRefresh={() => {
                    paTokenMap = [];
                    loadPlatformApplications();
                }}
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => {
                            newPaName = "";
                            newPaPlatform = "GCM";
                            newPaPrincipal = "";
                            newPaCredential = "";
                            showCreatePlatformAppModal = true;
                        }}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Platform Application
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <div class="flex gap-2 justify-end">
                        <button
                            onclick={() => deletePlatformApplication(item.PlatformApplicationArn!)}
                            class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                            title="Delete Platform Application"
                            disabled={!item.PlatformApplicationArn}
                        >
                            Delete
                        </button>
                    </div>
                {/snippet}
            </PaginatedTable>
        {:else if activeTab === "subscriptions"}
            <PaginatedTable
                items={subscriptions}
                loading={subLoading}
                columns={[
                    { label: "Subscription ARN", key: "SubscriptionArn", sortable: true },
                    { label: "Protocol", key: "Protocol", sortable: true },
                    { label: "Endpoint", key: "Endpoint", sortable: true },
                    { label: "Topic ARN", key: "TopicArn", sortable: true },
                ]}
                hasNext={!!subCurrentToken}
                hasPrev={subTokenMap.length > 0}
                onNext={() => {
                    if (subCurrentToken) {
                        pushToken(subTokenMap, subCurrentToken);
                        loadSubscriptions(subCurrentToken);
                    }
                }}
                onPrev={() => loadSubscriptions(popToken(subTokenMap))}
                onRefresh={() => {
                    subTokenMap = [];
                    loadSubscriptions();
                }}
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => {
                            subTopicArn = "";
                            subEndpoint = "";
                            subProtocol = "email";
                            showCreateSubscriptionModal = true;
                        }}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Create Subscription
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <div class="flex gap-2 justify-end">
                        <button
                            onclick={() => deleteSubscription(item.SubscriptionArn!)}
                            class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                            title="Delete Subscription"
                            disabled={!item.SubscriptionArn || item.SubscriptionArn === 'PendingConfirmation'}
                        >
                            Delete
                        </button>
                    </div>
                {/snippet}
            </PaginatedTable>
        {/if}
    </div>
</ServiceLayout>

<Modal bind:open={showCreateTopicModal} title="Create Topic" maxWidth="max-w-md">
    <div class="space-y-4">
        <div>
            <label for="newTopicName" class="block text-sm font-medium text-gray-300 mb-1">Topic Name</label>
            <input
                id="newTopicName"
                type="text"
                bind:value={newTopicName}
                placeholder="MyTopic"
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
            {#if newTopicFifo}
                <p class="text-xs text-gray-500 mt-1">.fifo will be appended if not present.</p>
            {/if}
        </div>
        <div class="flex items-center gap-2">
            <input type="checkbox" id="fifo-topic" bind:checked={newTopicFifo} class="w-4 h-4 bg-black border border-gray-700 rounded rounded text-blue-500 focus:ring-blue-500">
            <label for="fifo-topic" class="text-sm font-medium text-gray-300">FIFO Topic</label>
        </div>
        <div class="flex justify-end gap-2 pt-2">
            <button
                onclick={() => showCreateTopicModal = false}
                class="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition"
            >
                Cancel
            </button>
            <button
                onclick={createTopic}
                disabled={creatingTopic || !newTopicName}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2"
            >
                {#if creatingTopic}<span class="animate-spin">⟳</span>{/if}
                Create
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showCreateSubscriptionModal} title="Create Subscription" maxWidth="max-w-md">
    <div class="space-y-4">
        <div>
            <label for="subTopicArn" class="block text-sm font-medium text-gray-300 mb-1">Topic ARN</label>
            {#if topics.length > 0}
                <select
                    id="subTopicArn"
                    bind:value={subTopicArn}
                    class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                >
                    <option value="" disabled>Select a Topic...</option>
                    {#each topics as t}
                        <option value={t.TopicArn}>{t.TopicArn}</option>
                    {/each}
                </select>
            {:else}
                <input
                    id="subTopicArn"
                    type="text"
                    bind:value={subTopicArn}
                    placeholder="arn:aws:sns:..."
                    class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
                />
            {/if}
        </div>
        <div>
            <label for="subProtocol" class="block text-sm font-medium text-gray-300 mb-1">Protocol</label>
            <select
                id="subProtocol"
                bind:value={subProtocol}
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
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
            <label for="subEndpoint" class="block text-sm font-medium text-gray-300 mb-1">Endpoint</label>
            <input
                id="subEndpoint"
                type="text"
                bind:value={subEndpoint}
                placeholder="e.g. user@example.com or arn:aws:sqs:..."
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
        </div>
        <div class="flex justify-end gap-2 pt-2">
            <button
                onclick={() => showCreateSubscriptionModal = false}
                class="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition"
            >
                Cancel
            </button>
            <button
                onclick={createSubscription}
                disabled={creatingSubscription || !subTopicArn || !subEndpoint}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2"
            >
                {#if creatingSubscription}<span class="animate-spin">⟳</span>{/if}
                Create
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showPublishModal} title="Publish Message" maxWidth="max-w-lg">
    <div class="space-y-4">
        <div>
            <label for="publishTopicArn" class="block text-sm font-medium text-gray-300 mb-1">Topic ARN</label>
            <input
                id="publishTopicArn"
                type="text"
                bind:value={publishTopicArn}
                disabled
                class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
            />
        </div>
        <div>
            <label for="publishSubject" class="block text-sm font-medium text-gray-300 mb-1">Subject (Optional)</label>
            <input
                id="publishSubject"
                type="text"
                bind:value={publishSubject}
                placeholder="Message Subject"
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
        </div>
        <div>
            <label for="publishMessageBody" class="block text-sm font-medium text-gray-300 mb-1">Message Body</label>
            <textarea
                id="publishMessageBody"
                bind:value={publishMessageBody}
                rows="6"
                placeholder="Enter message text or JSON..."
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 font-mono"
            ></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-2">
            <button
                onclick={() => showPublishModal = false}
                class="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition"
            >
                Cancel
            </button>
            <button
                onclick={publishMessage}
                disabled={publishingMessage || !publishMessageBody}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2"
            >
                {#if publishingMessage}<span class="animate-spin">⟳</span>{/if}
                Publish
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showCreatePlatformAppModal} title="Create Platform Application" maxWidth="max-w-md">
    <div class="space-y-4">
        <div>
            <label for="newPaName" class="block text-sm font-medium text-gray-300 mb-1">Application Name</label>
            <input
                id="newPaName"
                type="text"
                bind:value={newPaName}
                placeholder="MyPlatformApp"
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
        </div>
        <div>
            <label for="newPaPlatform" class="block text-sm font-medium text-gray-300 mb-1">Platform</label>
            <select
                id="newPaPlatform"
                bind:value={newPaPlatform}
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            >
                <option value="ADM">ADM</option>
                <option value="APNS">APNS</option>
                <option value="APNS_SANDBOX">APNS_SANDBOX</option>
                <option value="BAIDU">BAIDU</option>
                <option value="GCM">GCM</option>
                <option value="MPNS">MPNS</option>
                <option value="WNS">WNS</option>
            </select>
        </div>
        <div>
            <label for="newPaPrincipal" class="block text-sm font-medium text-gray-300 mb-1">Platform Principal</label>
            <input
                id="newPaPrincipal"
                type="text"
                bind:value={newPaPrincipal}
                placeholder="e.g. Server API Key or Certificate..."
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
        </div>
        <div>
            <label for="newPaCredential" class="block text-sm font-medium text-gray-300 mb-1">Platform Credential</label>
            <textarea
                id="newPaCredential"
                bind:value={newPaCredential}
                rows="3"
                placeholder="e.g. Private Key or Client Secret..."
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 font-mono"
            ></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-2">
            <button
                onclick={() => showCreatePlatformAppModal = false}
                class="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition"
            >
                Cancel
            </button>
            <button
                onclick={createPlatformApplication}
                disabled={creatingPlatformApp || !newPaName || !newPaCredential}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2"
            >
                {#if creatingPlatformApp}<span class="animate-spin">⟳</span>{/if}
                Create
            </button>
        </div>
    </div>
</Modal>