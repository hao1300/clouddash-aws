<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import { ListGroupsCommand, type Group } from "@aws-sdk/client-iam";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let groups = $state<Group[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    let __initLoaded = false;
    $effect(() => {
        if (aws.iam && !__initLoaded) {
            __initLoaded = true;
            loadGroups();
        }
    });

    async function loadGroups(token?: string) {
        if (!aws.iam) return;
        try {
            loading = true;
            error = "";
            const res = await aws.iam.send(
                new ListGroupsCommand({ MaxItems: 50, Marker: token }),
            );
            groups = res.Groups || [];
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
    activeTab="groups"
/>
<div class="flex-1 overflow-hidden relative">
<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={groups}
        {loading}
        onRefresh={() => {
            history = [];
            loadGroups();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadGroups(marker)}
        onPrev={() => {
            history.pop();
            loadGroups(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Group Name",
                key: "GroupName",
                onClick: (item) => goto(`/iam/groups/${item.GroupName}`)
            },
            { label: "Group ID", key: "GroupId" },
            { label: "ARN", key: "Arn" },
            {
                label: "Creation Date",
                key: "CreateDate",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
        ]}
    />
</div>
</div>
</div>
