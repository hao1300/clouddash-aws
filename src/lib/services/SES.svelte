<script lang="ts">
    import { onMount } from "svelte";
    import { SESClient, ListIdentitiesCommand, GetIdentityVerificationAttributesCommand, ListConfigurationSetsCommand, ListTemplatesCommand } from "@aws-sdk/client-ses";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

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
            />
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
