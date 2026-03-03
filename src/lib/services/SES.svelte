<script lang="ts">
    import { onMount } from "svelte";
    import { SESClient, ListIdentitiesCommand, GetIdentityVerificationAttributesCommand, ListConfigurationSetsCommand, ListTemplatesCommand, VerifyEmailIdentityCommand, VerifyDomainIdentityCommand, DeleteIdentityCommand, SendEmailCommand } from "@aws-sdk/client-ses";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";

    let client: SESClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "identities", label: "Identities" },
        { id: "configuration-sets", label: "Configuration Sets" },
        { id: "templates", label: "Templates" }
    ];
    let activeTab = $state("identities");

    $effect(() => {
        if (!client) return;
        if (activeTab === "identities" && !hasLoadedIdentities) loadIdentities();
        else if (activeTab === "configuration-sets" && !hasLoadedConfigurationSets) loadConfigurationSets();
        else if (activeTab === "templates" && !hasLoadedTemplates) loadTemplates();
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

    // --- Identities ---
    let identities = $state<{ Identity: string; VerificationStatus: string }[]>([]);
    let hasLoadedIdentities = $state(false);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    // --- Verify Identity Modal ---
    let showVerifyModal = $state(false);
    let verifyIdentityType = $state<"Email" | "Domain">("Email");
    let verifyIdentityValue = $state("");
    let verifyingIdentity = $state(false);

    // --- Send Email Modal ---
    let showSendEmailModal = $state(false);
    let sendEmailFrom = $state("");
    let sendEmailTo = $state("");
    let sendEmailSubject = $state("");
    let sendEmailBody = $state("");
    let sendingEmail = $state(false);

    // --- Configuration Sets ---
    let configurationSets = $state<{ Name: string }[]>([]);
    let hasLoadedConfigurationSets = $state(false);
    let confLoading = $state(false);
    let confTokenMap = $state<string[]>([]);
    let confCurrentToken = $state<string | undefined>(undefined);

    // --- Templates ---
    let templates = $state<{ Name: string; CreatedTimestamp?: string }[]>([]);
    let hasLoadedTemplates = $state(false);
    let tplLoading = $state(false);
    let tplTokenMap = $state<string[]>([]);
    let tplCurrentToken = $state<string | undefined>(undefined);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new SESClient({
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

    async function verifyIdentity() {
        if (!client || !verifyIdentityValue) return;
        verifyingIdentity = true;
        error = "";
        actionMsg = "";
        try {
            if (verifyIdentityType === "Email") {
                await client.send(new VerifyEmailIdentityCommand({ EmailAddress: verifyIdentityValue }));
                actionMsg = `Verification email sent to ${verifyIdentityValue}.`;
            } else {
                const res = await client.send(new VerifyDomainIdentityCommand({ Domain: verifyIdentityValue }));
                actionMsg = `Verification initiated for domain ${verifyIdentityValue}. Verification Token: ${res.VerificationToken}`;
            }
            showVerifyModal = false;
            verifyIdentityValue = "";
            tokenMap = [];
            loadIdentities();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            verifyingIdentity = false;
        }
    }

    async function deleteIdentity(identity: string) {
        if (!client) return;
        if (!confirm(`Are you sure you want to delete identity ${identity}?`)) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(new DeleteIdentityCommand({ Identity: identity }));
            actionMsg = `Identity ${identity} deleted.`;
            tokenMap = [];
            loadIdentities();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function openSendEmailModal(identity: string) {
        sendEmailFrom = identity;
        sendEmailTo = "";
        sendEmailSubject = "";
        sendEmailBody = "";
        showSendEmailModal = true;
    }

    async function sendTestEmail() {
        if (!client || !sendEmailFrom || !sendEmailTo || !sendEmailSubject || !sendEmailBody) return;
        sendingEmail = true;
        error = "";
        actionMsg = "";
        try {
            await client.send(new SendEmailCommand({
                Source: sendEmailFrom,
                Destination: { ToAddresses: sendEmailTo.split(",").map(e => e.trim()) },
                Message: {
                    Subject: { Data: sendEmailSubject },
                    Body: { Text: { Data: sendEmailBody } }
                }
            }));
            actionMsg = `Email sent successfully from ${sendEmailFrom}.`;
            showSendEmailModal = false;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            sendingEmail = false;
        }
    }

    async function loadIdentities(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListIdentitiesCommand({ MaxItems: 50, NextToken: token }),
            );
            const ids = res.Identities || [];
            if (ids.length > 0) {
                const attrsRes = await client.send(
                    new GetIdentityVerificationAttributesCommand({ Identities: ids })
                );
                identities = ids.map(id => ({
                    Identity: id,
                    VerificationStatus: attrsRes.VerificationAttributes?.[id]?.VerificationStatus || "Unknown"
                }));
            } else {
                identities = [];
            }
            currentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
            hasLoadedIdentities = true;
        }
    }

    async function loadConfigurationSets(token?: string) {
        if (!client) return;
        confLoading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListConfigurationSetsCommand({ MaxItems: 50, NextToken: token }),
            );
            configurationSets = (res.ConfigurationSets || []).map(cs => ({ Name: cs.Name || "" }));
            confCurrentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            confLoading = false;
            hasLoadedConfigurationSets = true;
        }
    }

    async function loadTemplates(token?: string) {
        if (!client) return;
        tplLoading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListTemplatesCommand({ MaxItems: 50, NextToken: token }),
            );
            templates = (res.TemplatesMetadata || []).map(t => ({
                Name: t.Name || "",
                CreatedTimestamp: t.CreatedTimestamp?.toLocaleString() || ""
            }));
            tplCurrentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            tplLoading = false;
            hasLoadedTemplates = true;
        }
    }

    function handleNext() {
        if (currentToken) {
            pushToken(tokenMap, currentToken);
            loadIdentities(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadIdentities(prevToken);
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
        {#if activeTab === "identities"}
            <PaginatedTable
                items={identities}
                {loading}
                columns={[
                    { label: "Identity", key: "Identity", sortable: true },
                    {
                        label: "Verification Status",
                        key: "VerificationStatus",
                        sortable: true,
                        format: (val) => {
                            if (val === "Success") return "🟢 Success";
                            if (val === "Failed") return "🔴 Failed";
                            if (val === "Pending") return "🟡 Pending";
                            if (val === "NotStarted") return "⚪ NotStarted";
                            if (val === "TemporaryFailure") return "🟠 TemporaryFailure";
                            return `⚪ ${val}`;
                        }
                    },
                ]}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={handleNext}
                onPrev={handlePrev}
                onRefresh={() => {
                    tokenMap = [];
                    loadIdentities();
                }}
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => {
                            verifyIdentityType = "Email";
                            verifyIdentityValue = "";
                            showVerifyModal = true;
                        }}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition font-medium"
                    >
                        Verify a New Identity
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <div class="flex gap-2 justify-end">
                        <button
                            onclick={() => openSendEmailModal(item.Identity)}
                            class="text-green-400 hover:text-green-300 bg-green-900/40 hover:bg-green-800/60 px-2 py-1 rounded text-xs transition"
                            title="Send Test Email"
                        >
                            Send Email
                        </button>
                        <button
                            onclick={() => deleteIdentity(item.Identity)}
                            class="text-red-400 hover:text-red-300 bg-red-900/40 hover:bg-red-800/60 px-2 py-1 rounded text-xs transition"
                            title="Delete"
                        >
                            Delete
                        </button>
                    </div>
                {/snippet}
            </PaginatedTable>
        {:else if activeTab === "configuration-sets"}
            <PaginatedTable
                items={configurationSets}
                loading={confLoading}
                columns={[
                    { label: "Configuration Set Name", key: "Name", sortable: true }
                ]}
                hasNext={!!confCurrentToken}
                hasPrev={confTokenMap.length > 0}
                onNext={() => {
                    if (confCurrentToken) {
                        pushToken(confTokenMap, confCurrentToken);
                        loadConfigurationSets(confCurrentToken);
                    }
                }}
                onPrev={() => loadConfigurationSets(popToken(confTokenMap))}
                onRefresh={() => {
                    confTokenMap = [];
                    loadConfigurationSets();
                }}
            />
        {:else if activeTab === "templates"}
            <PaginatedTable
                items={templates}
                loading={tplLoading}
                columns={[
                    { label: "Template Name", key: "Name", sortable: true },
                    { label: "Created", key: "CreatedTimestamp", sortable: true }
                ]}
                hasNext={!!tplCurrentToken}
                hasPrev={tplTokenMap.length > 0}
                onNext={() => {
                    if (tplCurrentToken) {
                        pushToken(tplTokenMap, tplCurrentToken);
                        loadTemplates(tplCurrentToken);
                    }
                }}
                onPrev={() => loadTemplates(popToken(tplTokenMap))}
                onRefresh={() => {
                    tplTokenMap = [];
                    loadTemplates();
                }}
            />
        {/if}
    </div>
</ServiceLayout>

<Modal bind:open={showVerifyModal} title="Verify New Identity" maxWidth="max-w-md">
    <div class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Identity Type</label>
            <select
                bind:value={verifyIdentityType}
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            >
                <option value="Email">Email Address</option>
                <option value="Domain">Domain</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">{verifyIdentityType === 'Email' ? 'Email Address' : 'Domain Name'}</label>
            <input
                type="text"
                bind:value={verifyIdentityValue}
                placeholder={verifyIdentityType === 'Email' ? 'user@example.com' : 'example.com'}
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
        </div>
        <div class="flex justify-end gap-2 pt-2">
            <button
                onclick={() => showVerifyModal = false}
                class="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition"
            >
                Cancel
            </button>
            <button
                onclick={verifyIdentity}
                disabled={verifyingIdentity || !verifyIdentityValue}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2"
            >
                {#if verifyingIdentity}<span class="animate-spin">⟳</span>{/if}
                Verify
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showSendEmailModal} title="Send Test Email" maxWidth="max-w-lg">
    <div class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">From</label>
            <input
                type="text"
                bind:value={sendEmailFrom}
                disabled
                class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
            />
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">To (comma-separated)</label>
            <input
                type="text"
                bind:value={sendEmailTo}
                placeholder="recipient@example.com"
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Subject</label>
            <input
                type="text"
                bind:value={sendEmailSubject}
                placeholder="Test Email from SES"
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500"
            />
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Body (Text)</label>
            <textarea
                bind:value={sendEmailBody}
                rows="5"
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 font-mono"
            ></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-2">
            <button
                onclick={() => showSendEmailModal = false}
                class="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition"
            >
                Cancel
            </button>
            <button
                onclick={sendTestEmail}
                disabled={sendingEmail || !sendEmailTo || !sendEmailSubject || !sendEmailBody}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2"
            >
                {#if sendingEmail}<span class="animate-spin">⟳</span>{/if}
                Send Email
            </button>
        </div>
    </div>
</Modal>
