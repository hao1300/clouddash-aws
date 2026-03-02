<script lang="ts">
    import { onMount } from "svelte";
    import {
        DynamoDBClient,
        ListTablesCommand,
        DescribeTableCommand,
        ScanCommand,
        QueryCommand,
        CreateTableCommand,
        DeleteTableCommand,
        PutItemCommand,
        DeleteItemCommand,
    } from "@aws-sdk/client-dynamodb";
    import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: DynamoDBClient | null = $state(null);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "tables", label: "Tables" },
        { id: "explore", label: "Explore Items" },
    ];
    let activeTab = $state("tables");

    // --- Explore Items Mode ---
    let exploreMode = $state<"scan" | "query">("scan");

    // --- Modals State ---
    let showCreateTable = $state(false);
    let newTableName = $state("");
    let newPkName = $state("");
    let newPkType = $state("S");
    let hasSk = $state(false);
    let newSkName = $state("");
    let newSkType = $state("S");
    let billingMode = $state("PAY_PER_REQUEST");
    let createTableLoading = $state(false);

    let tableToDelete = $state<string | null>(null);
    let deleteTableLoading = $state(false);

    let showItemEditor = $state(false);
    let itemEditorMode = $state<"create" | "edit">("create");
    let itemEditorJson = $state("");
    let itemEditorLoading = $state(false);

    let itemToDelete = $state<any>(null);
    let deleteItemLoading = $state(false);

    // --- Item Details Modal ---
    let viewingItem = $state<any>(null);

    // --- Pagination Shared Helpers ---
    function pushToken(history: any[], currentNextToken?: any) {
        if (!currentNextToken) return;
        // Compare stringified JSON for DynamoDB LastEvaluatedKey
        if (
            JSON.stringify(history[history.length - 1]) !==
            JSON.stringify(currentNextToken)
        ) {
            history.push(currentNextToken);
        }
    }
    function popToken(history: any[]) {
        history.pop(); // discard current
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    // --- Tables ---
    let tables = $state<any[]>([]);
    let tablesLoading = $state(false);
    let tablesTokenMap = $state<string[]>([]);
    let tablesCurrentToken = $state<string | undefined>(undefined);
    let tableSchemas = $state<Record<string, any>>({});

    // --- Scan / Query shared ---
    let tableName = $state("");
    let results = $state<any[]>([]);
    let resultLoading = $state(false);
    let resultTokenMap = $state<Record<string, any>[]>([]);
    let resultCurrentToken = $state<Record<string, any> | undefined>(undefined);

    // Scan params
    let scanFilter = $state("");
    let scanValues = $state(""); // Changed to string for input

    // Query params
    let queryKeyCond = $state("");
    let queryNames = $state<Record<string, string>>({});
    let queryFilter = $state("");
    let queryValues = $state("");
    let queryIndex = $state("");

    // Schema UI Helpers
    let partitionKeyInput = $state("");
    let sortKeyOp = $state("=");
    let sortKeyInput = $state("");
    let sortKeyInput2 = $state(""); // for BETWEEN
    let activeSchema = $derived(tableSchemas[tableName] || null);

    // Watchers for keys
    $effect(() => {
        if (activeTab === "explore" && exploreMode === "query" && activeSchema) {
            let pkName = "",
                skName = "";
            let schemaRef = activeSchema.KeySchema;

            // if index selected, use its schema
            if (queryIndex) {
                const idx = activeSchema.GlobalSecondaryIndexes?.find(
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

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new DynamoDBClient({
                region: creds.region || "us-east-1",
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            });
            await loadTables();
        } catch (e) {
            error = e as string;
        }
    });

    // --- Mutating Operations ---
    async function handleCreateTable() {
        if (!client || !newTableName || !newPkName) return;
        try {
            createTableLoading = true;
            error = "";
            actionMsg = "";

            const AttributeDefinitions = [
                { AttributeName: newPkName, AttributeType: newPkType },
            ];
            const KeySchema = [
                { AttributeName: newPkName, KeyType: "HASH" },
            ];

            if (hasSk && newSkName) {
                AttributeDefinitions.push({ AttributeName: newSkName, AttributeType: newSkType });
                KeySchema.push({ AttributeName: newSkName, KeyType: "RANGE" });
            }

            const input: any = {
                TableName: newTableName,
                AttributeDefinitions,
                KeySchema,
                BillingMode: billingMode,
            };

            if (billingMode === "PROVISIONED") {
                input.ProvisionedThroughput = {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5,
                };
            }

            await client.send(new CreateTableCommand(input));
            actionMsg = `Successfully requested creation of table ${newTableName}.`;
            showCreateTable = false;
            // Reset state
            newTableName = "";
            newPkName = "";
            newPkType = "S";
            hasSk = false;
            newSkName = "";
            newSkType = "S";
            billingMode = "PAY_PER_REQUEST";
            loadTables();
        } catch (e) {
            error = String(e);
        } finally {
            createTableLoading = false;
        }
    }

    async function confirmDeleteTable() {
        if (!client || !tableToDelete) return;
        try {
            deleteTableLoading = true;
            error = "";
            actionMsg = "";
            await client.send(new DeleteTableCommand({ TableName: tableToDelete }));
            actionMsg = `Successfully deleted table ${tableToDelete}.`;
            tableToDelete = null;
            tablesTokenMap = [];
            loadTables();
        } catch (e) {
            error = String(e);
        } finally {
            deleteTableLoading = false;
        }
    }

    function startCreateItem() {
        if (!activeSchema) return;
        const pk = activeSchema.KeySchema?.find((k: any) => k.KeyType === "HASH")?.AttributeName;
        const sk = activeSchema.KeySchema?.find((k: any) => k.KeyType === "RANGE")?.AttributeName;

        const template: any = {};
        if (pk) template[pk] = "";
        if (sk) template[sk] = "";

        itemEditorJson = JSON.stringify(template, null, 2);
        itemEditorMode = "create";
        showItemEditor = true;
    }

    function startEditItem(item: any) {
        itemEditorJson = JSON.stringify(item, null, 2);
        itemEditorMode = "edit";
        showItemEditor = true;
    }

    async function handleSaveItem() {
        if (!client || !tableName || !itemEditorJson.trim()) return;
        try {
            itemEditorLoading = true;
            error = "";
            actionMsg = "";
            const parsed = JSON.parse(itemEditorJson);
            const marshalled = marshall(parsed, { removeUndefinedValues: true, convertEmptyValues: true });
            await client.send(new PutItemCommand({
                TableName: tableName,
                Item: marshalled
            }));
            actionMsg = `Successfully saved item.`;
            showItemEditor = false;
            exploreMode === "scan" ? runScan(resultCurrentToken) : runQuery(resultCurrentToken);
        } catch (e) {
            error = String(e);
        } finally {
            itemEditorLoading = false;
        }
    }

    async function confirmDeleteItem() {
        if (!client || !tableName || !itemToDelete || !activeSchema) return;
        try {
            deleteItemLoading = true;
            error = "";
            actionMsg = "";
            const pk = activeSchema.KeySchema?.find((k: any) => k.KeyType === "HASH")?.AttributeName;
            const sk = activeSchema.KeySchema?.find((k: any) => k.KeyType === "RANGE")?.AttributeName;

            const key: any = {};
            if (pk && itemToDelete[pk] !== undefined) {
                key[pk] = itemToDelete[pk];
            }
            if (sk && itemToDelete[sk] !== undefined) {
                key[sk] = itemToDelete[sk];
            }

            await client.send(new DeleteItemCommand({
                TableName: tableName,
                Key: marshall(key)
            }));
            actionMsg = `Successfully deleted item.`;
            itemToDelete = null;
            exploreMode === "scan" ? runScan(resultCurrentToken) : runQuery(resultCurrentToken);
        } catch (e) {
            error = String(e);
        } finally {
            deleteItemLoading = false;
        }
    }

    // --- Tables API ---
    async function loadTables(token?: string) {
        if (!client) return;
        try {
            tablesLoading = true;
            error = "";
            actionMsg = "";
            const resp = await client.send(
                new ListTablesCommand({
                    Limit: 100,
                    ExclusiveStartTableName: token,
                }),
            );
            const names = resp.TableNames ?? [];
            const details: any[] = [];
            for (const name of names) {
                try {
                    const desc = await client.send(
                        new DescribeTableCommand({ TableName: name }),
                    );
                    const t = desc.Table;
                    if (t) {
                        tableSchemas[t.TableName ?? name] = t;
                        details.push({
                            name: t.TableName ?? name,
                            status: t.TableStatus ?? "UNKNOWN",
                            item_count: t.ItemCount ?? 0,
                            size_bytes: t.TableSizeBytes ?? 0,
                        });
                    }
                } catch {
                    details.push({
                        name,
                        status: "ERROR",
                        item_count: 0,
                        size_bytes: 0,
                    });
                }
            }
            tables = details;
            pushToken(tablesTokenMap, resp.LastEvaluatedTableName);
            tablesCurrentToken = resp.LastEvaluatedTableName;
        } catch (e) {
            error = String(e);
        } finally {
            tablesLoading = false;
        }
    }

    // --- Scan API ---
    async function runScan(token?: Record<string, any>) {
        if (!client || !tableName) return;
        try {
            if (!token) {
                resultTokenMap = [];
                results = [];
            }
            resultLoading = true;
            error = "";
            actionMsg = "";
            let exprVals: Record<string, any> | undefined;
            if (scanValues.trim()) {
                const parsed = JSON.parse(scanValues);
                if (Object.keys(parsed).length)
                    exprVals = marshalValues(parsed);
            }

            const resp = await client.send(
                new ScanCommand({
                    TableName: tableName,
                    Limit: 25,
                    FilterExpression: scanFilter || undefined,
                    ExpressionAttributeValues: exprVals,
                    ExclusiveStartKey: token,
                }),
            );
            results = (resp.Items ?? []).map((i) => unmarshall(i));
            pushToken(resultTokenMap, resp.LastEvaluatedKey);
            resultCurrentToken = resp.LastEvaluatedKey;
            if (results.length === 0)
                actionMsg = "Scan completed. No results found.";
        } catch (e) {
            error = String(e);
        } finally {
            resultLoading = false;
        }
    }

    // --- Query API ---
    async function runQuery(token?: Record<string, any>) {
        if (!client || !tableName || !queryKeyCond) return;
        try {
            if (!token) {
                resultTokenMap = [];
                results = [];
            }
            resultLoading = true;
            error = "";
            actionMsg = "";
            let exprVals: Record<string, any> | undefined;
            if (queryValues.trim()) {
                const parsed = JSON.parse(queryValues);
                if (Object.keys(parsed).length)
                    exprVals = marshalValues(parsed);
            }

            const resp = await client.send(
                new QueryCommand({
                    TableName: tableName,
                    KeyConditionExpression: queryKeyCond,
                    FilterExpression: queryFilter || undefined,
                    IndexName: queryIndex || undefined,
                    ExpressionAttributeNames: Object.keys(queryNames).length ? queryNames : undefined,
                    ExpressionAttributeValues: exprVals,
                    ExclusiveStartKey: token,
                    Limit: 25,
                }),
            );
            results = (resp.Items ?? []).map((i) => unmarshall(i));
            pushToken(resultTokenMap, resp.LastEvaluatedKey);
            resultCurrentToken = resp.LastEvaluatedKey;
            if (results.length === 0)
                actionMsg = "Query completed. No results found.";
        } catch (e) {
            error = String(e);
        } finally {
            resultLoading = false;
        }
    }

    // Convert plain JSON values to DynamoDB AttributeValue format
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

    function formatBytes(b: number | string) {
        const num = Number(b);
        if (num === 0 || isNaN(num)) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(num) / Math.log(k));
        return parseFloat((num / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }

    let allColumns = $derived(
        [...new Set(results.flatMap((r) => Object.keys(r)))].map((k) => ({
            key: k,
            label: k,
            format: (val: any) =>
                typeof val === "object"
                    ? JSON.stringify(val)
                    : String(val ?? ""),
        })),
    );
</script>

<ServiceLayout title="DynamoDB" {tabs} bind:activeTab>
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

    <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
        {#if activeTab === "tables"}
            <PaginatedTable
                items={tables}
                loading={tablesLoading}
                hasNext={!!tablesCurrentToken}
                hasPrev={tablesTokenMap.length > 0}
                onNext={() => loadTables(tablesCurrentToken)}
                onPrev={() => loadTables(popToken(tablesTokenMap))}
                onRefresh={() => {
                    tablesTokenMap = [];
                    loadTables();
                }}
                columns={[
                    {
                        key: "name",
                        label: "Table Name",
                        onClick: (item) => {
                            tableName = item.name;
                            activeTab = "explore";
                            exploreMode = "scan";
                        },
                    },
                    {
                        key: "status",
                        label: "Status",
                        format: (v) =>
                            v === "ACTIVE" ? "🟢 ACTIVE" : `⚪ ${v}`,
                    },
                    {
                        key: "item_count",
                        label: "Item Count",
                        format: (v) => Number(v).toLocaleString(),
                    },
                    { key: "size_bytes", label: "Size", format: formatBytes },
                ]}
            >
                {#snippet headerActionsSnippet()}
                    <button
                        onclick={() => showCreateTable = true}
                        class="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1"
                    >
                        + Create Table
                    </button>
                {/snippet}
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={() => {
                            tableName = item.name;
                            activeTab = "explore";
                            exploreMode = "scan";
                        }}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                        >Scan</button
                    >
                    <button
                        onclick={() => {
                            tableName = item.name;
                            activeTab = "explore";
                            exploreMode = "query";
                        }}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition ml-1"
                        >Query</button
                    >
                    <button
                        onclick={() => tableToDelete = item.name}
                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition ml-1"
                        >Delete</button
                    >
                {/snippet}
            </PaginatedTable>
        {:else if activeTab === "explore"}
            <div class="h-full flex flex-col p-4 pr-1 bg-gray-950">
                <div
                    class="space-y-3 mb-4 shrink-0 bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                >
                    <div class="flex items-center gap-4 mb-2 pb-2 border-b border-gray-800">
                        <span class="text-sm font-medium text-gray-300">Operation:</span>
                        <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-gray-200">
                            <input type="radio" name="exploreMode" value="scan" bind:group={exploreMode} class="accent-blue-500" />
                            Scan
                        </label>
                        <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-gray-200">
                            <input type="radio" name="exploreMode" value="query" bind:group={exploreMode} class="accent-blue-500" />
                            Query
                        </label>
                    </div>

                    {#if exploreMode === "scan"}
                        <div class="flex gap-2">
                            <input
                                bind:value={tableName}
                                placeholder="Table name"
                                class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                            />
                            <button
                                onclick={() => runScan()}
                                disabled={!tableName || resultLoading}
                                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2 rounded text-xs font-bold transition flex items-center gap-2"
                            >
                                {#if resultLoading}<span class="animate-spin"
                                        >⟳</span
                                    >{/if} Run Scan
                            </button>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <input
                                bind:value={scanFilter}
                                placeholder="Filter expression (optional) e.g. #s = :status"
                                class="bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                            />
                            <input
                                bind:value={scanValues}
                                placeholder="Expression JSON (e.g. &quot;:status&quot;: &quot;active&quot;)"
                                class="bg-black font-mono text-xs p-2 rounded border border-gray-700 text-green-400 outline-none focus:border-blue-500"
                            />
                        </div>
                    {:else}
                        <div class="flex gap-2">
                            <input
                                bind:value={tableName}
                                placeholder="Table name"
                                class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                            />
                            {#if activeSchema?.GlobalSecondaryIndexes}
                                <select
                                    bind:value={queryIndex}
                                    class="w-48 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                                >
                                    <option value="">[Base Table]</option>
                                    {#each activeSchema.GlobalSecondaryIndexes as idx}
                                        <option value={idx.IndexName}
                                            >{idx.IndexName}</option
                                        >
                                    {/each}
                                </select>
                            {:else}
                                <input
                                    bind:value={queryIndex}
                                    placeholder="Index Name (optional)"
                                    class="w-48 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                                />
                            {/if}
                            <button
                                onclick={() => runQuery()}
                                disabled={!tableName ||
                                    !queryKeyCond ||
                                    resultLoading}
                                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2 rounded text-xs font-bold transition flex items-center gap-2"
                            >
                                {#if resultLoading}<span class="animate-spin"
                                        >⟳</span
                                    >{/if} Run Query
                            </button>
                        </div>

                        <!-- Schema Introspection UI -->
                        {#if activeSchema}
                            <div
                                class="flex gap-4 items-center bg-gray-950 p-3 rounded border border-gray-800"
                            >
                                <div class="text-xs font-bold text-gray-400 w-24">
                                    Query Keys:
                                </div>

                                <div class="flex-1 flex gap-2">
                                    {#if queryIndex && activeSchema.GlobalSecondaryIndexes}
                                        <!-- Use GSI Schema -->
                                        {@const gsi =
                                            activeSchema.GlobalSecondaryIndexes.find(
                                                (i: any) =>
                                                    i.IndexName === queryIndex,
                                            )}
                                        {@const pk = gsi?.KeySchema?.find(
                                            (k: any) => k.KeyType === "HASH",
                                        )}
                                        {@const sk = gsi?.KeySchema?.find(
                                            (k: any) => k.KeyType === "RANGE",
                                        )}

                                        {#if pk}
                                            <div class="flex-1">
                                                <div
                                                    class="text-[10px] text-gray-500 mb-1"
                                                >
                                                    Partition Key ({pk.AttributeName})
                                                </div>
                                                <input
                                                    bind:value={partitionKeyInput}
                                                    placeholder="Exact match..."
                                                    class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        {/if}
                                        {#if sk}
                                            <div class="flex-1 flex gap-2 items-end">
                                                <div class="flex-1">
                                                    <div
                                                        class="text-[10px] text-gray-500 mb-1 flex items-center justify-between"
                                                    >
                                                        <span>Sort Key ({sk.AttributeName})</span>
                                                    </div>
                                                    <div class="flex gap-1">
                                                        <select bind:value={sortKeyOp} class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 max-w-[50px] md:max-w-none">
                                                            <option value="=">=</option>
                                                            <option value="<">&lt;</option>
                                                            <option value="<=">&lt;=</option>
                                                            <option value=">">&gt;</option>
                                                            <option value=">=">&gt;=</option>
                                                            <option value="between">BETWEEN</option>
                                                            <option value="begins_with">BEGINS</option>
                                                        </select>
                                                        <input
                                                            bind:value={sortKeyInput}
                                                            placeholder="Value"
                                                            class="flex-1 w-full bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                {#if sortKeyOp === "between"}
                                                    <div class="flex-1">
                                                        <input
                                                            bind:value={sortKeyInput2}
                                                            placeholder="Value 2"
                                                            class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    {:else}
                                        <!-- Use Base Schema -->
                                        {@const pk = activeSchema.KeySchema?.find(
                                            (k: any) => k.KeyType === "HASH",
                                        )}
                                        {@const sk = activeSchema.KeySchema?.find(
                                            (k: any) => k.KeyType === "RANGE",
                                        )}

                                        {#if pk}
                                            <div class="flex-1">
                                                <div
                                                    class="text-[10px] text-gray-500 mb-1"
                                                >
                                                    Partition Key ({pk.AttributeName})
                                                </div>
                                                <input
                                                    bind:value={partitionKeyInput}
                                                    placeholder="Exact match..."
                                                    class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        {/if}
                                        {#if sk}
                                            <div class="flex-1 flex gap-2 items-end">
                                                <div class="flex-1">
                                                    <div
                                                        class="text-[10px] text-gray-500 mb-1 flex items-center justify-between"
                                                    >
                                                        <span>Sort Key ({sk.AttributeName})</span>
                                                    </div>
                                                    <div class="flex gap-1">
                                                        <select bind:value={sortKeyOp} class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 max-w-[50px] md:max-w-none">
                                                            <option value="=">=</option>
                                                            <option value="<">&lt;</option>
                                                            <option value="<=">&lt;=</option>
                                                            <option value=">">&gt;</option>
                                                            <option value=">=">&gt;=</option>
                                                            <option value="between">BETWEEN</option>
                                                            <option value="begins_with">BEGINS</option>
                                                        </select>
                                                        <input
                                                            bind:value={sortKeyInput}
                                                            placeholder="Value"
                                                            class="flex-1 w-full bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                {#if sortKeyOp === "between"}
                                                    <div class="flex-1">
                                                        <input
                                                            bind:value={sortKeyInput2}
                                                            placeholder="Value 2"
                                                            class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-blue-300 outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    {/if}
                                </div>
                            </div>
                        {/if}

                        <div class="flex gap-2">
                            <input
                                bind:value={queryFilter}
                                placeholder="Filter expression (optional) e.g. status = :st"
                                class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                            />
                        </div>

                        <div class="text-xs text-gray-500 font-bold mb-1 mt-2">
                            Generated / Custom JSON Key Expressions:
                        </div>
                        <textarea
                            bind:value={queryValues}
                            rows="3"
                            placeholder="Expression JSON"
                            class="w-full bg-black font-mono text-xs p-2 rounded border border-gray-700 text-green-400 outline-none focus:border-blue-500 resize-none drop-shadow-inner"
                        ></textarea>
                    {/if}
                </div>

                <div
                    class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 flex flex-col shadow-sm overflow-hidden"
                >
                    <PaginatedTable
                        items={results}
                        loading={resultLoading}
                        hasNext={!!resultCurrentToken}
                        hasPrev={resultTokenMap.length > 0}
                        onNext={() => exploreMode === "scan" ? runScan(resultCurrentToken) : runQuery(resultCurrentToken)}
                        onPrev={() => exploreMode === "scan" ? runScan(popToken(resultTokenMap)) : runQuery(popToken(resultTokenMap))}
                        onRefresh={() => {
                            resultTokenMap = [];
                            exploreMode === "scan" ? runScan() : runQuery();
                        }}
                        columns={allColumns}
                    >
                        {#snippet headerActionsSnippet()}
                            {#if tableName}
                                <button
                                    onclick={startCreateItem}
                                    class="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1"
                                >
                                    + Create Item
                                </button>
                            {/if}
                        {/snippet}
                        {#snippet actionsSnippet(item)}
                            <button
                                onclick={() => viewingItem = item}
                                class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                            >
                                View
                            </button>
                            <button
                                onclick={() => startEditItem(item)}
                                class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition ml-1"
                            >
                                Edit
                            </button>
                            <button
                                onclick={() => itemToDelete = item}
                                class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition ml-1"
                            >
                                Delete
                            </button>
                        {/snippet}
                    </PaginatedTable>
                </div>
            </div>
        {/if}
    </div>

    <!-- Modals -->
    {#if showCreateTable}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-md flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                    <h3 class="font-bold text-gray-200">Create Table</h3>
                    <button onclick={() => showCreateTable = false} class="text-gray-400 hover:text-gray-200 transition-colors">✕</button>
                </div>
                <div class="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 mb-1">Table Name</label>
                        <input bind:value={newTableName} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" placeholder="MyTable" />
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 mb-1">Partition Key</label>
                        <div class="flex gap-2">
                            <input bind:value={newPkName} class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" placeholder="PK Attribute Name" />
                            <select bind:value={newPkType} class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 w-24">
                                <option value="S">String</option>
                                <option value="N">Number</option>
                                <option value="B">Binary</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="flex items-center gap-2 text-xs font-bold text-gray-400 mb-2 cursor-pointer hover:text-gray-200">
                            <input type="checkbox" bind:checked={hasSk} class="accent-blue-500" />
                            Add Sort Key
                        </label>
                        {#if hasSk}
                            <div class="flex gap-2">
                                <input bind:value={newSkName} class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" placeholder="SK Attribute Name" />
                                <select bind:value={newSkType} class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 w-24">
                                    <option value="S">String</option>
                                    <option value="N">Number</option>
                                    <option value="B">Binary</option>
                                </select>
                            </div>
                        {/if}
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 mb-1">Capacity Mode</label>
                        <select bind:value={billingMode} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500">
                            <option value="PAY_PER_REQUEST">On-demand (PAY_PER_REQUEST)</option>
                            <option value="PROVISIONED">Provisioned (5 RCU / 5 WCU default)</option>
                        </select>
                    </div>
                </div>
                <div class="p-4 border-t border-gray-800 shrink-0 flex justify-end gap-2">
                    <button onclick={() => showCreateTable = false} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={handleCreateTable} disabled={createTableLoading || !newTableName || !newPkName} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if createTableLoading}<span class="animate-spin">⟳</span>{/if} Create
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if tableToDelete}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-sm flex flex-col">
                <div class="p-4 border-b border-gray-800">
                    <h3 class="font-bold text-red-400">Delete Table</h3>
                </div>
                <div class="p-4">
                    <p class="text-sm text-gray-300">Are you sure you want to delete table <strong>{tableToDelete}</strong>? This action cannot be undone.</p>
                </div>
                <div class="p-4 border-t border-gray-800 flex justify-end gap-2">
                    <button onclick={() => tableToDelete = null} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={confirmDeleteTable} disabled={deleteTableLoading} class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if deleteTableLoading}<span class="animate-spin">⟳</span>{/if} Delete
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showItemEditor}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-full flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                    <h3 class="font-bold text-gray-200">{itemEditorMode === 'create' ? 'Create Item' : 'Edit Item'}</h3>
                    <button onclick={() => showItemEditor = false} class="text-gray-400 hover:text-gray-200 transition-colors">✕</button>
                </div>
                <div class="p-4 overflow-auto min-h-0 flex-1 flex flex-col">
                    <p class="text-xs text-gray-400 mb-2">Edit the item as plain JSON below. Types will be automatically inferred/marshalled.</p>
                    <textarea bind:value={itemEditorJson} class="flex-1 w-full bg-black font-mono text-xs p-3 rounded border border-gray-700 text-green-400 outline-none focus:border-blue-500 resize-none"></textarea>
                </div>
                <div class="p-4 border-t border-gray-800 shrink-0 flex justify-end gap-2">
                    <button onclick={() => showItemEditor = false} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={handleSaveItem} disabled={itemEditorLoading} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if itemEditorLoading}<span class="animate-spin">⟳</span>{/if} Save
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if itemToDelete}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-sm flex flex-col">
                <div class="p-4 border-b border-gray-800">
                    <h3 class="font-bold text-red-400">Delete Item</h3>
                </div>
                <div class="p-4">
                    <p class="text-sm text-gray-300">Are you sure you want to delete this item? This action cannot be undone.</p>
                </div>
                <div class="p-4 border-t border-gray-800 flex justify-end gap-2">
                    <button onclick={() => itemToDelete = null} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={confirmDeleteItem} disabled={deleteItemLoading} class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if deleteItemLoading}<span class="animate-spin">⟳</span>{/if} Delete
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if viewingItem}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-full flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                    <h3 class="font-bold text-gray-200">Item Details</h3>
                    <button
                        onclick={() => viewingItem = null}
                        class="text-gray-400 hover:text-gray-200 transition-colors"
                    >
                        ✕
                    </button>
                </div>
                <div class="p-4 overflow-auto min-h-0 flex-1 bg-black/50">
                    <pre class="text-xs text-green-400 font-mono whitespace-pre-wrap">{JSON.stringify(viewingItem, null, 2)}</pre>
                </div>
                <div class="p-4 border-t border-gray-800 shrink-0 flex justify-end">
                    <button
                        onclick={() => viewingItem = null}
                        class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded text-sm transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    {/if}
</ServiceLayout>
