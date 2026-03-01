<script lang="ts">
    import { onMount } from "svelte";
    import {
        ElasticBeanstalkClient,
        DescribeEnvironmentsCommand,
        type EnvironmentDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: ElasticBeanstalkClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [{ id: "environments", label: "Environments" }];
    let activeTab = $state("environments");

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

    // --- Environments ---
    let environments = $state<EnvironmentDescription[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new ElasticBeanstalkClient({
                region: creds.region,
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    sessionToken: creds.session_token || undefined,
                },
            });
            await loadEnvironments();
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    async function loadEnvironments(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new DescribeEnvironmentsCommand({ NextToken: token }),
            );
            environments = res.Environments || [];
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
            loadEnvironments(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadEnvironments(prevToken);
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    {#if activeTab === "environments"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={environments}
                {loading}
                columns={[
                    {
                        label: "Environment Name",
                        key: "EnvironmentName",
                        sortable: true,
                    },
                    {
                        label: "Application",
                        key: "ApplicationName",
                        sortable: true,
                    },
                    { label: "Status", key: "Status", sortable: true },
                    { label: "Health", key: "Health", sortable: true },
                ]}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={handleNext}
                onPrev={handlePrev}
                onRefresh={() => {
                    tokenMap = [];
                    loadEnvironments();
                }}
            >
                {#snippet children(env: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {env.EnvironmentName}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        {env.ApplicationName}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                            class="px-2 py-0.5 rounded text-xs {env.Status ===
                            'Ready'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-yellow-500/20 text-yellow-400'}"
                        >
                            {env.Status}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                            class="px-2 py-0.5 rounded text-xs {env.Health ===
                            'Green'
                                ? 'bg-green-500/20 text-green-400'
                                : env.Health === 'Yellow'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : env.Health === 'Red'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-gray-500/20 text-gray-400'}"
                        >
                            {env.Health || "Unknown"}
                        </span>
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
</ServiceLayout>
