<script lang="ts">
    import {
        ListSecretsCommand,
        type SecretListEntry,
    } from "@aws-sdk/client-secrets-manager";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";

    let secrets = $state<SecretListEntry[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    $effect(() => {
        if (aws.secretsManager && secrets.length === 0) {
            loadSecrets();
        }
    });

    async function loadSecrets(token?: string) {
        if (!aws.secretsManager) return;
        try {
            loading = true;
            error = "";
            const res = await aws.secretsManager.send(
                new ListSecretsCommand({ MaxResults: 50, NextToken: token }),
            );
            secrets = res.SecretList || [];
            if (token) history.push(token);
            marker = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleSelectSecret(secret: SecretListEntry) {
        goto(`/secretsmanager/details?id=${secret.Name}`);
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={secrets}
        {loading}
        onRefresh={() => {
            history = [];
            loadSecrets();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadSecrets(marker)}
        onPrev={() => {
            history.pop();
            loadSecrets(history[history.length - 1]);
        }}
        columns={[
            {
                label: "Name",
                key: "Name",
                onClick: (item) => handleSelectSecret(item),
            },
            { label: "Description", key: "Description" },
            {
                label: "Last Accessed",
                key: "LastAccessedDate",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
        ]}
    />
</div>
