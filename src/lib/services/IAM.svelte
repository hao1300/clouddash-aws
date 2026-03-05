<script lang="ts">
    import { onMount } from "svelte";
    import {
        IAMClient,
        ListUsersCommand,
        ListRolesCommand,
        ListPoliciesCommand,
        ListGroupsCommand,
        type User,
        type Role,
        type Policy,
        type Group,
    } from "@aws-sdk/client-iam";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: IAMClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "users", label: "Users" },
        { id: "groups", label: "Groups" },
        { id: "roles", label: "Roles" },
        { id: "policies", label: "Policies" },
    ];
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

    // --- Lazy Loading Flags ---
    let usersLoaded = $state(false);
    let groupsLoaded = $state(false);
    let rolesLoaded = $state(false);
    let policiesLoaded = $state(false);

    // --- Users ---
    let users = $state<User[]>([]);
    let usersTokenMap = $state<string[]>([]);
    let currentUsersToken = $state<string | undefined>(undefined);

    // --- Groups ---
    let groups = $state<Group[]>([]);
    let groupsTokenMap = $state<string[]>([]);
    let currentGroupsToken = $state<string | undefined>(undefined);

    // --- Roles ---
    let roles = $state<Role[]>([]);
    let rolesTokenMap = $state<string[]>([]);
    let currentRolesToken = $state<string | undefined>(undefined);

    // --- Policies ---
    let policies = $state<Policy[]>([]);
    let policiesTokenMap = $state<string[]>([]);
    let currentPoliciesToken = $state<string | undefined>(undefined);

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
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    $effect(() => {
        if (!client) return;
        if (activeTab === "users" && !usersLoaded) {
            loadUsers();
        } else if (activeTab === "groups" && !groupsLoaded) {
            loadGroups();
        } else if (activeTab === "roles" && !rolesLoaded) {
            loadRoles();
        } else if (activeTab === "policies" && !policiesLoaded) {
            loadPolicies();
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
            currentUsersToken = res.Marker;
            usersLoaded = true;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleNextUsers() {
        if (currentUsersToken) {
            pushToken(usersTokenMap, currentUsersToken);
            loadUsers(currentUsersToken);
        }
    }

    function handlePrevUsers() {
        const prevToken = popToken(usersTokenMap);
        loadUsers(prevToken);
    }

    async function loadGroups(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListGroupsCommand({ MaxItems: 50, Marker: token }),
            );
            groups = res.Groups || [];
            currentGroupsToken = res.Marker;
            groupsLoaded = true;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleNextGroups() {
        if (currentGroupsToken) {
            pushToken(groupsTokenMap, currentGroupsToken);
            loadGroups(currentGroupsToken);
        }
    }

    function handlePrevGroups() {
        const prevToken = popToken(groupsTokenMap);
        loadGroups(prevToken);
    }

    async function loadRoles(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListRolesCommand({ MaxItems: 50, Marker: token }),
            );
            roles = res.Roles || [];
            currentRolesToken = res.Marker;
            rolesLoaded = true;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleNextRoles() {
        if (currentRolesToken) {
            pushToken(rolesTokenMap, currentRolesToken);
            loadRoles(currentRolesToken);
        }
    }

    function handlePrevRoles() {
        const prevToken = popToken(rolesTokenMap);
        loadRoles(prevToken);
    }

    async function loadPolicies(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new ListPoliciesCommand({ MaxItems: 50, Marker: token }),
            );
            policies = res.Policies || [];
            currentPoliciesToken = res.Marker;
            policiesLoaded = true;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleNextPolicies() {
        if (currentPoliciesToken) {
            pushToken(policiesTokenMap, currentPoliciesToken);
            loadPolicies(currentPoliciesToken);
        }
    }

    function handlePrevPolicies() {
        const prevToken = popToken(policiesTokenMap);
        loadPolicies(prevToken);
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
                hasNext={!!currentUsersToken}
                hasPrev={usersTokenMap.length > 0}
                onNext={handleNextUsers}
                onPrev={handlePrevUsers}
                onRefresh={() => {
                    usersTokenMap = [];
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
    {#if activeTab === "groups"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={groups}
                {loading}
                columns={[
                    { label: "Group Name", key: "GroupName", sortable: true },
                    { label: "Group ID", key: "GroupId", sortable: true },
                    { label: "ARN", key: "Arn", sortable: true },
                    {
                        label: "Creation Date",
                        key: "CreateDate",
                        sortable: true,
                    },
                ]}
                hasNext={!!currentGroupsToken}
                hasPrev={groupsTokenMap.length > 0}
                onNext={handleNextGroups}
                onPrev={handlePrevGroups}
                onRefresh={() => {
                    groupsTokenMap = [];
                    loadGroups();
                }}
            >
                {#snippet children(group: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {group.GroupName}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        {group.GroupId}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {group.Arn}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {group.CreateDate
                            ? new Date(group.CreateDate).toLocaleString()
                            : ""}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
    {#if activeTab === "roles"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={roles}
                {loading}
                columns={[
                    { label: "Role Name", key: "RoleName", sortable: true },
                    { label: "Role ID", key: "RoleId", sortable: true },
                    { label: "ARN", key: "Arn", sortable: true },
                    {
                        label: "Creation Date",
                        key: "CreateDate",
                        sortable: true,
                    },
                ]}
                hasNext={!!currentRolesToken}
                hasPrev={rolesTokenMap.length > 0}
                onNext={handleNextRoles}
                onPrev={handlePrevRoles}
                onRefresh={() => {
                    rolesTokenMap = [];
                    loadRoles();
                }}
            >
                {#snippet children(role: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {role.RoleName}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        {role.RoleId}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {role.Arn}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {role.CreateDate
                            ? new Date(role.CreateDate).toLocaleString()
                            : ""}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
    {#if activeTab === "policies"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={policies}
                {loading}
                columns={[
                    { label: "Policy Name", key: "PolicyName", sortable: true },
                    { label: "Policy ID", key: "PolicyId", sortable: true },
                    { label: "ARN", key: "Arn", sortable: true },
                    {
                        label: "Update Date",
                        key: "UpdateDate",
                        sortable: true,
                    },
                ]}
                hasNext={!!currentPoliciesToken}
                hasPrev={policiesTokenMap.length > 0}
                onNext={handleNextPolicies}
                onPrev={handlePrevPolicies}
                onRefresh={() => {
                    policiesTokenMap = [];
                    loadPolicies();
                }}
            >
                {#snippet children(policy: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {policy.PolicyName}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        {policy.PolicyId}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {policy.Arn}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-400"
                    >
                        {policy.UpdateDate
                            ? new Date(policy.UpdateDate).toLocaleString()
                            : ""}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
</ServiceLayout>
