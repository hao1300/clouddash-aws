<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudFormationClient,
        DescribeStacksCommand,
        type Stack,
    } from "@aws-sdk/client-cloudformation";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: CloudFormationClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [{ id: "stacks", label: "Stacks" }];
    let activeTab = $state("stacks");

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

    // --- Stacks ---
    let stacks = $state<Stack[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new CloudFormationClient({
                region: creds.region,
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    sessionToken: creds.session_token || undefined,
                },
            });
            await loadStacks();
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    async function loadStacks(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new DescribeStacksCommand({ NextToken: token }),
            );
            stacks = res.Stacks || [];
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
            loadStacks(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadStacks(prevToken);
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    {#if activeTab === "stacks"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={stacks}
                {loading}
                columns={[
                    {
                        label: "Stack Name",
                        key: "StackName",
                        sortable: true,
                    },
                    { label: "Status", key: "StackStatus", sortable: true },
                    {
                        label: "Creation Time",
                        key: "CreationTime",
                        sortable: true,
                    },
                    {
                        label: "Description",
                        key: "Description",
                        sortable: true,
                    },
                ]}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={handleNext}
                onPrev={handlePrev}
                onRefresh={() => {
                    tokenMap = [];
                    loadStacks();
                }}
            >
                {#snippet children(stack: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {stack.StackName}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                            class="px-2 py-0.5 rounded text-xs {stack.StackStatus?.includes(
                                'COMPLETE',
                            )
                                ? 'bg-green-500/20 text-green-400'
                                : stack.StackStatus?.includes('FAILED')
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-yellow-500/20 text-yellow-400'}"
                        >
                            {stack.StackStatus}
                        </span>
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {stack.CreationTime
                            ? new Date(stack.CreationTime).toLocaleString()
                            : ""}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]"
                    >
                        {stack.Description || "-"}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
</ServiceLayout>
