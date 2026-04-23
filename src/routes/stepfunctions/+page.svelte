<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiCircle } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    import {
        ListStateMachinesCommand,
        type StateMachineListItem,
    } from "@aws-sdk/client-sfn";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let stateMachines = $state<StateMachineListItem[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    let __initLoaded = false;
    $effect(() => {
        if (aws.sfn && !__initLoaded) {
            __initLoaded = true;
            loadStateMachines();
        }
    });

    async function loadStateMachines(token?: string) {
        if (!aws.sfn) return;
        try {
            loading = true;
            error = "";
            const res = await aws.sfn.send(
                new ListStateMachinesCommand({
                    maxResults: 50,
                    nextToken: token,
                }),
            );
            stateMachines = res.stateMachines || [];
            if (token) history.push(token);
            marker = res.nextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleSelectSM(sm: StateMachineListItem) {
        goto(`/stepfunctions/details?id=${sm.stateMachineArn}`);
    }
</script>

{#snippet typeCell(v: string)}
    <div class="flex items-center gap-1.5">
        <Icon
            path={mdiCircle}
            size={10}
            color={v === "STANDARD" ? COLORS.INFO : COLORS.WARNING}
        />
        <span class="capitalize">{v.toLowerCase()}</span>
    </div>
{/snippet}


<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={stateMachines}
        {loading}
        onRefresh={() => {
            history = [];
            loadStateMachines();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadStateMachines(marker)}
        onPrev={() => {
            history.pop();
            loadStateMachines(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Name",
                key: "name",
                onClick: (item) => handleSelectSM(item),
            },
            {
                label: "Type",
                key: "type",
                format: (v) =>
                    v === "STANDARD" ? "Standard" : "Express"
,
            },
            {
                label: "Creation Date",
                key: "creationDate",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
        ]}
    />
</div>
