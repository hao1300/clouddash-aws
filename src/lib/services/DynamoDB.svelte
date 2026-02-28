<script lang="ts">
    import { onMount } from "svelte";
    import {
        DynamoDBClient,
        ListTablesCommand,
        DescribeTableCommand,
        ScanCommand,
        QueryCommand,
    } from "@aws-sdk/client-dynamodb";
    import { unmarshall } from "@aws-sdk/util-dynamodb";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: DynamoDBClient | null = $state(null);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "tables", label: "Tables" },
        { id: "scan", label: "Scan" },
        { id: "query", label: "Query" },
    ];
    let activeTab = $state("tables");

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
    let queryFilter = $state("");
    let queryValues = $state("");
    let queryIndex = $state("");

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
                    if (t)
                        details.push({
                            name: t.TableName ?? name,
                            status: t.TableStatus ?? "UNKNOWN",
                            item_count: t.ItemCount ?? 0,
                            size_bytes: t.TableSizeBytes ?? 0,
                        });
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
                    { key: "name", label: "Table Name" },
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
                {#snippet actionsSnippet(item)}
                    <button
                        onclick={() => {
                            tableName = item.name;
                            activeTab = "scan";
                        }}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                        >Scan</button
                    >
                    <button
                        onclick={() => {
                            tableName = item.name;
                            activeTab = "query";
                        }}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition ml-1"
                        >Query</button
                    >
                {/snippet}
            </PaginatedTable>
        {:else if activeTab === "scan"}
            <div class="h-full flex flex-col p-4 bg-gray-950">
                <div
                    class="space-y-3 mb-4 shrink-0 bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                >
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
                                >{/if} Let's Scan
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
                </div>

                <div
                    class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 flex flex-col shadow-sm overflow-hidden"
                >
                    <PaginatedTable
                        items={results}
                        loading={resultLoading}
                        hasNext={!!resultCurrentToken}
                        hasPrev={resultTokenMap.length > 0}
                        onNext={() => runScan(resultCurrentToken)}
                        onPrev={() => runScan(popToken(resultTokenMap))}
                        onRefresh={() => {
                            resultTokenMap = [];
                            runScan();
                        }}
                        columns={allColumns}
                    />
                </div>
            </div>
        {:else if activeTab === "query"}
            <div class="h-full flex flex-col p-4 bg-gray-950">
                <div
                    class="space-y-3 mb-4 shrink-0 bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
                >
                    <div class="flex gap-2">
                        <input
                            bind:value={tableName}
                            placeholder="Table name"
                            class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                        />
                        <input
                            bind:value={queryIndex}
                            placeholder="Index Name (optional)"
                            class="w-48 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                        />
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
                    <div class="flex gap-2">
                        <input
                            bind:value={queryKeyCond}
                            placeholder="Key condition e.g. pk = :pk"
                            class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                        />
                        <input
                            bind:value={queryFilter}
                            placeholder="Filter expression (optional)"
                            class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                        />
                    </div>
                    <input
                        bind:value={queryValues}
                        placeholder="Expression JSON (e.g. &quot;:pk&quot;: &quot;user-123&quot;)"
                        class="w-full bg-black font-mono text-xs p-2 rounded border border-gray-700 text-green-400 outline-none focus:border-blue-500"
                    />
                </div>

                <div
                    class="flex-1 min-h-0 bg-gray-900 rounded-lg border border-gray-800 flex flex-col shadow-sm overflow-hidden"
                >
                    <PaginatedTable
                        items={results}
                        loading={resultLoading}
                        hasNext={!!resultCurrentToken}
                        hasPrev={resultTokenMap.length > 0}
                        onNext={() => runQuery(resultCurrentToken)}
                        onPrev={() => runQuery(popToken(resultTokenMap))}
                        onRefresh={() => {
                            resultTokenMap = [];
                            runQuery();
                        }}
                        columns={allColumns}
                    />
                </div>
            </div>
        {/if}
    </div>
</ServiceLayout>
