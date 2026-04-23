<script lang="ts">
    import { ListRolesCommand, type Role } from "@aws-sdk/client-iam";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let roles = $state<Role[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    let __initLoaded = false;
    $effect(() => {
        if (aws.iam && !__initLoaded) {
            __initLoaded = true;
            loadRoles();
        }
    });

    async function loadRoles(token?: string) {
        if (!aws.iam) return;
        try {
            loading = true;
            error = "";
            const res = await aws.iam.send(
                new ListRolesCommand({ MaxItems: 50, Marker: token }),
            );
            roles = res.Roles || [];
            if (token) history.push(token);
            marker = res.Marker;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={roles}
        {loading}
        onRefresh={() => {
            history = [];
            loadRoles();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadRoles(marker)}
        onPrev={() => {
            history.pop();
            loadRoles(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Role Name",
                key: "RoleName",
                onClick: (item) => goto(`/iam/roles/${item.RoleName}`)
            },
            {
                label: "Creation Date",
                key: "CreateDate",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
            { label: "Role ID", key: "RoleId" },
            { label: "ARN", key: "Arn" },
        ]}
    />
</div>
