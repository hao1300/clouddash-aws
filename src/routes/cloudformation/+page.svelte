<script lang="ts">
    import {
        DescribeStacksCommand,
        type Stack,
    } from "@aws-sdk/client-cloudformation";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let stacks = $state<Stack[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    $effect(() => {
        if (aws.cloudFormation && stacks.length === 0) {
            loadStacks();
        }
    });

    async function loadStacks(token?: string) {
        if (!aws.cloudFormation) return;
        try {
            loading = true;
            error = "";
            const res = await aws.cloudFormation.send(
                new DescribeStacksCommand({ NextToken: token }),
            );
            stacks = res.Stacks || [];
            if (token) history.push(token);
            marker = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleSelectStack(stack: Stack) {
        goto(`/cloudformation/${stack.StackName}`);
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={stacks}
        {loading}
        onRefresh={() => {
            history = [];
            loadStacks();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadStacks(marker)}
        onPrev={() => {
            history.pop();
            loadStacks(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Stack Name",
                key: "StackName",
                onClick: (item) => handleSelectStack(item),
            },
            {
                label: "Status",
                key: "StackStatus",
                format: (v) =>
                    v?.includes("COMPLETE")
                        ? "🟢 " + v
                        : v?.includes("FAILED")
                          ? "🔴 " + v
                          : "🟡 " + v,
            },
            {
                label: "Creation Time",
                key: "CreationTime",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
            { label: "Description", key: "Description" },
        ]}
    />
</div>
