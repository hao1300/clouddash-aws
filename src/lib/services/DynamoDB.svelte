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

    type Tab = "tables" | "scan" | "query";
    let tab = $state<Tab>("tables");
    let client: DynamoDBClient | null = $state(null);

    // Tables
    let tables = $state<any[]>([]);
    let tablesToken = $state<string | undefined>(undefined);
    let tablesLoading = $state(false);

    // Scan / Query shared
    let tableName = $state("");
    let results = $state<any[]>([]);
    let resultToken = $state<Record<string, any> | undefined>(undefined);
    let resultLoading = $state(false);
    let error = $state("");

    // Scan params
    let scanFilter = $state("");
    let scanValues = $state("{}");

    // Query params
    let queryKeyCond = $state("");
    let queryFilter = $state("");
    let queryValues = $state("{}");
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

    async function loadTables(append = false) {
        if (!client) return;
        try {
            tablesLoading = true;
            error = "";
            const resp = await client.send(
                new ListTablesCommand({
                    Limit: 100,
                    ExclusiveStartTableName: append ? tablesToken : undefined,
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
            tables = append ? [...tables, ...details] : details;
            tablesToken = resp.LastEvaluatedTableName;
        } catch (e) {
            error = String(e);
        } finally {
            tablesLoading = false;
        }
    }

    async function runScan(append = false) {
        if (!client || !tableName) return;
        try {
            resultLoading = true;
            error = "";
            let exprVals: Record<string, any> | undefined;
            try {
                const parsed = JSON.parse(scanValues);
                if (Object.keys(parsed).length)
                    exprVals = marshalValues(parsed);
            } catch {
                /* ignore */
            }

            const resp = await client.send(
                new ScanCommand({
                    TableName: tableName,
                    Limit: 25,
                    FilterExpression: scanFilter || undefined,
                    ExpressionAttributeValues: exprVals,
                    ExclusiveStartKey: append ? resultToken : undefined,
                }),
            );
            const items = (resp.Items ?? []).map((i) => unmarshall(i));
            results = append ? [...results, ...items] : items;
            resultToken = resp.LastEvaluatedKey;
        } catch (e) {
            error = String(e);
        } finally {
            resultLoading = false;
        }
    }

    async function runQuery(append = false) {
        if (!client || !tableName || !queryKeyCond) return;
        try {
            resultLoading = true;
            error = "";
            let exprVals: Record<string, any> | undefined;
            try {
                const parsed = JSON.parse(queryValues);
                if (Object.keys(parsed).length)
                    exprVals = marshalValues(parsed);
            } catch {
                /* ignore */
            }

            const resp = await client.send(
                new QueryCommand({
                    TableName: tableName,
                    KeyConditionExpression: queryKeyCond,
                    FilterExpression: queryFilter || undefined,
                    IndexName: queryIndex || undefined,
                    ExpressionAttributeValues: exprVals,
                    ExclusiveStartKey: append ? resultToken : undefined,
                    Limit: 25,
                }),
            );
            const items = (resp.Items ?? []).map((i) => unmarshall(i));
            results = append ? [...results, ...items] : items;
            resultToken = resp.LastEvaluatedKey;
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

    function formatBytes(b: number) {
        if (b === 0) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }

    let allColumns = $derived([
        ...new Set(results.flatMap((r) => Object.keys(r))),
    ]);
</script>

<!-- Sub-tabs -->
<div class="flex gap-1 mb-3">
    {#each ["tables", "scan", "query"] as Tab[] as t}
        <button
            onclick={() => {
                tab = t;
                results = [];
                resultToken = undefined;
                error = "";
            }}
            class="px-3 py-1 rounded text-xs font-semibold transition {tab === t
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800'}"
            >{t.charAt(0).toUpperCase() + t.slice(1)}</button
        >
    {/each}
</div>

{#if error}<div class="bg-red-500/20 text-red-300 p-2 rounded text-xs mb-2">
        {error}
    </div>{/if}

{#if tab === "tables"}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {#each tables as t}
            <button
                onclick={() => {
                    tableName = t.name;
                    tab = "scan";
                }}
                class="bg-gray-900 p-3 rounded-lg border border-gray-800 text-left hover:border-blue-500/50 transition"
            >
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-semibold text-gray-100 truncate"
                        >{t.name}</span
                    >
                    <span
                        class="shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-bold {t.status ===
                        'ACTIVE'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'}"
                        >{t.status}</span
                    >
                </div>
                <div class="flex justify-between text-xs">
                    <span class="text-gray-500">Items</span><span
                        class="text-gray-300"
                        >{t.item_count?.toLocaleString()}</span
                    >
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <span class="text-gray-500">Size</span><span
                        class="text-gray-300">{formatBytes(t.size_bytes)}</span
                    >
                </div>
            </button>
        {/each}
        {#if !tablesLoading && tables.length === 0}<div
                class="col-span-full text-gray-600 text-center py-16 text-sm"
            >
                No DynamoDB tables found.
            </div>{/if}
    </div>
    {#if tablesLoading}<div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>{/if}
    {#if tablesToken && !tablesLoading}<button
            onclick={() => loadTables(true)}
            class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
            >Load More</button
        >{/if}
{:else if tab === "scan"}
    <div class="space-y-2 mb-3">
        <div class="flex gap-2">
            <input
                bind:value={tableName}
                placeholder="Table name"
                class="flex-1 bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
            />
            <button
                onclick={() => runScan()}
                disabled={!tableName || resultLoading}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-xs font-bold transition"
                >Scan</button
            >
        </div>
        <input
            bind:value={scanFilter}
            placeholder="Filter expression (optional), e.g. #s = :status"
            class="w-full bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
        />
        <input
            bind:value={scanValues}
            placeholder={'Expression values JSON, e.g. {":status": "active"}'}
            class="w-full bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 font-mono outline-none focus:border-blue-500"
        />
    </div>

    {#if results.length > 0}
        <div class="overflow-auto border border-gray-800 rounded-lg">
            <table class="w-full text-xs">
                <thead class="bg-gray-900 sticky top-0"
                    ><tr
                        >{#each allColumns as col}<th
                                class="px-3 py-2 text-left text-gray-400 font-semibold border-b border-gray-800"
                                >{col}</th
                            >{/each}</tr
                    ></thead
                >
                <tbody>
                    {#each results as row}
                        <tr
                            class="border-b border-gray-800/50 hover:bg-gray-900/50"
                        >
                            {#each allColumns as col}<td
                                    class="px-3 py-2 text-gray-300 truncate max-w-[200px]"
                                    >{typeof row[col] === "object"
                                        ? JSON.stringify(row[col])
                                        : (row[col] ?? "")}</td
                                >{/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <div class="text-xs text-gray-500 mt-1">
            {results.length} items loaded
        </div>
    {/if}
    {#if resultLoading}<div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>{/if}
    {#if resultToken && !resultLoading}<button
            onclick={() => runScan(true)}
            class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
            >Load More</button
        >{/if}
{:else if tab === "query"}
    <div class="space-y-2 mb-3">
        <div class="flex gap-2">
            <input
                bind:value={tableName}
                placeholder="Table name"
                class="flex-1 bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
            />
            <input
                bind:value={queryIndex}
                placeholder="Index (optional)"
                class="w-40 bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
            />
            <button
                onclick={() => runQuery()}
                disabled={!tableName || !queryKeyCond || resultLoading}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-xs font-bold transition"
                >Query</button
            >
        </div>
        <input
            bind:value={queryKeyCond}
            placeholder="Key condition, e.g. pk = :pk"
            class="w-full bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
        />
        <input
            bind:value={queryFilter}
            placeholder="Filter expression (optional)"
            class="w-full bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
        />
        <input
            bind:value={queryValues}
            placeholder={'Expression values JSON, e.g. {":pk": "user-123"}'}
            class="w-full bg-gray-900 text-xs p-2 rounded border border-gray-700 text-gray-300 font-mono outline-none focus:border-blue-500"
        />
    </div>

    {#if results.length > 0}
        <div class="overflow-auto border border-gray-800 rounded-lg">
            <table class="w-full text-xs">
                <thead class="bg-gray-900 sticky top-0"
                    ><tr
                        >{#each allColumns as col}<th
                                class="px-3 py-2 text-left text-gray-400 font-semibold border-b border-gray-800"
                                >{col}</th
                            >{/each}</tr
                    ></thead
                >
                <tbody>
                    {#each results as row}
                        <tr
                            class="border-b border-gray-800/50 hover:bg-gray-900/50"
                        >
                            {#each allColumns as col}<td
                                    class="px-3 py-2 text-gray-300 truncate max-w-[200px]"
                                    >{typeof row[col] === "object"
                                        ? JSON.stringify(row[col])
                                        : (row[col] ?? "")}</td
                                >{/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <div class="text-xs text-gray-500 mt-1">
            {results.length} items loaded
        </div>
    {/if}
    {#if resultLoading}<div class="flex justify-center py-4">
            <div
                class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            ></div>
        </div>{/if}
    {#if resultToken && !resultLoading}<button
            onclick={() => runQuery(true)}
            class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
            >Load More</button
        >{/if}
{/if}
