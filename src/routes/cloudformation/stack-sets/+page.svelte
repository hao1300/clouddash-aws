<script lang="ts">
    import {
        DescribeStackSetCommand,
        ListStackSetsCommand,
        type StackSetSummary,
    } from "@aws-sdk/client-cloudformation";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let stackSets = $state<StackSetSummary[]>([]);
    let loading = $state(false);
    let error = $state("");

    $effect(() => {
        if (aws.cloudFormation && stackSets.length === 0) {
            loadStackSets();
        }
    });

    async function loadStackSets() {
        if (!aws.cloudFormation) return;
        try {
            loading = true;
            error = "";
            const res = await aws.cloudFormation.send(
                new ListStackSetsCommand({}),
            );
            stackSets = res.Summaries || [];
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
        items={stackSets}
        {loading}
        onRefresh={loadStackSets}
        columns={[
            { label: "Name", key: "StackSetName" },
            { label: "ID", key: "StackSetId" },
            { label: "Status", key: "Status" },
            { label: "Description", key: "Description" },
        ]}
    />
</div>
