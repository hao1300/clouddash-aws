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
        UpdateTableCommand,
        DescribeTimeToLiveCommand,
        UpdateTimeToLiveCommand,
        DescribeContinuousBackupsCommand,
        UpdateContinuousBackupsCommand,
        ListBackupsCommand,
        CreateBackupCommand,
        DeleteBackupCommand,
        RestoreTableFromBackupCommand,
    } from "@aws-sdk/client-dynamodb";
    import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: DynamoDBClient | null = $state(null);
    let error = $state("");
    let actionMsg = $state("");

    // --- Scan / Query shared ---
    let tableName = $state("");

    // --- Service Layout State ---
    let tabs = $derived([
        { id: "tables", label: "Tables" },
        ...(tableName ? [
            { id: "details", label: "Details" },
            { id: "explore", label: "Explore Items" },
            { id: "backups", label: "Backups" }
        ] : [])
    ]);
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

    // --- Backups State ---
    let backupsList = $state<any[]>([]);
    let backupsLoading = $state(false);
    let backupsTokenMap = $state<string[]>([]);
    let backupsCurrentToken = $state<string | undefined>(undefined);

    let pitrEnabled = $state(false);
    let pitrLoading = $state(false);

    let showCreateBackup = $state(false);
    let newBackupName = $state("");
    let createBackupLoading = $state(false);

    let backupToDelete = $state<any>(null);
    let deleteBackupLoading = $state(false);

    let showRestoreBackup = $state(false);
    let restoreSourceBackup = $state<any>(null);
    let restoreNewTableName = $state("");
    let restoreBackupLoading = $state(false);

    // --- Details Tab Modals ---
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
    let deleteIndexLoading = $state(false);

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
    let results = $state<any[]>([]);
    let resultLoading = $state(false);
    let resultTokenMap = $state<Record<string, any>[]>([]);
    let resultCurrentToken = $state<Record<string, any> | undefined>(undefined);

    // Scan params
    let scanFilter = $state("");
    let scanValues = $state(""); // Changed to string for input
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
    let queryScanIndexForward = $state(true); // true = ascending, false = descending

    let tableTtl = $state<any>(null);
    let tableTtlLoading = $state(false);

    let newTableClass = $state("STANDARD");
    let newDeletionProtectionEnabled = $state(false);

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
                DeletionProtectionEnabled: newDeletionProtectionEnabled,
                TableClass: newTableClass,
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
            newDeletionProtectionEnabled = false;
            newTableClass = "STANDARD";
            loadTables();
        } catch (e) {
            error = String(e);
        } finally {
            createTableLoading = false;
        }
    }

    async function handleUpdateCapacity() {
        if (!client || !tableName) return;
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

            await client.send(new UpdateTableCommand(input));
            actionMsg = `Successfully requested capacity update for ${tableName}.`;
            showEditCapacity = false;
            loadTables();
        } catch (e) {
            error = String(e);
        } finally {
            editCapacityLoading = false;
        }
    }

    async function handleCreateIndex() {
        if (!client || !tableName || !newIndexName || !newIndexPkName) return;
        try {
            createIndexLoading = true;
            error = "";
            actionMsg = "";

            const AttributeDefinitions = [
                { AttributeName: newIndexPkName, AttributeType: newIndexPkType },
            ];
            const KeySchema = [
                { AttributeName: newIndexPkName, KeyType: "HASH" },
            ];

            if (newIndexHasSk && newIndexSkName) {
                AttributeDefinitions.push({ AttributeName: newIndexSkName, AttributeType: newIndexSkType });
                KeySchema.push({ AttributeName: newIndexSkName, KeyType: "RANGE" });
            }

            // Need to merge new attribute definitions with existing ones
            // For simplicity in this UI, we just send the ones needed for this index,
            // but DynamoDB UpdateTable requires all AttributeDefinitions referenced by the table and ALL indexes to be present.
            // We get existing from activeSchema.
            const existingDefs = activeSchema?.AttributeDefinitions || [];
            const mergedDefs = [...existingDefs];
            for (const def of AttributeDefinitions) {
                if (!mergedDefs.find((d: any) => d.AttributeName === def.AttributeName)) {
                    mergedDefs.push(def);
                }
            }

            const Create: any = {
                IndexName: newIndexName,
                KeySchema,
                Projection: { ProjectionType: newIndexProjectionType },
            };

            // If table is PROVISIONED, index must specify ProvisionedThroughput.
            const isProvisioned = activeSchema?.BillingModeSummary?.BillingMode === "PROVISIONED" || !activeSchema?.BillingModeSummary?.BillingMode;
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

            await client.send(new UpdateTableCommand(input));
            actionMsg = `Successfully requested creation of index ${newIndexName}.`;
            showCreateIndex = false;

            // Reset state
            newIndexName = "";
            newIndexPkName = "";
            newIndexPkType = "S";
            newIndexHasSk = false;
            newIndexSkName = "";
            newIndexSkType = "S";
            newIndexProjectionType = "ALL";

            loadTables();
        } catch (e) {
            error = String(e);
        } finally {
            createIndexLoading = false;
        }
    }

    async function confirmDeleteIndex() {
        if (!client || !tableName || !indexToDelete) return;
        try {
            deleteIndexLoading = true;
            error = "";
            actionMsg = "";

            const input: any = {
                TableName: tableName,
                GlobalSecondaryIndexUpdates: [{
                    Delete: { IndexName: indexToDelete }
                }],
            };

            await client.send(new UpdateTableCommand(input));
            actionMsg = `Successfully requested deletion of index ${indexToDelete}.`;
            indexToDelete = null;
            loadTables();
        } catch (e) {
            error = String(e);
        } finally {
            deleteIndexLoading = false;
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

    async function loadBackups(token?: string) {
        if (!client || !tableName) return;
        try {
            backupsLoading = true;
            error = "";
            const resp = await client.send(
                new ListBackupsCommand({
                    TableName: tableName,
                    ExclusiveStartBackupArn: token,
                    Limit: 50,
                })
            );
            backupsList = resp.BackupSummaries ?? [];
            pushToken(backupsTokenMap, resp.LastEvaluatedBackupArn);
            backupsCurrentToken = resp.LastEvaluatedBackupArn;
        } catch (e) {
            error = String(e);
            backupsList = [];
        } finally {
            backupsLoading = false;
        }
    }

    async function createBackup() {
        if (!client || !tableName || !newBackupName) return;
        try {
            createBackupLoading = true;
            error = "";
            actionMsg = "";
            await client.send(
                new CreateBackupCommand({
                    TableName: tableName,
                    BackupName: newBackupName
                })
            );
            actionMsg = `Successfully requested creation of backup ${newBackupName}.`;
            showCreateBackup = false;
            newBackupName = "";
            backupsTokenMap = [];
            await loadBackups();
        } catch (e) {
            error = String(e);
        } finally {
            createBackupLoading = false;
        }
    }

    async function deleteBackup() {
        if (!client || !backupToDelete) return;
        try {
            deleteBackupLoading = true;
            error = "";
            actionMsg = "";
            await client.send(
                new DeleteBackupCommand({
                    BackupArn: backupToDelete.BackupArn
                })
            );
            actionMsg = `Successfully deleted backup ${backupToDelete.BackupName}.`;
            backupToDelete = null;
            backupsTokenMap = [];
            await loadBackups();
        } catch (e) {
            error = String(e);
        } finally {
            deleteBackupLoading = false;
        }
    }

    async function restoreBackup() {
        if (!client || !restoreSourceBackup || !restoreNewTableName) return;
        try {
            restoreBackupLoading = true;
            error = "";
            actionMsg = "";
            await client.send(
                new RestoreTableFromBackupCommand({
                    TargetTableName: restoreNewTableName,
                    BackupArn: restoreSourceBackup.BackupArn
                })
            );
            actionMsg = `Successfully requested restore of backup ${restoreSourceBackup.BackupName} to table ${restoreNewTableName}.`;
            showRestoreBackup = false;
            restoreSourceBackup = null;
            restoreNewTableName = "";
            activeTab = "tables";
            tablesTokenMap = [];
            await loadTables();
        } catch (e) {
            error = String(e);
        } finally {
            restoreBackupLoading = false;
        }
    }

    // --- Backups API ---
    async function loadContinuousBackups() {
        if (!client || !tableName) return;
        try {
            pitrLoading = true;
            error = "";
            const resp = await client.send(
                new DescribeContinuousBackupsCommand({ TableName: tableName })
            );
            const pitrStatus = resp.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus;
            pitrEnabled = pitrStatus === "ENABLED";
        } catch (e) {
            error = String(e);
            pitrEnabled = false;
        } finally {
            pitrLoading = false;
        }
    }

    async function togglePitr() {
        if (!client || !tableName) return;
        try {
            pitrLoading = true;
            error = "";
            actionMsg = "";
            const newState = !pitrEnabled;
            await client.send(
                new UpdateContinuousBackupsCommand({
                    TableName: tableName,
                    PointInTimeRecoverySpecification: {
                        PointInTimeRecoveryEnabled: newState
                    }
                })
            );
            actionMsg = `Successfully ${newState ? 'enabled' : 'disabled'} Point-in-time recovery.`;
            await loadContinuousBackups();
        } catch (e) {
            error = String(e);
        } finally {
            pitrLoading = false;
        }
    }

    $effect(() => {
        if (activeTab === "backups" && tableName && client) {
            loadContinuousBackups();
            loadBackups();
        }
    });

    // --- TTL API ---
    async function loadTtl() {
        if (!client || !tableName) return;
        try {
            tableTtlLoading = true;
            error = "";
            const resp = await client.send(
                new DescribeTimeToLiveCommand({ TableName: tableName })
            );
            tableTtl = resp.TimeToLiveDescription;
        } catch (e) {
            error = String(e);
            tableTtl = null;
        } finally {
            tableTtlLoading = false;
        }
    }

    $effect(() => {
        if (activeTab === "details" && tableName && client) {
            loadTtl();
        }
    });

    async function toggleDeletionProtection() {
        if (!client || !tableName || !activeSchema) return;
        try {
            error = "";
            actionMsg = "";
            const currentState = activeSchema.DeletionProtectionEnabled || false;
            await client.send(
                new UpdateTableCommand({
                    TableName: tableName,
                    DeletionProtectionEnabled: !currentState
                })
            );
            actionMsg = `Successfully ${!currentState ? 'enabled' : 'disabled'} deletion protection for ${tableName}.`;
            // Reload tables/schemas to update the details tab
            loadTables();
        } catch (e) {
            error = String(e);
        }
    }

    async function toggleTableClass() {
        if (!client || !tableName || !activeSchema) return;
        try {
            error = "";
            actionMsg = "";
            const currentClass = activeSchema.TableClassSummary?.TableClass || "STANDARD";
            const newClass = currentClass === "STANDARD" ? "STANDARD_INFREQUENT_ACCESS" : "STANDARD";
            await client.send(
                new UpdateTableCommand({
                    TableName: tableName,
                    TableClass: newClass
                })
            );
            actionMsg = `Successfully requested table class update to ${newClass} for ${tableName}.`;
            loadTables();
        } catch (e) {
            error = String(e);
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
                    Limit: scanLimit,
                    ConsistentRead: scanConsistentRead,
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

            let consistentRead = queryConsistentRead;
            // GSI does not support ConsistentRead=true
            if (queryIndex) {
                const isGsi = activeSchema?.GlobalSecondaryIndexes?.some(
                    (i: any) => i.IndexName === queryIndex
                );
                if (isGsi) {
                    consistentRead = false;
                }
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
                    Limit: queryLimit,
                    ConsistentRead: consistentRead,
                    ScanIndexForward: queryScanIndexForward,
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
                            activeTab = "details";
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
                            activeTab = "details";
                        }}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                        >Details</button
                    >
                    <button
                        onclick={() => {
                            tableName = item.name;
                            activeTab = "explore";
                            exploreMode = "scan";
                        }}
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition ml-1"
                        >Explore</button
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
                            <div class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-400 font-mono flex items-center">
                                <span>Table: <strong class="text-blue-300">{tableName}</strong></span>
                            </div>
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
                        <div class="flex items-center gap-4 mt-2">
                            <label class="flex items-center gap-2 text-xs text-gray-400">
                                Limit:
                                <input type="number" min="1" max="1000" bind:value={scanLimit} class="w-20 bg-gray-950 text-xs p-1 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" />
                            </label>
                            <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-200">
                                <input type="checkbox" bind:checked={scanConsistentRead} class="accent-blue-500" />
                                Consistent Read
                            </label>
                        </div>
                    {:else}
                        <div class="flex gap-2">
                            <div class="flex-1 bg-gray-950 text-xs p-2 rounded border border-gray-700 text-gray-400 font-mono flex items-center">
                                <span>Table: <strong class="text-blue-300">{tableName}</strong></span>
                            </div>
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

                            <div class="flex items-center gap-4 mt-2">
                                <label class="flex items-center gap-2 text-xs text-gray-400">
                                    Limit:
                                    <input type="number" min="1" max="1000" bind:value={queryLimit} class="w-20 bg-gray-950 text-xs p-1 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" />
                                </label>
                                <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-200" title="Not available for Global Secondary Indexes">
                                    <input type="checkbox" bind:checked={queryConsistentRead} class="accent-blue-500" />
                                    Consistent Read
                                </label>
                                <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-200">
                                    <input type="checkbox" bind:checked={queryScanIndexForward} class="accent-blue-500" />
                                    Sort Ascending
                                </label>
                            </div>
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
        {:else if activeTab === "details" && activeSchema}
            <div class="h-full flex flex-col p-4 pr-1 bg-gray-950 overflow-auto">
                <div class="space-y-4 max-w-5xl">
                    <!-- Basic Info -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm">
                        <h3 class="text-sm font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2">Table Details</h3>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                            <div>
                                <div class="text-gray-500 font-medium mb-1">Table Name</div>
                                <div class="text-gray-300">{activeSchema.TableName}</div>
                            </div>
                            <div>
                                <div class="text-gray-500 font-medium mb-1">Status</div>
                                <div class="text-gray-300">
                                    <span class={activeSchema.TableStatus === 'ACTIVE' ? 'text-green-400' : 'text-yellow-400'}>
                                        {activeSchema.TableStatus === 'ACTIVE' ? '🟢' : '⚪'} {activeSchema.TableStatus}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div class="text-gray-500 font-medium mb-1">Creation Date</div>
                                <div class="text-gray-300">{activeSchema.CreationDateTime ? new Date(activeSchema.CreationDateTime).toLocaleString() : '-'}</div>
                            </div>
                            <div>
                                <div class="text-gray-500 font-medium mb-1">Item Count</div>
                                <div class="text-gray-300">{activeSchema.ItemCount ? Number(activeSchema.ItemCount).toLocaleString() : 0}</div>
                            </div>
                            <div>
                                <div class="text-gray-500 font-medium mb-1">Table Size</div>
                                <div class="text-gray-300">{formatBytes(activeSchema.TableSizeBytes || 0)}</div>
                            </div>
                            <div class="col-span-2 md:col-span-3">
                                <div class="text-gray-500 font-medium mb-1">Table ARN</div>
                                <div class="text-gray-300 font-mono text-[10px] break-all bg-black/50 p-1.5 rounded">{activeSchema.TableArn || '-'}</div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 col-span-2 md:col-span-3">
                                <div class="text-gray-500 font-medium">Deletion Protection:</div>
                                <div class="text-gray-300">
                                    <span class={activeSchema.DeletionProtectionEnabled ? 'text-green-400' : 'text-gray-500'}>
                                        {activeSchema.DeletionProtectionEnabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                                <button
                                    onclick={toggleDeletionProtection}
                                    class="bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded text-[10px] font-medium text-gray-200 transition-colors ml-2"
                                >
                                    Toggle
                                </button>
                            </div>
                            <div class="flex items-center gap-2 col-span-2 md:col-span-3">
                                <div class="text-gray-500 font-medium">Table Class:</div>
                                <div class="text-gray-300 font-mono text-[11px]">
                                    {activeSchema.TableClassSummary?.TableClass || 'STANDARD'}
                                </div>
                                <button
                                    onclick={toggleTableClass}
                                    class="bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded text-[10px] font-medium text-gray-200 transition-colors ml-2"
                                >
                                    Toggle
                                </button>
                            </div>

                            <!-- TTL Information -->
                            <div class="flex items-center gap-2 col-span-2 md:col-span-3 mt-2 border-t border-gray-800 pt-2">
                                <div class="text-gray-500 font-medium">Time To Live (TTL):</div>
                                {#if tableTtlLoading}
                                    <div class="text-gray-400 animate-pulse text-xs">Loading...</div>
                                {:else if tableTtl}
                                    <div class="text-gray-300 flex items-center gap-2 text-xs">
                                        <span class={tableTtl.TimeToLiveStatus === 'ENABLED' ? 'text-green-400' : tableTtl.TimeToLiveStatus === 'DISABLED' ? 'text-red-400' : 'text-yellow-400'}>
                                            {tableTtl.TimeToLiveStatus || 'UNKNOWN'}
                                        </span>
                                        {#if tableTtl.AttributeName}
                                            <span class="text-gray-500">|</span>
                                            <span>Attribute: <code class="bg-black px-1 rounded font-mono text-blue-300">{tableTtl.AttributeName}</code></span>
                                        {/if}
                                    </div>
                                {:else}
                                    <div class="text-gray-500 text-xs">Not Configured / Unknown</div>
                                {/if}
                            </div>

                        </div>
                    </div>

                    <!-- Capacity and Billing -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm">
                        <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
                            <h3 class="text-sm font-bold text-gray-200">Capacity and Billing</h3>
                            <button
                                onclick={() => {
                                    editBillingMode = activeSchema.BillingModeSummary?.BillingMode || "PROVISIONED";
                                    editReadCapacity = activeSchema.ProvisionedThroughput?.ReadCapacityUnits || 5;
                                    editWriteCapacity = activeSchema.ProvisionedThroughput?.WriteCapacityUnits || 5;
                                    showEditCapacity = true;
                                }}
                                class="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-xs font-medium text-gray-200 transition-colors"
                            >
                                Edit Capacity
                            </button>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                            <div>
                                <div class="text-gray-500 font-medium mb-1">Billing Mode</div>
                                <div class="text-gray-300">
                                    {activeSchema.BillingModeSummary?.BillingMode || 'PROVISIONED'}
                                </div>
                            </div>
                            <div>
                                <div class="text-gray-500 font-medium mb-1">Read Capacity (RCU)</div>
                                <div class="text-gray-300">
                                    {(activeSchema.BillingModeSummary?.BillingMode === 'PAY_PER_REQUEST') ? '-' : (activeSchema.ProvisionedThroughput?.ReadCapacityUnits ?? '-')}
                                </div>
                            </div>
                            <div>
                                <div class="text-gray-500 font-medium mb-1">Write Capacity (WCU)</div>
                                <div class="text-gray-300">
                                    {(activeSchema.BillingModeSummary?.BillingMode === 'PAY_PER_REQUEST') ? '-' : (activeSchema.ProvisionedThroughput?.WriteCapacityUnits ?? '-')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Global Secondary Indexes -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm">
                        <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
                            <h3 class="text-sm font-bold text-gray-200">Global Secondary Indexes</h3>
                            <button
                                onclick={() => showCreateIndex = true}
                                class="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-xs font-bold text-white transition-colors"
                            >
                                + Create Index
                            </button>
                        </div>

                        {#if !activeSchema.GlobalSecondaryIndexes || activeSchema.GlobalSecondaryIndexes.length === 0}
                            <div class="text-xs text-gray-500 italic py-2">No Global Secondary Indexes found.</div>
                        {:else}
                            <div class="space-y-4">
                                {#each activeSchema.GlobalSecondaryIndexes as gsi}
                                    <div class="border border-gray-800 rounded p-3 bg-gray-950 flex flex-col md:flex-row gap-4 items-start md:items-center">
                                        <div class="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                            <div>
                                                <div class="text-gray-500 font-medium mb-1">Index Name</div>
                                                <div class="text-gray-300 font-mono text-[11px]">{gsi.IndexName}</div>
                                            </div>
                                            <div>
                                                <div class="text-gray-500 font-medium mb-1">Status</div>
                                                <div class="text-gray-300">
                                                    <span class={gsi.IndexStatus === 'ACTIVE' ? 'text-green-400' : 'text-yellow-400'}>
                                                        {gsi.IndexStatus === 'ACTIVE' ? '🟢' : '⚪'} {gsi.IndexStatus || '-'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div>
                                                <div class="text-gray-500 font-medium mb-1">Projection</div>
                                                <div class="text-gray-300">{gsi.Projection?.ProjectionType || '-'}</div>
                                            </div>
                                            <div>
                                                <div class="text-gray-500 font-medium mb-1">Keys</div>
                                                <div class="text-gray-300 font-mono text-[10px]">
                                                    PK: {gsi.KeySchema?.find((k: any) => k.KeyType === 'HASH')?.AttributeName || '-'}<br/>
                                                    SK: {gsi.KeySchema?.find((k: any) => k.KeyType === 'RANGE')?.AttributeName || '-'}
                                                </div>
                                            </div>
                                        </div>
                                        <div class="shrink-0 flex gap-2">
                                            <button
                                                onclick={() => indexToDelete = gsi.IndexName}
                                                class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <!-- Local Secondary Indexes -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm">
                        <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
                            <h3 class="text-sm font-bold text-gray-200">Local Secondary Indexes</h3>
                        </div>

                        {#if !activeSchema.LocalSecondaryIndexes || activeSchema.LocalSecondaryIndexes.length === 0}
                            <div class="text-xs text-gray-500 italic py-2">No Local Secondary Indexes found.</div>
                        {:else}
                            <div class="space-y-4">
                                {#each activeSchema.LocalSecondaryIndexes as lsi}
                                    <div class="border border-gray-800 rounded p-3 bg-gray-950 flex flex-col md:flex-row gap-4 items-start md:items-center">
                                        <div class="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                            <div>
                                                <div class="text-gray-500 font-medium mb-1">Index Name</div>
                                                <div class="text-gray-300 font-mono text-[11px]">{lsi.IndexName}</div>
                                            </div>
                                            <div>
                                                <div class="text-gray-500 font-medium mb-1">Status</div>
                                                <div class="text-gray-300">
                                                    <span class={lsi.IndexStatus === 'ACTIVE' ? 'text-green-400' : 'text-yellow-400'}>
                                                        {lsi.IndexStatus === 'ACTIVE' ? '🟢' : '⚪'} {lsi.IndexStatus || '-'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div>
                                                <div class="text-gray-500 font-medium mb-1">Projection</div>
                                                <div class="text-gray-300">{lsi.Projection?.ProjectionType || '-'}</div>
                                            </div>
                                            <div>
                                                <div class="text-gray-500 font-medium mb-1">Keys</div>
                                                <div class="text-gray-300 font-mono text-[10px]">
                                                    PK: {lsi.KeySchema?.find((k: any) => k.KeyType === 'HASH')?.AttributeName || '-'}<br/>
                                                    SK: {lsi.KeySchema?.find((k: any) => k.KeyType === 'RANGE')?.AttributeName || '-'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                </div>
            </div>
        {:else if activeTab === "backups" && tableName}
            <div class="h-full flex flex-col p-4 pr-1 bg-gray-950 overflow-auto">
                <div class="space-y-4 max-w-5xl">
                    <!-- Point-in-time recovery -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm flex items-center justify-between">
                        <div>
                            <h3 class="text-sm font-bold text-gray-200 mb-1">Point-in-time recovery (PITR)</h3>
                            <p class="text-xs text-gray-400">Continuous backups protect your tables from accidental write or delete operations. Restore to any second in the preceding 35 days.</p>
                            <div class="mt-2 text-xs">
                                Status:
                                {#if pitrLoading}
                                    <span class="text-gray-500 animate-pulse">Loading...</span>
                                {:else if pitrEnabled}
                                    <span class="text-green-400 font-bold">Enabled</span>
                                {:else}
                                    <span class="text-gray-500 font-bold">Disabled</span>
                                {/if}
                            </div>
                        </div>
                        <button
                            onclick={togglePitr}
                            disabled={pitrLoading}
                            class="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-3 py-1.5 rounded text-xs font-medium text-gray-200 transition flex items-center gap-1"
                        >
                            {#if pitrLoading}<span class="animate-spin">⟳</span>{/if}
                            {pitrEnabled ? 'Disable' : 'Enable'} PITR
                        </button>
                    </div>

                    <!-- On-Demand Backups -->
                    <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-sm flex-1 min-h-[400px] flex flex-col">
                        <div class="p-4 border-b border-gray-800 flex items-center justify-between shrink-0">
                            <div>
                                <h3 class="text-sm font-bold text-gray-200">On-demand backups</h3>
                                <p class="text-[11px] text-gray-400">Create full backups of your tables for long-term retention and archival for regulatory compliance.</p>
                            </div>
                            <button
                                onclick={() => showCreateBackup = true}
                                class="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 shrink-0"
                            >
                                + Create Backup
                            </button>
                        </div>
                        <div class="flex-1 min-h-0 overflow-hidden">
                            <PaginatedTable
                                items={backupsList}
                                loading={backupsLoading}
                                hasNext={!!backupsCurrentToken}
                                hasPrev={backupsTokenMap.length > 0}
                                onNext={() => loadBackups(backupsCurrentToken)}
                                onPrev={() => loadBackups(popToken(backupsTokenMap))}
                                onRefresh={() => {
                                    backupsTokenMap = [];
                                    loadBackups();
                                }}
                                columns={[
                                    { key: "BackupName", label: "Backup Name" },
                                    { key: "BackupStatus", label: "Status", format: (v) => v === "AVAILABLE" ? "🟢 AVAILABLE" : `⚪ ${v}` },
                                    { key: "BackupCreationDateTime", label: "Creation Date", format: (v) => v ? new Date(v).toLocaleString() : "-" },
                                    { key: "BackupSizeBytes", label: "Size", format: formatBytes }
                                ]}
                            >
                                {#snippet actionsSnippet(item)}
                                    <button
                                        onclick={() => { restoreSourceBackup = item; showRestoreBackup = true; }}
                                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                                    >
                                        Restore
                                    </button>
                                    <button
                                        onclick={() => backupToDelete = item}
                                        class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition ml-1"
                                    >
                                        Delete
                                    </button>
                                {/snippet}
                            </PaginatedTable>
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <!-- Modals -->
    {#if showCreateBackup}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-sm flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                    <h3 class="font-bold text-gray-200">Create Backup</h3>
                    <button onclick={() => showCreateBackup = false} class="text-gray-400 hover:text-gray-200 transition-colors">✕</button>
                </div>
                <div class="p-4 space-y-4">
                    <div>
                        <label for="createBackupName" class="block text-xs font-bold text-gray-400 mb-1">Backup Name</label>
                        <input id="createBackupName" bind:value={newBackupName} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" placeholder="MyBackup" />
                    </div>
                </div>
                <div class="p-4 border-t border-gray-800 shrink-0 flex justify-end gap-2">
                    <button onclick={() => showCreateBackup = false} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={createBackup} disabled={createBackupLoading || !newBackupName} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if createBackupLoading}<span class="animate-spin">⟳</span>{/if} Create
                    </button>
                </div>
            </div>
        </div>
    {/if}
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
                    <div>
                        <label class="block text-xs font-bold text-gray-400 mb-1">Table Class</label>
                        <select bind:value={newTableClass} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500">
                            <option value="STANDARD">Standard</option>
                            <option value="STANDARD_INFREQUENT_ACCESS">Standard-Infrequent Access</option>
                        </select>
                    </div>
                    <div>
                        <label class="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer hover:text-gray-200">
                            <input type="checkbox" bind:checked={newDeletionProtectionEnabled} class="accent-blue-500" />
                            Enable Deletion Protection
                        </label>
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

    {#if backupToDelete}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-sm flex flex-col">
                <div class="p-4 border-b border-gray-800">
                    <h3 class="font-bold text-red-400">Delete Backup</h3>
                </div>
                <div class="p-4">
                    <p class="text-sm text-gray-300">Are you sure you want to delete backup <strong>{backupToDelete.BackupName}</strong>? This action cannot be undone.</p>
                </div>
                <div class="p-4 border-t border-gray-800 flex justify-end gap-2">
                    <button onclick={() => backupToDelete = null} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={deleteBackup} disabled={deleteBackupLoading} class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if deleteBackupLoading}<span class="animate-spin">⟳</span>{/if} Delete
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showRestoreBackup && restoreSourceBackup}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-sm flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                    <h3 class="font-bold text-gray-200">Restore Backup</h3>
                    <button onclick={() => showRestoreBackup = false} class="text-gray-400 hover:text-gray-200 transition-colors">✕</button>
                </div>
                <div class="p-4 space-y-4">
                    <p class="text-sm text-gray-300">Restoring from backup <strong>{restoreSourceBackup.BackupName}</strong>.</p>
                    <div>
                        <label for="restoreNewTableName" class="block text-xs font-bold text-gray-400 mb-1">New Table Name</label>
                        <input id="restoreNewTableName" bind:value={restoreNewTableName} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" placeholder="NewTableName" />
                    </div>
                </div>
                <div class="p-4 border-t border-gray-800 shrink-0 flex justify-end gap-2">
                    <button onclick={() => showRestoreBackup = false} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={restoreBackup} disabled={restoreBackupLoading || !restoreNewTableName} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if restoreBackupLoading}<span class="animate-spin">⟳</span>{/if} Restore
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
    {#if showEditCapacity}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-md flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                    <h3 class="font-bold text-gray-200">Edit Capacity</h3>
                    <button onclick={() => showEditCapacity = false} class="text-gray-400 hover:text-gray-200 transition-colors">✕</button>
                </div>
                <div class="p-4 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 mb-1">Capacity Mode</label>
                        <select bind:value={editBillingMode} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500">
                            <option value="PAY_PER_REQUEST">On-demand (PAY_PER_REQUEST)</option>
                            <option value="PROVISIONED">Provisioned</option>
                        </select>
                    </div>
                    {#if editBillingMode === "PROVISIONED"}
                        <div class="flex gap-4">
                            <div class="flex-1">
                                <label class="block text-xs font-bold text-gray-400 mb-1">Read Capacity (RCU)</label>
                                <input type="number" min="1" bind:value={editReadCapacity} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" />
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs font-bold text-gray-400 mb-1">Write Capacity (WCU)</label>
                                <input type="number" min="1" bind:value={editWriteCapacity} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" />
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="p-4 border-t border-gray-800 shrink-0 flex justify-end gap-2">
                    <button onclick={() => showEditCapacity = false} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={handleUpdateCapacity} disabled={editCapacityLoading} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if editCapacityLoading}<span class="animate-spin">⟳</span>{/if} Save
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showCreateIndex}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-md flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
                    <h3 class="font-bold text-gray-200">Create Global Secondary Index</h3>
                    <button onclick={() => showCreateIndex = false} class="text-gray-400 hover:text-gray-200 transition-colors">✕</button>
                </div>
                <div class="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 mb-1">Index Name</label>
                        <input bind:value={newIndexName} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" placeholder="MyGSI" />
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 mb-1">Partition Key</label>
                        <div class="flex gap-2">
                            <input bind:value={newIndexPkName} class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" placeholder="PK Attribute Name" />
                            <select bind:value={newIndexPkType} class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 w-24">
                                <option value="S">String</option>
                                <option value="N">Number</option>
                                <option value="B">Binary</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="flex items-center gap-2 text-xs font-bold text-gray-400 mb-2 cursor-pointer hover:text-gray-200">
                            <input type="checkbox" bind:checked={newIndexHasSk} class="accent-blue-500" />
                            Add Sort Key
                        </label>
                        {#if newIndexHasSk}
                            <div class="flex gap-2">
                                <input bind:value={newIndexSkName} class="flex-1 bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" placeholder="SK Attribute Name" />
                                <select bind:value={newIndexSkType} class="bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500 w-24">
                                    <option value="S">String</option>
                                    <option value="N">Number</option>
                                    <option value="B">Binary</option>
                                </select>
                            </div>
                        {/if}
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 mb-1">Projection Type</label>
                        <select bind:value={newIndexProjectionType} class="w-full bg-black text-xs p-2 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500">
                            <option value="ALL">ALL (All table attributes)</option>
                            <option value="KEYS_ONLY">KEYS_ONLY (Only index and primary keys)</option>
                        </select>
                    </div>
                </div>
                <div class="p-4 border-t border-gray-800 shrink-0 flex justify-end gap-2">
                    <button onclick={() => showCreateIndex = false} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={handleCreateIndex} disabled={createIndexLoading || !newIndexName || !newIndexPkName} class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if createIndexLoading}<span class="animate-spin">⟳</span>{/if} Create Index
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if indexToDelete}
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div class="bg-gray-900 border border-gray-800 rounded-lg shadow-xl w-full max-w-sm flex flex-col">
                <div class="p-4 border-b border-gray-800">
                    <h3 class="font-bold text-red-400">Delete Index</h3>
                </div>
                <div class="p-4">
                    <p class="text-sm text-gray-300">Are you sure you want to delete the index <strong>{indexToDelete}</strong>? This action cannot be undone.</p>
                </div>
                <div class="p-4 border-t border-gray-800 flex justify-end gap-2">
                    <button onclick={() => indexToDelete = null} class="px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 transition">Cancel</button>
                    <button onclick={confirmDeleteIndex} disabled={deleteIndexLoading} class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2">
                        {#if deleteIndexLoading}<span class="animate-spin">⟳</span>{/if} Delete
                    </button>
                </div>
            </div>
        </div>
    {/if}

</ServiceLayout>
