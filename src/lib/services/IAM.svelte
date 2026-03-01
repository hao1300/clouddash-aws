<script lang="ts">
    import { onMount } from "svelte";
    import {
        IAMClient,
        ListUsersCommand,
        type User,
    } from "@aws-sdk/client-iam";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: IAMClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [{ id: "users", label: "Users" }];
    let activeTab = $state("users");

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

    // --- Users ---
    let users = $state<User[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            // IAM endpoints are global, typically us-east-1
            client = new IAMClient({
                region: "us-east-1",
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    sessionToken: creds.session_token || undefined,
                },
            });
            await loadUsers();
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    async function loadUsers(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListUsersCommand({ MaxItems: 50, Marker: token }),
            );
            users = res.Users || [];
            currentToken = res.Marker;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleNext() {
        if (currentToken) {
            pushToken(tokenMap, currentToken);
            loadUsers(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadUsers(prevToken);
    }
</script>

<ServiceLayout {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    {#if activeTab === "users"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={users}
                {loading}
                columns={[
                    { label: "User Name", key: "UserName", sortable: true },
                    { label: "User ID", key: "UserId", sortable: true },
                    { label: "ARN", key: "Arn", sortable: true },
                    {
                        label: "Creation Date",
                        key: "CreateDate",
                        sortable: true,
                    },
                ]}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={handleNext}
                onPrev={handlePrev}
                onRefresh={() => {
                    tokenMap = [];
                    loadUsers();
                }}
            >
                {#snippet children(user: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {user.UserName}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        {user.UserId}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {user.Arn}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {user.CreateDate
                            ? new Date(user.CreateDate).toLocaleString()
                            : ""}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
</ServiceLayout>
