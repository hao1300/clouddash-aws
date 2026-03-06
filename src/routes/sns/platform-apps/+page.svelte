<script lang="ts">
    import {
        ListPlatformApplicationsCommand,
        CreatePlatformApplicationCommand,
        DeletePlatformApplicationCommand,
        type PlatformApplication,
    } from "@aws-sdk/client-sns";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let apps = $state<PlatformApplication[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    // Create Modal
    let showCreateModal = $state(false);
    let newName = $state("");
    let platform = $state("GCM");
    let principal = $state("");
    let credential = $state("");
    let creating = $state(false);

    $effect(() => {
        if (aws.sns && apps.length === 0) {
            loadApps();
        }
    });

    async function loadApps(token?: string) {
        if (!aws.sns) return;
        try {
            loading = true;
            error = "";
            const res = await aws.sns.send(
                new ListPlatformApplicationsCommand({ NextToken: token }),
            );
            apps = res.PlatformApplications || [];
            if (token) history.push(token);
            marker = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreate() {
        if (!aws.sns || !newName || !credential) return;
        try {
            creating = true;
            await aws.sns.send(
                new CreatePlatformApplicationCommand({
                    Name: newName,
                    Platform: platform,
                    Attributes: {
                        ...(principal ? { PlatformPrincipal: principal } : {}),
                        PlatformCredential: credential,
                    },
                }),
            );
            actionMsg = `Platform application ${newName} created.`;
            showCreateModal = false;
            newName = "";
            platform = "GCM";
            principal = "";
            credential = "";
            loadApps();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(arn: string) {
        if (!aws.sns || !confirm("Delete this platform application?")) return;
        try {
            loading = true;
            await aws.sns.send(
                new DeletePlatformApplicationCommand({
                    PlatformApplicationArn: arn,
                }),
            );
            actionMsg = "Platform application deleted.";
            loadApps();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
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

    <PaginatedTable
        items={apps}
        {loading}
        onRefresh={() => {
            history = [];
            loadApps();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadApps(marker)}
        onPrev={() => {
            history.pop();
            loadApps(history[history.length - 1]);
        }}
        columns={[{ label: "Application ARN", key: "PlatformApplicationArn" }]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showCreateModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Create App</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => handleDelete(item.PlatformApplicationArn!)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Delete</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Platform Application">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Application Name</label
            >
            <input
                type="text"
                bind:value={newName}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Platform</label
            >
            <select
                bind:value={platform}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            >
                <option value="ADM">ADM</option>
                <option value="APNS">APNS</option>
                <option value="APNS_SANDBOX">APNS_SANDBOX</option>
                <option value="BAIDU">BAIDU</option>
                <option value="GCM">GCM</option>
                <option value="MPNS">MPNS</option>
                <option value="WNS">WNS</option>
            </select>
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Platform Principal</label
            >
            <input
                type="text"
                bind:value={principal}
                placeholder="API Key / Certificate"
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Platform Credential</label
            >
            <textarea
                bind:value={credential}
                rows="3"
                placeholder="Private Key / Client Secret"
                class="w-full bg-black border border-gray-700 rounded p-3 text-xs font-mono text-gray-300"
            ></textarea>
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleCreate}
                disabled={creating}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if creating}<span class="animate-spin">⟳</span>{/if} Create
            </button>
        </div>
    </div>
</Modal>
