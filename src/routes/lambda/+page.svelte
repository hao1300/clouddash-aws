<script lang="ts">
    import {
        ListFunctionsCommand,
        type FunctionConfiguration,
    } from "@aws-sdk/client-lambda";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let functions = $state<FunctionConfiguration[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    let __initLoaded = false;
    $effect(() => {
        if (aws.lambda && !__initLoaded) {
            __initLoaded = true;
            loadFunctions();
        }
    });

    async function loadFunctions(token?: string) {
        if (!aws.lambda) return;
        try {
            loading = true;
            error = "";
            const res = await aws.lambda.send(
                new ListFunctionsCommand({ MaxItems: 50, Marker: token }),
            );
            functions = res.Functions || [];
            if (token) history.push(token);
            marker = res.NextMarker;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleSelectFn(fn: FunctionConfiguration) {
        goto(`/lambda/function/${fn.FunctionName}`);
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={functions}
        {loading}
        onRefresh={() => {
            history = [];
            loadFunctions();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadFunctions(marker)}
        onPrev={() => {
            history.pop();
            loadFunctions(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Function Name",
                key: "FunctionName",
                onClick: (item) => handleSelectFn(item),
            },
            {
                label: "Last Modified",
                key: "LastModified",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
            { label: "Runtime", key: "Runtime" },
            { label: "Memory (MB)", key: "MemorySize" },
        ]}
    />
</div>
