<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import { ListUsersCommand, type User } from "@aws-sdk/client-iam";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";
    import CreateUserModal from "$lib/components/iam/CreateUserModal.svelte";

    let users = $state<User[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);
    let showCreateModal = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.iam && !__initLoaded) {
            __initLoaded = true;
            loadUsers();
        }
    });

    async function loadUsers(token?: string) {
        if (!aws.iam) return;
        try {
            loading = true;
            error = "";
            const res = await aws.iam.send(
                new ListUsersCommand({ MaxItems: 50, Marker: token }),
            );
            users = res.Users || [];
            if (token) history.push(token);
            marker = res.Marker;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>
<div class="h-full flex flex-col overflow-hidden">
<TabBar
    tabs={[
        { id: "users", label: "Users", href: "/iam/users" },
        { id: "groups", label: "Groups", href: "/iam/groups" },
        { id: "roles", label: "Roles", href: "/iam/roles" },
        { id: "policies", label: "Policies", href: "/iam/policies" },
    ]}
    activeTab="users"
/>
<div class="flex-1 overflow-hidden relative">
<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div class="px-6 py-3 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center shrink-0 {error ? 'mt-8' : ''}">
        <h2 class="text-sm font-bold text-gray-300 uppercase tracking-widest">IAM Users</h2>
        <button onclick={() => showCreateModal = true} class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow-sm">
            Create User
        </button>
    </div>

    <PaginatedTable
        items={users}
        {loading}
        onRefresh={() => {
            history = [];
            loadUsers();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadUsers(marker)}
        onPrev={() => {
            history.pop();
            loadUsers(history[history.length - 1]);
        }}
        columns={[
            {
                label: "User Name",
                key: "UserName",
                onClick: (item) => goto(`/iam/users/${item.UserName}`)
            },
            {
                label: "Creation Date",
                key: "CreateDate",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
            { label: "User ID", key: "UserId" },
            { label: "ARN", key: "Arn" },
        ]}
    />
    <CreateUserModal bind:show={showCreateModal} onSaved={() => { history = []; loadUsers(); }} />
</div>
</div>
</div>
