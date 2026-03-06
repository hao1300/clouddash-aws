<script lang="ts">
    import {
        ListExportsCommand,
        type Export,
    } from "@aws-sdk/client-cloudformation";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let exports = $state<Export[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    $effect(() => {
        if (aws.cf && exports.length === 0) {
            loadExports();
        }
    });

    async function loadExports(token?: string) {
        if (!aws.cf) return;
        try {
            loading = true;
            error = "";
            const res = await aws.cf.send(
                new ListExportsCommand({ NextToken: token }),
            );
            exports = res.Exports || [];
            if (token) history.push(token);
            marker = res.NextToken;
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
        items={exports}
        {loading}
        onRefresh={() => {
            history = [];
            loadExports();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadExports(marker)}
        onPrev={() => {
            history.pop();
            loadExports(history[history.length - 1]);
        }}
        columns={[
            { label: "Export Name", key: "Name" },
            { label: "Value", key: "Value" },
            { label: "Stack ID", key: "ExportingStackId" },
        ]}
    />
</div>
