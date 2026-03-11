<script lang="ts">
    import {
        ListTablesCommand,
        DescribeTableCommand,
        CreateTableCommand,
        DeleteTableCommand,
    } from "@aws-sdk/client-dynamodb";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";

    let error = $state("");
    let loading = $state(false);
    let actionMsg = $state("");

    // --- Tables State ---
    let tables = $state<any[]>([]);
    let tablesTokenMap = $state<string[]>([]);
    let tablesCurrentToken = $state<string | undefined>(undefined);

    // --- Create Table Modal State ---
    let showCreateTable = $state(false);
    let newTableName = $state("");
    let newPkName = $state("");
    let newPkType = $state("S");
    let hasSk = $state(false);
    let newSkName = $state("");
    let newSkType = $state("S");
    let billingMode = $state("PAY_PER_REQUEST");
    let newTableClass = $state("STANDARD");
    let newDeletionProtectionEnabled = $state(false);
    let createTableLoading = $state(false);

    let tableToDelete = $state<string | null>(null);
    let showDeleteModal = $state(false);
    let deleteTableLoading = $state(false);

    $effect(() => {
        if (tableToDelete) showDeleteModal = true;
    });

    $effect(() => {
        if (!showDeleteModal) tableToDelete = null;
    });

    let __loadTables_loaded = false;
    $effect(() => {
        if (aws.dynamodb && !__loadTables_loaded) {
            __loadTables_loaded = true;
            loadTables();
        }
    });

    $effect(() => {
        titleService.setResource("", undefined, $page.url.pathname);
    });

    // --- Pagination Helpers ---
    function pushToken(history: any[], currentNextToken?: any) {
        if (!currentNextToken) return;
        if (
            JSON.stringify(history[history.length - 1]) !==
            JSON.stringify(currentNextToken)
        ) {
            history.push(currentNextToken);
        }
    }
    function popToken(history: any[]) {
        history.pop();
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    async function loadTables(token?: string) {
        if (!aws.dynamodb) return;
        try {
            loading = true;
            error = "";
            actionMsg = "";
            const resp = await aws.dynamodb.send(
                new ListTablesCommand({
                    Limit: 100,
                    ExclusiveStartTableName: token,
                }),
            );
            const names = resp.TableNames ?? [];
            const details: any[] = [];
            for (const name of names) {
                try {
                    const desc = await aws.dynamodb.send(
                        new DescribeTableCommand({ TableName: name }),
                    );
                    const t = desc.Table;
                    if (t) {
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
            loading = false;
        }
    }

    async function handleCreateTable() {
        if (!aws.dynamodb || !newTableName || !newPkName) return;
        try {
            createTableLoading = true;
            error = "";
            actionMsg = "";

            const AttributeDefinitions = [
                { AttributeName: newPkName, AttributeType: newPkType },
            ];
            const KeySchema: any[] = [
                { AttributeName: newPkName, KeyType: "HASH" },
            ];

            if (hasSk && newSkName) {
                AttributeDefinitions.push({
                    AttributeName: newSkName,
                    AttributeType: newSkType,
                });
                KeySchema.push({ AttributeName: newSkName, KeyType: "RANGE" });
            }

            const input: any = {
                TableName: newTableName,
                AttributeDefinitions,
                KeySchema,
                BillingMode: billingMode,
                DeletionProtectionEnabled: newDeletionProtectionEnabled,
                TableClass: newTableClass,
            };

            if (billingMode === "PROVISIONED") {
                input.ProvisionedThroughput = {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5,
                };
            }

            await aws.dynamodb.send(new CreateTableCommand(input));
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
            newDeletionProtectionEnabled = false;
            newTableClass = "STANDARD";
            loadTables();
        } catch (e) {
            error = String(e);
        } finally {
            createTableLoading = false;
        }
    }

    async function confirmDeleteTable() {
        if (!aws.dynamodb || !tableToDelete) return;
        try {
            deleteTableLoading = true;
            error = "";
            actionMsg = "";
            await aws.dynamodb.send(
                new DeleteTableCommand({ TableName: tableToDelete }),
            );
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

    function formatBytes(b: number | string) {
        const num = Number(b);
        if (num === 0 || isNaN(num)) return "0 B";
        const k = 1024;
        const s = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(num) / Math.log(k));
        return parseFloat((num / Math.pow(k, i)).toFixed(1)) + " " + s[i];
    }

    function handleSelectTable(name: string) {
        goto(`/dynamodb/table/${encodeURIComponent(name)}`);
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
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

    <div class="flex-1 min-h-0 {error || actionMsg ? 'pt-8' : ''}">
        <PaginatedTable
            items={tables}
            {loading}
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
                    onClick: (item) => handleSelectTable(item.name),
                },
                {
                    key: "status",
                    label: "Status",
                    format: (v) => (v === "ACTIVE" ? "🟢 ACTIVE" : `⚪ ${v}`),
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
                    onclick={() => (showCreateTable = true)}
                    class="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1"
                >
                    + Create Table
                </button>
            {/snippet}
            {#snippet actionsSnippet(item)}
                <div class="flex gap-1 justify-end">
                    <button
                        onclick={() => (tableToDelete = item.name)}
                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                        >Delete</button
                    >
                </div>
            {/snippet}
        </PaginatedTable>
    </div>
</div>

<Modal bind:open={showCreateTable} title="Create Table">
    <div class="space-y-4">
        <div>
            <label class="block text-xs font-bold text-gray-400 mb-1"
                >Table Name</label
            >
            <input
                bind:value={newTableName}
                class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                placeholder="MyTable"
            />
        </div>
        <div>
            <label class="block text-xs font-bold text-gray-400 mb-1"
                >Partition Key</label
            >
            <div class="flex gap-2">
                <input
                    bind:value={newPkName}
                    class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                    placeholder="PK Attribute Name"
                />
                <select
                    bind:value={newPkType}
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
                    bind:checked={hasSk}
                    class="accent-blue-500"
                />
                Add Sort Key
            </label>
            {#if hasSk}
                <div class="flex gap-2">
                    <input
                        bind:value={newSkName}
                        class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
                        placeholder="SK Attribute Name"
                    />
                    <select
                        bind:value={newSkType}
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
                >Capacity Mode</label
            >
            <select
                bind:value={billingMode}
                class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
            >
                <option value="PAY_PER_REQUEST"
                    >On-demand (PAY_PER_REQUEST)</option
                >
                <option value="PROVISIONED"
                    >Provisioned (5 RCU / 5 WCU default)</option
                >
            </select>
        </div>
        <div>
            <label class="block text-xs font-bold text-gray-400 mb-1"
                >Table Class</label
            >
            <select
                bind:value={newTableClass}
                class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500"
            >
                <option value="STANDARD">Standard</option>
                <option value="STANDARD_INFREQUENT_ACCESS"
                    >Standard-Infrequent Access</option
                >
            </select>
        </div>
        <div>
            <label
                class="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer hover:text-gray-200"
            >
                <input
                    type="checkbox"
                    bind:checked={newDeletionProtectionEnabled}
                    class="accent-blue-500"
                />
                Enable Deletion Protection
            </label>
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button
                onclick={() => (showCreateTable = false)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={handleCreateTable}
                disabled={createTableLoading || !newTableName || !newPkName}
                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if createTableLoading}<span class="animate-spin">⟳</span>{/if}
                Create
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showDeleteModal} title="Delete Table">
    <div class="space-y-4">
        <p class="text-sm text-gray-300">
            Are you sure you want to delete table <strong
                >{tableToDelete}</strong
            >? This action cannot be undone.
        </p>
        <div class="flex justify-end gap-2 mt-4">
            <button
                onclick={() => (tableToDelete = null)}
                class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition"
                >Cancel</button
            >
            <button
                onclick={confirmDeleteTable}
                disabled={deleteTableLoading}
                class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
            >
                {#if deleteTableLoading}<span class="animate-spin">⟳</span>{/if}
                Delete
            </button>
        </div>
    </div>
</Modal>
