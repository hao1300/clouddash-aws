<script lang="ts">
    import {
        DescribeTableCommand,
        ScanCommand,
        QueryCommand,
        PutItemCommand,
        DeleteItemCommand,
    } from "@aws-sdk/client-dynamodb";
    import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";

    let tableName = $derived($page.url.searchParams.get("name") || "");

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);

    let tableSchema = $state<any>(null);
    let results = $state<any[]>([]);
    let resultTokenMap = $state<Record<string, any>[]>([]);
    let resultCurrentToken = $state<Record<string, any> | undefined>(undefined);

    let exploreMode = $state<"scan" | "query">("scan");

    // Scan params
    let scanFilter = $state("");
    let scanValues = $state("");
    let scanLimit = $state(25);
    let scanConsistentRead = $state(false);

    // Query params
    let queryKeyCond = $state("");
    let queryNames = $state<Record<string, string>>({});
    let queryFilter = $state("");
    let queryValues = $state("");
    let queryIndex = $state("");
    let queryLimit = $state(25);
    let queryConsistentRead = $state(false);
    let queryScanIndexForward = $state(true);

    // Query Input Helpers
    let partitionKeyInput = $state("");
    let sortKeyOp = $state("=");
    let sortKeyInput = $state("");
    let sortKeyInput2 = $state("");

    // Item Editor
    let showItemEditor = $state(false);
    let itemEditorMode = $state<"create" | "edit">("create");
    let itemEditorJson = $state("");
    let itemEditorLoading = $state(false);
    let itemToDelete = $state<any>(null);
    let deleteItemLoading = $state(false);
    let viewingItem = $state<any>(null);

    $effect(() => {
        if (aws.dynamodb && tableName) {
            loadSchema();
        }
    });

    // Auto-build query condition
    $effect(() => {
        if (exploreMode === "query" && tableSchema) {
            let pkName = "",
                skName = "";
            let schemaRef = tableSchema.KeySchema;

            if (queryIndex) {
                const idx = tableSchema.GlobalSecondaryIndexes?.find(
                    (i: any) => i.IndexName === queryIndex,
                );
                if (idx) schemaRef = idx.KeySchema;
            }

            const pk = schemaRef?.find((k: any) => k.KeyType === "HASH");
            const sk = schemaRef?.find((k: any) => k.KeyType === "RANGE");
            if (pk) pkName = pk.AttributeName;
            if (sk) skName = sk.AttributeName;

            let condition = "";
            let vals: Record<string, any> = {};
            let names: Record<string, string> = {};

            if (pkName && partitionKeyInput) {
                names["#pk"] = pkName;
                condition = `#pk = :pk`;
                vals[":pk"] = partitionKeyInput;
            }

            if (skName && sortKeyInput) {
                names["#sk"] = skName;
                if (sortKeyOp === "between") {
                    if (sortKeyInput2) {
                        condition += ` AND #sk BETWEEN :sk AND :sk2`;
                        vals[":sk"] = sortKeyInput;
                        vals[":sk2"] = sortKeyInput2;
                    }
                } else if (sortKeyOp === "begins_with") {
                    condition += ` AND begins_with(#sk, :sk)`;
                    vals[":sk"] = sortKeyInput;
                } else {
                    condition += ` AND #sk ${sortKeyOp} :sk`;
                    vals[":sk"] = sortKeyInput;
                }
            }

            queryKeyCond = condition;
            queryNames = names;
            queryValues = Object.keys(vals).length
                ? JSON.stringify(vals, null, 2)
                : "";
        }
    });

    async function loadSchema() {
        if (!aws.dynamodb || !tableName) return;
        const resp = await aws.dynamodb.send(
            new DescribeTableCommand({ TableName: tableName }),
        );
        tableSchema = resp.Table;
    }

    function marshalValues(obj: Record<string, any>): Record<string, any> {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
            if (typeof v === "string") out[k] = { S: v };
            else if (typeof v === "number") out[k] = { N: String(v) };
            else if (typeof v === "boolean") out[k] = { BOOL: v };
            else if (v === null) out[k] = { NULL: true };
            else out[k] = { S: JSON.stringify(v) };
        }
        return out;
    }

    async function runScan(token?: Record<string, any>) {
        if (!aws.dynamodb || !tableName) return;
        try {
            if (!token) {
                resultTokenMap = [];
                results = [];
            }
            loading = true;
            error = "";
            actionMsg = "";
            let exprVals: Record<string, any> | undefined;
            if (scanValues.trim()) {
                const parsed = JSON.parse(scanValues);
                if (Object.keys(parsed).length) exprVals = marshalValues(parsed);
            }

            const resp = await aws.dynamodb.send(
                new ScanCommand({
                    TableName: tableName,
                    Limit: scanLimit,
                    ConsistentRead: scanConsistentRead,
                    FilterExpression: scanFilter || undefined,
                    ExpressionAttributeValues: exprVals,
                    ExclusiveStartKey: token,
                }),
            );
            results = (resp.Items ?? []).map((i) => unmarshall(i));
            if (
                !token ||
                JSON.stringify(resultTokenMap[resultTokenMap.length - 1]) !==
                    JSON.stringify(resp.LastEvaluatedKey)
            ) {
                if (resp.LastEvaluatedKey)
                    resultTokenMap.push(resp.LastEvaluatedKey);
            }
            resultCurrentToken = resp.LastEvaluatedKey;
            if (results.length === 0)
                actionMsg = "Scan completed. No results found.";
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function runQuery(token?: Record<string, any>) {
        if (!aws.dynamodb || !tableName || !queryKeyCond) return;
        try {
            if (!token) {
                resultTokenMap = [];
                results = [];
            }
            loading = true;
            error = "";
            actionMsg = "";
            let exprVals: Record<string, any> | undefined;
            if (queryValues.trim()) {
                const parsed = JSON.parse(queryValues);
                if (Object.keys(parsed).length) exprVals = marshalValues(parsed);
            }

            let consistentRead = queryConsistentRead;
            if (queryIndex) {
                const isGsi = tableSchema?.GlobalSecondaryIndexes?.some(
                    (i: any) => i.IndexName === queryIndex,
                );
                if (isGsi) consistentRead = false;
            }

            const resp = await aws.dynamodb.send(
                new QueryCommand({
                    TableName: tableName,
                    KeyConditionExpression: queryKeyCond,
                    FilterExpression: queryFilter || undefined,
                    IndexName: queryIndex || undefined,
                    ExpressionAttributeNames: Object.keys(queryNames).length
                        ? queryNames
                        : undefined,
                    ExpressionAttributeValues: exprVals,
                    ExclusiveStartKey: token,
                    Limit: queryLimit,
                    ConsistentRead: consistentRead,
                    ScanIndexForward: queryScanIndexForward,
                }),
            );
            results = (resp.Items ?? []).map((i) => unmarshall(i));
            if (
                !token ||
                JSON.stringify(resultTokenMap[resultTokenMap.length - 1]) !==
                    JSON.stringify(resp.LastEvaluatedKey)
            ) {
                if (resp.LastEvaluatedKey)
                    resultTokenMap.push(resp.LastEvaluatedKey);
            }
            resultCurrentToken = resp.LastEvaluatedKey;
            if (results.length === 0)
                actionMsg = "Query completed. No results found.";
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    function startCreateItem() {
        if (!tableSchema) return;
        const pk = tableSchema.KeySchema?.find(
            (k: any) => k.KeyType === "HASH",
        )?.AttributeName;
        const sk = tableSchema.KeySchema?.find(
            (k: any) => k.KeyType === "RANGE",
        )?.AttributeName;
        const template: any = {};
        if (pk) template[pk] = "";
        if (sk) template[sk] = "";
        itemEditorJson = JSON.stringify(template, null, 2);
        itemEditorMode = "create";
        showItemEditor = true;
    }

    async function handleSaveItem() {
        if (!aws.dynamodb || !tableName || !itemEditorJson.trim()) return;
        try {
            itemEditorLoading = true;
            const parsed = JSON.parse(itemEditorJson);
            const marshalled = marshall(parsed, {
                removeUndefinedValues: true,
                convertEmptyValues: true,
            });
            await aws.dynamodb.send(
                new PutItemCommand({ TableName: tableName, Item: marshalled }),
            );
            actionMsg = `Successfully saved item.`;
            showItemEditor = false;
            exploreMode === "scan" ? runScan() : runQuery();
        } catch (e) {
            error = String(e);
        } finally {
            itemEditorLoading = false;
        }
    }

    async function confirmDeleteItem() {
        if (!aws.dynamodb || !tableName || !itemToDelete || !tableSchema)
            return;
        try {
            deleteItemLoading = true;
            const pk = tableSchema.KeySchema?.find(
                (k: any) => k.KeyType === "HASH",
            )?.AttributeName;
            const sk = tableSchema.KeySchema?.find(
                (k: any) => k.KeyType === "RANGE",
            )?.AttributeName;
            const key: any = {};
            if (pk && itemToDelete[pk] !== undefined) key[pk] = itemToDelete[pk];
            if (sk && itemToDelete[sk] !== undefined) key[sk] = itemToDelete[sk];
            await aws.dynamodb.send(
                new DeleteItemCommand({
                    TableName: tableName,
                    Key: marshall(key),
                }),
            );
            actionMsg = `Successfully deleted item.`;
            itemToDelete = null;
            exploreMode === "scan" ? runScan() : runQuery();
        } catch (e) {
            error = String(e);
        } finally {
            deleteItemLoading = false;
        }
    }

    let allColumns = $derived(
        [...new Set(results.flatMap((r) => Object.keys(r)))].map((k) => ({
            key: k,
            label: k,
            format: (val: any) =>
                typeof val === "object" ? JSON.stringify(val) : String(val ?? ""),
        })),
    );
</script>

<div class="h-full flex flex-col p-4 bg-gray-950 overflow-hidden relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}
    {#if actionMsg}<div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30"
        >
            {actionMsg}
        </div>{/if}

    <div
        class="space-y-3 mb-4 shrink-0 bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm {error ||
        actionMsg
            ? 'mt-8'
            : ''}"
    >
        <div class="flex items-center gap-4 mb-2 pb-2 border-b border-gray-800">
            <span class="text-sm font-medium text-gray-300">Operation:</span>
            <label
                class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-gray-200"
            >
                <input
                    type="radio"
                    value="scan"
                    bind:group={exploreMode}
                    class="accent-blue-500"
                /> Scan
            </label>
            <label
                class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-gray-200"
            >
                <input
                    type="radio"
                    value="query"
                    bind:group={exploreMode}
                    class="accent-blue-500"
                /> Query
            </label>
        </div>

        {#if exploreMode === "scan"}
            <div class="flex gap-2">
                <div
                    class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-400 font-mono flex items-center"
                >
                    <span
                        >Table: <strong class="text-blue-300">{tableName}</strong
                        ></span
                    >
                </div>
                <button
                    onclick={() => runScan()}
                    disabled={loading}
                    class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2 rounded text-xs font-bold transition flex items-center gap-2"
                >
                    {#if loading}<span class="animate-spin">⟳</span>{/if} Run
                    Scan
                </button>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <input
                    bind:value={scanFilter}
                    placeholder="Filter expression"
                    class="bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                />
                <input
                    bind:value={scanValues}
                    placeholder='Expression JSON (e.g. {":status": "active"})'
                    class="bg-black font-mono text-xs p-2 rounded border border-gray-700 text-green-400 outline-none focus:border-blue-500"
                />
            </div>
        {:else}
            <div class="flex gap-2">
                <div
                    class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-400 font-mono flex items-center"
                >
                    <span
                        >Table: <strong class="text-blue-300">{tableName}</strong
                        ></span
                    >
                </div>
                <select
                    bind:value={queryIndex}
                    class="w-48 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                >
                    <option value="">[Base Table]</option>
                    {#each tableSchema?.GlobalSecondaryIndexes || [] as idx}
                        <option value={idx.IndexName}>{idx.IndexName}</option>
                    {/each}
                </select>
                <button
                    onclick={() => runQuery()}
                    disabled={loading || !queryKeyCond}
                    class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2 rounded text-xs font-bold transition flex items-center gap-2"
                >
                    {#if loading}<span class="animate-spin">⟳</span>{/if} Run
                    Query
                </button>
            </div>
            <div
                class="flex gap-4 items-center bg-gray-950 p-3 rounded border border-gray-800"
            >
                <div class="text-xs font-bold text-gray-400 w-24">Key Values:</div>
                <div class="flex-1 flex gap-2">
                    <div class="flex-1">
                        <input
                            bind:value={partitionKeyInput}
                            placeholder="Partition Key Value"
                            class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                        />
                    </div>
                    <div class="flex-1 flex gap-1">
                        <select
                            bind:value={sortKeyOp}
                            class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                        >
                            <option value="=">=</option><option value="<"
                                >&lt;</option
                            ><option value="<=">&lt;=</option><option value=">"
                                >&gt;</option
                            ><option value=">=">&gt;=</option><option
                                value="between">BETWEEN</option
                            ><option value="begins_with">BEGINS</option>
                        </select>
                        <input
                            bind:value={sortKeyInput}
                            placeholder="Sort Key Value"
                            class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                        />
                        {#if sortKeyOp === "between"}<input
                                bind:value={sortKeyInput2}
                                placeholder="Value 2"
                                class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                            />{/if}
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <div
        class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 flex flex-col shadow-sm overflow-hidden"
    >
        <PaginatedTable
            items={results}
            {loading}
            hasNext={!!resultCurrentToken}
            hasPrev={resultTokenMap.length > 1}
            onNext={() =>
                exploreMode === "scan"
                    ? runScan(resultCurrentToken)
                    : runQuery(resultCurrentToken)}
            onPrev={() => {
                resultTokenMap.pop();
                const prevToken = resultTokenMap[resultTokenMap.length - 1];
                exploreMode === "scan" ? runScan(prevToken) : runQuery(prevToken);
            }}
            onRefresh={() => {
                resultTokenMap = [];
                exploreMode === "scan" ? runScan() : runQuery();
            }}
            columns={allColumns}
        >
            {#snippet headerActionsSnippet()}
                <button
                    onclick={startCreateItem}
                    class="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-xs font-bold transition"
                    >+ Create Item</button
                >
            {/snippet}
            {#snippet actionsSnippet(item)}
                <div class="flex gap-1 justify-end">
                    <button
                        onclick={() => (viewingItem = item)}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                        >View</button
                    >
                    <button
                        onclick={() => {
                            itemEditorJson = JSON.stringify(item, null, 2);
                            itemEditorMode = "edit";
                            showItemEditor = true;
                        }}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                        >Edit</button
                    >
                    <button
                        onclick={() => (itemToDelete = item)}
                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                        >Delete</button
                    >
                </div>
            {/snippet}
        </PaginatedTable>
    </div>
</div>

<Modal
    bind:open={showItemEditor}
    title={itemEditorMode === "create" ? "Create Item" : "Edit Item"}
    size="lg"
>
    <div class="flex flex-col h-[60vh]">
        <p class="text-xs text-gray-400 mb-2">
            Edit item JSON. Types are auto-inferred.
        </p>
        <textarea
            bind:value={itemEditorJson}
            class="flex-1 w-full bg-black font-mono text-xs p-3 rounded border border-gray-700 text-green-400 outline-none focus:border-blue-500 resize-none"
        ></textarea>
        <div class="flex justify-end gap-2 mt-4 shrink-0">
            <button
                onclick={() => (showItemEditor = false)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={handleSaveItem}
                disabled={itemEditorLoading}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if itemEditorLoading}<span class="animate-spin">⟳</span>{/if}
                Save
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={!!itemToDelete} title="Delete Item">
    <div class="space-y-4">
        <p class="text-sm text-gray-300">
            Delete this item? This cannot be undone.
        </p>
        <div class="flex justify-end gap-2 mt-4">
            <button
                onclick={() => (itemToDelete = null)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={confirmDeleteItem}
                disabled={deleteItemLoading}
                class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if deleteItemLoading}<span class="animate-spin">⟳</span>{/if}
                Delete
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={!!viewingItem} title="Item Details" size="lg">
    <div class="bg-black/50 p-4 rounded min-h-[40vh] overflow-auto">
        <pre class="text-xs text-green-400 font-mono whitespace-pre-wrap">{JSON.stringify(
                viewingItem,
                null,
                2,
            )}</pre>
    </div>
    <div class="flex justify-end mt-4">
        <button
            onclick={() => (viewingItem = null)}
            class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded text-sm transition"
            >Close</button
        >
    </div>
</Modal>
