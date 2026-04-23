<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import { ListUsersCommand, type User } from "@aws-sdk/client-iam";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let users = $state<User[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

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
</div>
</div>
</div>
