<script lang="ts">
    import { onMount } from "svelte";
    import { SESClient, ListIdentitiesCommand } from "@aws-sdk/client-ses";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: SESClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [{ id: "identities", label: "Identities" }];
    let activeTab = $state("identities");

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
    let identities = $state<{ Identity: string }[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

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
            await loadIdentities();
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
            identities = (res.Identities || []).map((id) => ({ Identity: id }));
            currentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
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
    {#if activeTab === "identities"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={identities}
                {loading}
                columns={[
                    { label: "Identity", key: "Identity", sortable: true },
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
                {#snippet children(identity: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {identity.Identity}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
</ServiceLayout>
