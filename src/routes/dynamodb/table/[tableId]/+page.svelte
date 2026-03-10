<script lang="ts">
    import {
        DescribeTableCommand,
        UpdateTableCommand,
        DescribeTimeToLiveCommand,
    } from "@aws-sdk/client-dynamodb";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";

    let tableName = $derived($page.params.tableId || "");

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);

    let tableSchema = $state<any>(null);
    let tableTtl = $state<any>(null);
    let tableTtlLoading = $state(false);

    // --- Modals State ---
    let showEditCapacity = $state(false);
    let editBillingMode = $state("PAY_PER_REQUEST");
    let editReadCapacity = $state(5);
    let editWriteCapacity = $state(5);
    let editCapacityLoading = $state(false);

    let showCreateIndex = $state(false);
    let newIndexName = $state("");
    let newIndexPkName = $state("");
    let newIndexPkType = $state("S");
    let newIndexHasSk = $state(false);
    let newIndexSkName = $state("");
    let newIndexSkType = $state("S");
    let newIndexProjectionType = $state("ALL");
    let createIndexLoading = $state(false);

    let indexToDelete = $state<string | null>(null);
    let showDeleteModal = $state(false);
    let deleteIndexLoading = $state(false);

    $effect(() => {
        if (indexToDelete) showDeleteModal = true;
    });

    $effect(() => {
        if (!showDeleteModal) indexToDelete = null;
    });

    $effect(() => {
        if (aws.dynamodb && tableName) {
            loadDetails();
            loadTtl();
        }
    });

    $effect(() => {
        titleService.setResource(tableName);
    });

    async function loadDetails() {
        if (!aws.dynamodb || !tableName) return;
        try {
            loading = true;
            const resp = await aws.dynamodb.send(
                new DescribeTableCommand({ TableName: tableName }),
            );
            tableSchema = resp.Table;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function loadTtl() {
        if (!aws.dynamodb || !tableName) return;
        try {
            tableTtlLoading = true;
            const resp = await aws.dynamodb.send(
                new DescribeTimeToLiveCommand({ TableName: tableName }),
            );
            tableTtl = resp.TimeToLiveDescription;
        } catch {
            tableTtl = null;
        } finally {
            tableTtlLoading = false;
        }
    }

    async function handleUpdateCapacity() {
        if (!aws.dynamodb || !tableName) return;
        try {
            editCapacityLoading = true;
            error = "";
            actionMsg = "";

            const input: any = {
                TableName: tableName,
                BillingMode: editBillingMode,
            };

            if (editBillingMode === "PROVISIONED") {
                input.ProvisionedThroughput = {
                    ReadCapacityUnits: editReadCapacity,
                    WriteCapacityUnits: editWriteCapacity,
                };
            }

            await aws.dynamodb.send(new UpdateTableCommand(input));
            actionMsg = `Successfully requested capacity update for ${tableName}.`;
            showEditCapacity = false;
            loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            editCapacityLoading = false;
        }
    }

    async function handleCreateIndex() {
        if (!aws.dynamodb || !tableName || !newIndexName || !newIndexPkName)
            return;
        try {
            createIndexLoading = true;
            error = "";
            actionMsg = "";

            const AttributeDefinitions = [
                {
                    AttributeName: newIndexPkName,
                    AttributeType: newIndexPkType,
                },
            ];
            const KeySchema: any[] = [
                { AttributeName: newIndexPkName, KeyType: "HASH" },
            ];

            if (newIndexHasSk && newIndexSkName) {
                AttributeDefinitions.push({
                    AttributeName: newIndexSkName,
                    AttributeType: newIndexSkType,
                });
                KeySchema.push({
                    AttributeName: newIndexSkName,
                    KeyType: "RANGE",
                });
            }

            const existingDefs = tableSchema?.AttributeDefinitions || [];
            const mergedDefs = [...existingDefs];
            for (const def of AttributeDefinitions) {
                if (
                    !mergedDefs.find(
                        (d: any) => d.AttributeName === def.AttributeName,
                    )
                ) {
                    mergedDefs.push(def);
                }
            }

            const Create: any = {
                IndexName: newIndexName,
                KeySchema,
                Projection: { ProjectionType: newIndexProjectionType },
            };

            const isProvisioned =
                tableSchema?.BillingModeSummary?.BillingMode ===
                    "PROVISIONED" ||
                !tableSchema?.BillingModeSummary?.BillingMode;
            if (isProvisioned) {
                Create.ProvisionedThroughput = {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5,
                };
            }

            const input: any = {
                TableName: tableName,
                AttributeDefinitions: mergedDefs,
                GlobalSecondaryIndexUpdates: [{ Create }],
            };

            await aws.dynamodb.send(new UpdateTableCommand(input));
            actionMsg = `Successfully requested creation of index ${newIndexName}.`;
            showCreateIndex = false;
            loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            createIndexLoading = false;
        }
    }

    async function confirmDeleteIndex() {
        if (!aws.dynamodb || !tableName || !indexToDelete) return;
        try {
            deleteIndexLoading = true;
            error = "";
            actionMsg = "";

            const input: any = {
                TableName: tableName,
                GlobalSecondaryIndexUpdates: [
                    {
                        Delete: { IndexName: indexToDelete },
                    },
                ],
            };

            await aws.dynamodb.send(new UpdateTableCommand(input));
            actionMsg = `Successfully requested deletion of index ${indexToDelete}.`;
            indexToDelete = null;
            loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            deleteIndexLoading = false;
        }
    }

    async function toggleDeletionProtection() {
        if (!aws.dynamodb || !tableName || !tableSchema) return;
        try {
            error = "";
            actionMsg = "";
            const currentState = tableSchema.DeletionProtectionEnabled || false;
            await aws.dynamodb.send(
                new UpdateTableCommand({
                    TableName: tableName,
                    DeletionProtectionEnabled: !currentState,
                }),
            );
            actionMsg = `Successfully ${!currentState ? "enabled" : "disabled"} deletion protection for ${tableName}.`;
            loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        }
    }

    async function toggleTableClass() {
        if (!aws.dynamodb || !tableName || !tableSchema) return;
        try {
            error = "";
            actionMsg = "";
            const currentClass =
                tableSchema.TableClassSummary?.TableClass || "STANDARD";
            const newClass =
                currentClass === "STANDARD"
                    ? "STANDARD_INFREQUENT_ACCESS"
                    : "STANDARD";
            await aws.dynamodb.send(
                new UpdateTableCommand({
                    TableName: tableName,
                    TableClass: newClass,
                }),
            );
            actionMsg = `Successfully requested table class update to ${newClass} for ${tableName}.`;
            loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        }
    }

    function formatBytes(b: number | string) {
        const num = Number(b);
        if (num === 0 || isNaN(num)) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(num) / Math.log(k));
        return parseFloat((num / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }
</script>

<div class="h-full relative overflow-auto p-4 bg-gray-950">
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

    {#if loading && !tableSchema}
        <div class="flex items-center justify-center h-48 text-gray-500">
            <span class="animate-spin text-2xl mr-3">⟳</span> Loading table details...
        </div>
    {:else if tableSchema}
        <div class="space-y-4 max-w-5xl {error || actionMsg ? 'pt-8' : ''}">
            <!-- Basic Info -->
            <div
                class="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm"
            >
                <div
                    class="flex items-center justify-between gap-3 mb-4 border-b border-gray-800 pb-2"
                >
                    <h3 class="text-sm font-bold text-gray-200">
                        Table Details
                    </h3>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                        <div class="text-gray-500 font-medium mb-1">
                            Table Name
                        </div>
                        <div class="text-gray-300">{tableSchema.TableName}</div>
                    </div>
                    <div>
                        <div class="text-gray-500 font-medium mb-1">Status</div>
                        <div class="text-gray-300">
                            <span
                                class={tableSchema.TableStatus === "ACTIVE"
                                    ? "text-green-400"
                                    : "text-yellow-400"}
                            >
                                {tableSchema.TableStatus === "ACTIVE"
                                    ? "🟢"
                                    : "⚪"}
                                {tableSchema.TableStatus}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 font-medium mb-1">
                            Creation Date
                        </div>
                        <div class="text-gray-300">
                            {tableSchema.CreationDateTime
                                ? new Date(
                                      tableSchema.CreationDateTime,
                                  ).toLocaleString()
                                : "-"}
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 font-medium mb-1">
                            Item Count
                        </div>
                        <div class="text-gray-300">
                            {tableSchema.ItemCount
                                ? Number(tableSchema.ItemCount).toLocaleString()
                                : 0}
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 font-medium mb-1">
                            Table Size
                        </div>
                        <div class="text-gray-300">
                            {formatBytes(tableSchema.TableSizeBytes || 0)}
                        </div>
                    </div>
                    <div class="col-span-2 md:col-span-3">
                        <div class="text-gray-500 font-medium mb-1">
                            Table ARN
                        </div>
                        <div
                            class="text-gray-300 font-mono text-[10px] break-all bg-black/50 p-1.5 rounded"
                        >
                            {tableSchema.TableArn || "-"}
                        </div>
                    </div>
                    <div
                        class="flex items-center gap-2 mt-2 col-span-2 md:col-span-3"
                    >
                        <div class="text-gray-500 font-medium">
                            Deletion Protection:
                        </div>
                        <div class="text-gray-300">
                            <span
                                class={tableSchema.DeletionProtectionEnabled
                                    ? "text-green-400"
                                    : "text-gray-500"}
                            >
                                {tableSchema.DeletionProtectionEnabled
                                    ? "Enabled"
                                    : "Disabled"}
                            </span>
                        </div>
                        <button
                            onclick={toggleDeletionProtection}
                            class="bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded text-[10px] font-medium text-gray-200 transition-colors ml-2"
                            >Toggle</button
                        >
                    </div>
                    <div
                        class="flex items-center gap-2 col-span-2 md:col-span-3"
                    >
                        <div class="text-gray-500 font-medium">
                            Table Class:
                        </div>
                        <div class="text-gray-300 font-mono text-[11px]">
                            {tableSchema.TableClassSummary?.TableClass ||
                                "STANDARD"}
                        </div>
                        <button
                            onclick={toggleTableClass}
                            class="bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded text-[10px] font-medium text-gray-200 transition-colors ml-2"
                            >Toggle</button
                        >
                    </div>
                </div>
            </div>

            <!-- Capacity and Billing -->
            <div
                class="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm"
            >
                <div
                    class="flex items-center justify-between mb-4 border-b border-gray-800 pb-2"
                >
                    <h3 class="text-sm font-bold text-gray-200">
                        Capacity and Billing
                    </h3>
                    <button
                        onclick={() => {
                            editBillingMode =
                                tableSchema.BillingModeSummary?.BillingMode ||
                                "PROVISIONED";
                            editReadCapacity =
                                tableSchema.ProvisionedThroughput
                                    ?.ReadCapacityUnits || 5;
                            editWriteCapacity =
                                tableSchema.ProvisionedThroughput
                                    ?.WriteCapacityUnits || 5;
                            showEditCapacity = true;
                        }}
                        class="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-xs font-medium text-gray-200 transition-colors"
                    >
                        Edit Capacity
                    </button>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                        <div class="text-gray-500 font-medium mb-1">
                            Billing Mode
                        </div>
                        <div class="text-gray-300">
                            {tableSchema.BillingModeSummary?.BillingMode ||
                                "PROVISIONED"}
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 font-medium mb-1">
                            Read Capacity (RCU)
                        </div>
                        <div class="text-gray-300">
                            {tableSchema.BillingModeSummary?.BillingMode ===
                            "PAY_PER_REQUEST"
                                ? "-"
                                : (tableSchema.ProvisionedThroughput
                                      ?.ReadCapacityUnits ?? "-")}
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 font-medium mb-1">
                            Write Capacity (WCU)
                        </div>
                        <div class="text-gray-300">
                            {tableSchema.BillingModeSummary?.BillingMode ===
                            "PAY_PER_REQUEST"
                                ? "-"
                                : (tableSchema.ProvisionedThroughput
                                      ?.WriteCapacityUnits ?? "-")}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Global Secondary Indexes -->
            <div
                class="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm"
            >
                <div
                    class="flex items-center justify-between mb-4 border-b border-gray-800 pb-2"
                >
                    <h3 class="text-sm font-bold text-gray-200">
                        Global Secondary Indexes
                    </h3>
                    <button
                        onclick={() => (showCreateIndex = true)}
                        class="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-xs font-bold text-white transition-colors"
                        >+ Create Index</button
                    >
                </div>
                {#if !tableSchema.GlobalSecondaryIndexes || tableSchema.GlobalSecondaryIndexes.length === 0}
                    <div class="text-xs text-gray-500 italic py-2">
                        No Global Secondary Indexes found.
                    </div>
                {:else}
                    <div class="space-y-4">
                        {#each tableSchema.GlobalSecondaryIndexes as gsi}
                            <div
                                class="border border-gray-800 rounded p-3 bg-gray-950 flex flex-col md:flex-row gap-4 items-start md:items-center"
                            >
                                <div
                                    class="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs"
                                >
                                    <div>
                                        <div
                                            class="text-gray-500 font-medium mb-1"
                                        >
                                            Index Name
                                        </div>
                                        <div
                                            class="text-gray-300 font-mono text-[11px]"
                                        >
                                            {gsi.IndexName}
                                        </div>
                                    </div>
                                    <div>
                                        <div
                                            class="text-gray-500 font-medium mb-1"
                                        >
                                            Status
                                        </div>
                                        <div class="text-gray-300">
                                            <span
                                                class={gsi.IndexStatus ===
                                                "ACTIVE"
                                                    ? "text-green-400"
                                                    : "text-yellow-400"}
                                            >
                                                {gsi.IndexStatus === "ACTIVE"
                                                    ? "🟢"
                                                    : "⚪"}
                                                {gsi.IndexStatus || "-"}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <div
                                            class="text-gray-500 font-medium mb-1"
                                        >
                                            Projection
                                        </div>
                                        <div class="text-gray-300">
                                            {gsi.Projection?.ProjectionType ||
                                                "-"}
                                        </div>
                                    </div>
                                    <div>
                                        <div
                                            class="text-gray-500 font-medium mb-1"
                                        >
                                            Keys
                                        </div>
                                        <div
                                            class="text-gray-300 font-mono text-[10px]"
                                        >
                                            PK: {gsi.KeySchema?.find(
                                                (k: any) =>
                                                    k.KeyType === "HASH",
                                            )?.AttributeName || "-"}<br />
                                            SK: {gsi.KeySchema?.find(
                                                (k: any) =>
                                                    k.KeyType === "RANGE",
                                            )?.AttributeName || "-"}
                                        </div>
                                    </div>
                                </div>
                                <div class="shrink-0 flex gap-2">
                                    <button
                                        onclick={() =>
                                            (indexToDelete = gsi.IndexName)}
                                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                                        >Delete</button
                                    >
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<Modal bind:open={showEditCapacity} title="Edit Capacity">
    <div class="space-y-4">
        <div>
            <label class="block text-xs font-bold text-gray-400 mb-1"
                >Capacity Mode</label
            >
            <select
                bind:value={editBillingMode}
                class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
            >
                <option value="PAY_PER_REQUEST"
                    >On-demand (PAY_PER_REQUEST)</option
                >
                <option value="PROVISIONED">Provisioned</option>
            </select>
        </div>
        {#if editBillingMode === "PROVISIONED"}
            <div class="flex gap-4">
                <div class="flex-1">
                    <label class="block text-xs font-bold text-gray-400 mb-1"
                        >Read Capacity (RCU)</label
                    >
                    <input
                        type="number"
                        min="1"
                        bind:value={editReadCapacity}
                        class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    />
                </div>
                <div class="flex-1">
                    <label class="block text-xs font-bold text-gray-400 mb-1"
                        >Write Capacity (WCU)</label
                    >
                    <input
                        type="number"
                        min="1"
                        bind:value={editWriteCapacity}
                        class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    />
                </div>
            </div>
        {/if}
        <div class="flex justify-end gap-2 mt-4">
            <button
                onclick={() => (showEditCapacity = false)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={handleUpdateCapacity}
                disabled={editCapacityLoading}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if editCapacityLoading}<span class="animate-spin">⟳</span
                    >{/if} Save
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showCreateIndex} title="Create Global Secondary Index">
    <div class="space-y-4">
        <div>
            <label class="block text-xs font-bold text-gray-400 mb-1"
                >Index Name</label
            >
            <input
                bind:value={newIndexName}
                class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                placeholder="MyGSI"
            />
        </div>
        <div>
            <label class="block text-xs font-bold text-gray-400 mb-1"
                >Partition Key</label
            >
            <div class="flex gap-2">
                <input
                    bind:value={newIndexPkName}
                    class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    placeholder="PK Attribute Name"
                />
                <select
                    bind:value={newIndexPkType}
                    class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 w-24"
                >
                    <option value="S">String</option>
                    <option value="N">Number</option>
                    <option value="B">Binary</option>
                </select>
            </div>
        </div>
        <div>
            <label
                class="flex items-center gap-2 text-xs font-bold text-gray-400 mb-2 cursor-pointer hover:text-gray-200"
            >
                <input
                    type="checkbox"
                    bind:checked={newIndexHasSk}
                    class="accent-blue-500"
                />
                Add Sort Key
            </label>
            {#if newIndexHasSk}
                <div class="flex gap-2">
                    <input
                        bind:value={newIndexSkName}
                        class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                        placeholder="SK Attribute Name"
                    />
                    <select
                        bind:value={newIndexSkType}
                        class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 w-24"
                    >
                        <option value="S">String</option>
                        <option value="N">Number</option>
                        <option value="B">Binary</option>
                    </select>
                </div>
            {/if}
        </div>
        <div>
            <label class="block text-xs font-bold text-gray-400 mb-1"
                >Projection Type</label
            >
            <select
                bind:value={newIndexProjectionType}
                class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
            >
                <option value="ALL">ALL (All table attributes)</option>
                <option value="KEYS_ONLY"
                    >KEYS_ONLY (Only index and primary keys)</option
                >
            </select>
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button
                onclick={() => (showCreateIndex = false)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={handleCreateIndex}
                disabled={createIndexLoading ||
                    !newIndexName ||
                    !newIndexPkName}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if createIndexLoading}<span class="animate-spin">⟳</span>{/if}
                Create Index
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showDeleteModal} title="Delete Index">
    <div class="space-y-4">
        <p class="text-sm text-gray-300">
            Are you sure you want to delete the index <strong
                >{indexToDelete}</strong
            >? This action cannot be undone.
        </p>
        <div class="flex justify-end gap-2 mt-4">
            <button
                onclick={() => (indexToDelete = null)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={confirmDeleteIndex}
                disabled={deleteIndexLoading}
                class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if deleteIndexLoading}<span class="animate-spin">⟳</span>{/if}
                Delete
            </button>
        </div>
    </div>
</Modal>
