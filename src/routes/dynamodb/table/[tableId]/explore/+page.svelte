<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
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
    import Select from "$lib/components/Select.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiRefresh, mdiCircle, mdiChevronDown } from "@mdi/js";
    import JsonEditor from "$lib/components/JsonEditor.svelte";
    import { slide } from "svelte/transition";

    let tableName = $derived($page.params.tableId || "");

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);
    let isQueryExpanded = $state(true);

    let tableSchema = $state<any>(null);
    let results = $state<any[]>([]);
    let resultTokenMap = $state<Record<string, any>[]>([]);
    let resultCurrentToken = $state<Record<string, any> | undefined>(undefined);

    let exploreMode = $state<"scan" | "query">("scan");

    // Scan params
    let scanLimit = $state(25);
    let scanConsistentRead = $state(false);

    // Query params
    let queryKeyCond = $state("");
    let queryNames = $state<Record<string, string>>({});
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
    let showDeleteModal = $state(false);
    let deleteItemLoading = $state(false);
    let viewingItem = $state<any>(null);
    let showViewModal = $state(false);

    $effect(() => {
        if (itemToDelete) showDeleteModal = true;
    });

    $effect(() => {
        if (!showDeleteModal) itemToDelete = null;
    });

    $effect(() => {
        if (viewingItem) showViewModal = true;
    });

    $effect(() => {
        titleService.setResources([
            { name: "Tables", href: "/dynamodb", path: "/dynamodb" },
            { name: tableName, path: $page.url.pathname },
        ]);
    });

    $effect(() => {
        if (!showViewModal) viewingItem = null;
    });

    $effect(() => {
        if (aws.dynamodb && tableName) {
            loadSchema();
        }
    });

    // Filter System
    interface FilterRow {
        id: string;
        attribute: string;
        condition: string;
        type: "String" | "Number" | "Boolean" | "Null";
        value: string;
    }

    let filters = $state<FilterRow[]>([]);

    function addFilter() {
        filters.push({
            id: Math.random().toString(36).slice(2),
            attribute: "",
            condition: "Equal to",
            type: "String",
            value: "",
        });
    }

    function removeFilter(id: string) {
        filters = filters.filter((f) => f.id !== id);
    }

    function buildExpressions(rows: FilterRow[]) {
        const validRows = rows.filter((row) => {
            if (!row.attribute.trim()) return false;
            if (row.condition === "Exists" || row.condition === "Not exists")
                return true;
            return row.value.trim() !== "";
        });

        if (validRows.length === 0)
            return {
                filterExpr: undefined,
                names: undefined,
                values: undefined,
            };

        let exprParts: string[] = [];
        let names: Record<string, string> = {};
        let values: Record<string, any> = {};

        validRows.forEach((row, i) => {
            const attrKey = `#a${i}`;
            const valKey = `:v${i}`;
            names[attrKey] = row.attribute;

            let val: any = row.value;
            if (row.type === "Number") val = Number(row.value);
            else if (row.type === "Boolean")
                val = row.value.toLowerCase() === "true";
            else if (row.type === "Null") val = null;

            const marshalledVal =
                row.type === "Number"
                    ? { N: String(val) }
                    : row.type === "Boolean"
                      ? { BOOL: val }
                      : row.type === "Null"
                        ? { NULL: true }
                        : { S: String(val) };

            values[valKey] = marshalledVal;

            switch (row.condition) {
                case "Equal to":
                    exprParts.push(`${attrKey} = ${valKey}`);
                    break;
                case "Not equal to":
                    exprParts.push(`${attrKey} <> ${valKey}`);
                    break;
                case "Less than":
                    exprParts.push(`${attrKey} < ${valKey}`);
                    break;
                case "Less than or equal to":
                    exprParts.push(`${attrKey} <= ${valKey}`);
                    break;
                case "Greater than":
                    exprParts.push(`${attrKey} > ${valKey}`);
                    break;
                case "Greater than or equal to":
                    exprParts.push(`${attrKey} >= ${valKey}`);
                    break;
                case "Begins with":
                    exprParts.push(`begins_with(${attrKey}, ${valKey})`);
                    break;
                case "Contains":
                    exprParts.push(`contains(${attrKey}, ${valKey})`);
                    break;
                case "Exists":
                    exprParts.push(`attribute_exists(${attrKey})`);
                    delete values[valKey];
                    break;
                case "Not exists":
                    exprParts.push(`attribute_not_exists(${attrKey})`);
                    delete values[valKey];
                    break;
            }
        });

        return {
            filterExpr: exprParts.join(" AND "),
            names: Object.keys(names).length ? names : undefined,
            values: Object.keys(values).length ? values : undefined,
        };
    }

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

            const { filterExpr, names, values } = buildExpressions(filters);

            const resp = await aws.dynamodb.send(
                new ScanCommand({
                    TableName: tableName,
                    Limit: scanLimit,
                    ConsistentRead: scanConsistentRead,
                    FilterExpression: filterExpr,
                    ExpressionAttributeNames: names,
                    ExpressionAttributeValues: values,
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
            else
                isQueryExpanded = false;
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

            const {
                filterExpr,
                names: fNames,
                values: fVals,
            } = buildExpressions(filters);

            // Combine with KeyCondition names/vals
            let combinedNames = { ...queryNames, ...fNames };

            let queryValsParsed = {};
            try {
                if (queryValues) queryValsParsed = JSON.parse(queryValues);
            } catch (e) {}
            let marshalledQueryVals = marshalValues(queryValsParsed);
            let combinedValues = { ...marshalledQueryVals, ...fVals };

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
                    FilterExpression: filterExpr,
                    IndexName: queryIndex || undefined,
                    ExpressionAttributeNames: Object.keys(combinedNames).length
                        ? combinedNames
                        : undefined,
                    ExpressionAttributeValues: Object.keys(combinedValues)
                        .length
                        ? combinedValues
                        : undefined,
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
            else
                isQueryExpanded = false;
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
            if (pk && itemToDelete[pk] !== undefined)
                key[pk] = itemToDelete[pk];
            if (sk && itemToDelete[sk] !== undefined)
                key[sk] = itemToDelete[sk];
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

    let allColumns = $derived.by(() => {
        const foundKeys = [...new Set(results.flatMap((r) => Object.keys(r)))];
        let pkName = "",
            skName = "";

        if (tableSchema) {
            let schemaRef = tableSchema.KeySchema;
            if (queryIndex) {
                const idx = tableSchema.GlobalSecondaryIndexes?.find(
                    (i: any) => i.IndexName === queryIndex,
                );
                if (idx) schemaRef = idx.KeySchema;
            }
            pkName =
                schemaRef?.find((k: any) => k.KeyType === "HASH")
                    ?.AttributeName || "";
            skName =
                schemaRef?.find((k: any) => k.KeyType === "RANGE")
                    ?.AttributeName || "";
        }

        const primaryKeys = [pkName, skName].filter(Boolean);
        const otherKeys = foundKeys.filter((k) => k !== pkName && k !== skName);

        return [...primaryKeys, ...otherKeys].map((k) => ({
            key: k,
            label: k,
            format: (val: any) =>
                typeof val === "object"
                    ? JSON.stringify(val)
                    : String(val ?? ""),
        }));
    });
</script>

<div class="h-full flex flex-col overflow-hidden">
    <TabBar
        tabs={[
            { id: "explore", label: "Explore", href: `/dynamodb/table/${encodeURIComponent(tableName)}/explore` },
            { id: "details", label: "Details", href: `/dynamodb/table/${encodeURIComponent(tableName)}/details` },
        ]}
        activeTab="explore"
    />
<div class="flex-1 flex flex-col p-2 bg-gray-950 overflow-hidden relative">
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
        class="mb-4 shrink-0 bg-gray-900 border border-gray-800 shadow-sm rounded-md overflow-hidden {error ||
        actionMsg
            ? 'mt-8'
            : ''}"
    >
        <!-- Header -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="p-2 border-b border-gray-800 bg-gray-800/50 flex items-center justify-between cursor-pointer hover:bg-gray-800/70 transition-colors"
            onclick={() => isQueryExpanded = !isQueryExpanded}
        >
            <div class="flex items-center gap-6">
                <span class="text-sm font-semibold text-gray-200"
                    >Scan or query items</span
                >
                <div class="flex items-center gap-4" onclick={(e) => e.stopPropagation()}>
                    <label
                        class="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white"
                    >
                        <input
                            type="radio"
                            value="scan"
                            bind:group={exploreMode}
                            class="accent-blue-500 size-3"
                        /> Scan
                    </label>
                    <label
                        class="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white"
                    >
                        <input
                            type="radio"
                            value="query"
                            bind:group={exploreMode}
                            class="accent-blue-500 size-3"
                        /> Query
                    </label>
                </div>
            </div>
            <div class="pr-2 text-gray-400">
                <svg class="w-4 h-4 transition-transform duration-300 {!isQueryExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                </svg>
            </div>
        </div>

        {#if isQueryExpanded}
        <div class="p-4 space-y-4" transition:slide={{ duration: 200 }}>
            <div class="grid grid-cols-1 gap-4">
                <div class="space-y-1">
                    <label>
                        <span
                            class="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1"
                            >Select a table or index</span
                        >
                        <Select
                            bind:value={queryIndex}
                            options={[
                                { value: "", label: `Table - ${tableName}` },
                                ...(tableSchema?.GlobalSecondaryIndexes || []).map(idx => ({
                                    value: idx.IndexName,
                                    label: `Index - ${idx.IndexName}`
                                }))
                            ]}
                        />
                    </label>
                </div>
            </div>

            {#if exploreMode === "query"}
                {@const schemaRef = queryIndex
                    ? tableSchema?.GlobalSecondaryIndexes?.find(
                          (i: any) => i.IndexName === queryIndex,
                      )?.KeySchema || tableSchema?.KeySchema
                    : tableSchema?.KeySchema}
                {@const pkAttr =
                    schemaRef?.find((k: any) => k.KeyType === "HASH")
                        ?.AttributeName || "pk"}
                {@const skAttr =
                    schemaRef?.find((k: any) => k.KeyType === "RANGE")
                        ?.AttributeName || ""}

                <!-- Partition Key -->
                <div class="border-t border-gray-800 pt-4">
                    <h3 class="text-sm font-bold text-gray-200 mb-3">
                        Partition key
                    </h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <span
                                class="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1"
                                >Attribute</span
                            >
                            <span class="text-xs text-gray-300 block py-1.5"
                                >{pkAttr}</span
                            >
                        </div>
                        <div>
                            <label>
                                <span
                                    class="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1"
                                    >Value</span
                                >
                                <input
                                    bind:value={partitionKeyInput}
                                    placeholder="Enter attribute value"
                                    class="w-full bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-200 focus:border-blue-500 outline-none"
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Sort Key -->
                {#if skAttr}
                    <div class="border-t border-gray-800 pt-4">
                        <h3 class="text-sm font-bold text-gray-200 mb-0.5">
                            Sort key <span
                                class="text-gray-500 italic font-normal"
                                >– optional</span
                            >
                        </h3>
                        <div class="grid grid-cols-2 gap-4 mt-3">
                            <div>
                                <span
                                    class="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1"
                                    >Attribute</span
                                >
                                <span class="text-xs text-gray-300 block py-1.5"
                                    >{skAttr}</span
                                >
                            </div>
                            <div>
                                <span
                                    class="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1"
                                    >Value</span
                                >
                                <div class="flex gap-2">
                                    <Select
                                        bind:value={sortKeyOp}
                                        options={[
                                            { value: "=", label: "Equal to" },
                                            { value: "begins_with", label: "Begins with" }
                                        ]}
                                        class="w-28"
                                    />
                                    <input
                                        bind:value={sortKeyInput}
                                        placeholder="Enter attribute value"
                                        class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-200 focus:border-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                        <label
                            class="flex items-center gap-2 mt-3 cursor-pointer w-fit"
                        >
                            <input
                                type="checkbox"
                                checked={!queryScanIndexForward}
                                onchange={(e) =>
                                    (queryScanIndexForward =
                                        !e.currentTarget.checked)}
                                class="accent-blue-500 size-3.5"
                            />
                            <span class="text-xs text-gray-300"
                                >Sort descending</span
                            >
                        </label>
                    </div>
                {/if}
            {/if}

            <!-- Filters Section -->
            <div class="space-y-3 pt-2">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-gray-200">Filters</span>
                    <span class="text-[10px] text-gray-500 italic"
                        >- optional</span
                    >
                </div>

                <div class="space-y-2">
                    {#each filters as filter (filter.id)}
                        <div
                            class="flex gap-2 items-center animate-in fade-in slide-in-from-top-1 duration-200"
                        >
                            <div class="w-1/4">
                                <label>
                                    <span
                                        class="block text-[10px] text-gray-500 mb-1 ml-1"
                                        >Attribute name</span
                                    >
                                    <input
                                        bind:value={filter.attribute}
                                        placeholder="Enter attribute name"
                                        class="w-full bg-gray-950 text-xs p-1.5 rounded border border-gray-700 text-gray-200 focus:border-blue-500 outline-none"
                                    />
                                </label>
                            </div>
                            <div class="w-1/4">
                                <label>
                                    <span
                                        class="block text-[10px] text-gray-500 mb-1 ml-1"
                                        >Condition</span
                                    >
                                    <Select
                                        bind:value={filter.condition}
                                        options={[
                                            "Equal to",
                                            "Not equal to",
                                            "Less than",
                                            "Less than or equal to",
                                            "Greater than",
                                            "Greater than or equal to",
                                            "Begins with",
                                            "Contains",
                                            "Exists",
                                            "Not exists"
                                        ]}
                                    />
                                </label>
                            </div>
                            <div class="w-48">
                                <label>
                                    <span
                                        class="block text-[10px] text-gray-500 mb-1 ml-1"
                                        >Type</span
                                    >
                                    <Select
                                        bind:value={filter.type}
                                        options={["String", "Number", "Boolean", "Null"]}
                                    />
                                </label>
                            </div>
                            <div class="flex-1">
                                <label>
                                    <span
                                        class="block text-[10px] text-gray-500 mb-1 ml-1"
                                        >Value</span
                                    >
                                    <input
                                        bind:value={filter.value}
                                        disabled={filter.condition ===
                                            "Exists" ||
                                            filter.condition === "Not exists"}
                                        placeholder="Enter attribute value"
                                        class="w-full bg-gray-950 text-xs p-1.5 rounded border border-gray-700 text-gray-200 focus:border-blue-500 outline-none disabled:bg-gray-900 disabled:text-gray-600"
                                    />
                                </label>
                            </div>
                            <div class="pt-5">
                                <button
                                    onclick={() => removeFilter(filter.id)}
                                    class="px-3 py-1.5 text-xs font-semibold text-blue-400 border border-blue-400/50 rounded-full hover:bg-blue-400/10 transition"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    {/each}

                    <button
                        onclick={addFilter}
                        class="px-3 py-1.5 text-xs font-semibold text-blue-400 border border-blue-400/50 rounded-full hover:bg-blue-400/10 transition mt-2"
                    >
                        Add filter
                    </button>
                </div>
            </div>

            <div class="flex gap-4 pt-4 border-t border-gray-800">
                <button
                    onclick={() =>
                        exploreMode === "scan" ? runScan() : runQuery()}
                    disabled={loading ||
                        (exploreMode === "query" && !partitionKeyInput)}
                    class="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-8 py-2 rounded-full text-xs font-bold text-black transition flex items-center gap-2"
                >
                    {#if loading}<Icon path={mdiRefresh} size={18} class="animate-spin" />{/if}
                    Run
                </button>
                <button
                    onclick={() => {
                        filters = [];
                        partitionKeyInput = "";
                        sortKeyInput = "";
                        sortKeyInput2 = "";
                    }}
                    class="text-xs font-bold text-blue-400 hover:text-blue-300 transition"
                >
                    Reset
                </button>
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
                exploreMode === "scan"
                    ? runScan(prevToken)
                    : runQuery(prevToken);
            }}
            onRefresh={() => {
                resultTokenMap = [];
                exploreMode === "scan" ? runScan() : runQuery();
            }}
            onRowClick={(item) => {
                itemEditorJson = JSON.stringify(item, null, 2);
                itemEditorMode = "edit";
                showItemEditor = true;
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
                        onclick={(e) => {
                            e.stopPropagation();
                            itemToDelete = item;
                        }}
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
    maxWidth="max-w-4xl"
>
    <div class="flex flex-col h-[60vh]">
        <p class="text-xs text-gray-400 mb-2">
            Edit item JSON. Types are auto-inferred.
        </p>
        <div
            class="flex-1 w-full rounded border border-gray-700 outline-none focus-within:border-blue-500 overflow-hidden min-h-0"
        >
            <JsonEditor bind:value={itemEditorJson} />
        </div>
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
                {#if itemEditorLoading}<Icon path={mdiRefresh} size={14} class="animate-spin" />{/if}
                Save
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showDeleteModal} title="Delete Item">
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
                {#if deleteItemLoading}<Icon path={mdiRefresh} size={14} class="animate-spin" />{/if}
                Delete
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showViewModal} title="Item Details" maxWidth="max-w-4xl">
    <div class="bg-black/50 p-4 rounded min-h-[40vh] overflow-auto">
        <pre
            class="text-xs text-green-400 font-mono whitespace-pre-wrap">{JSON.stringify(
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
</div>

