<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading } from "@mdi/js";

    import {
        DescribeKeyPairsCommand,
        CreateKeyPairCommand,
        DeleteKeyPairCommand,
    } from "@aws-sdk/client-ec2";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let keyPairs = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let showCreateModal = $state(false);
    let keyName = $state("");
    let createdKey = $state("");
    let creating = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.ec2 && !__initLoaded) {
            __initLoaded = true;
            loadKeyPairs();
        }
    });

    async function loadKeyPairs() {
        if (!aws.ec2) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ec2.send(new DescribeKeyPairsCommand({}));
            keyPairs = (res.KeyPairs ?? []).map((kp) => ({
                id: kp.KeyPairId,
                name: kp.KeyName,
                fingerprint: kp.KeyFingerprint,
                type: kp.KeyType,
                creation: kp.CreateTime?.toLocaleString() ?? "-",
            }));
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleCreate() {
        if (!aws.ec2 || !keyName) return;
        try {
            creating = true;
            const res = await aws.ec2.send(
                new CreateKeyPairCommand({ KeyName: keyName }),
            );
            createdKey = res.KeyMaterial || "No key material returned.";
            actionMsg = `Key pair ${keyName} created. COPY THE PRIVATE KEY NOW!`;
            loadKeyPairs();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            creating = false;
        }
    }

    async function handleDelete(id: string, name: string) {
        if (!aws.ec2 || !confirm(`Delete key pair ${name}?`)) return;
        try {
            loading = true;
            await aws.ec2.send(new DeleteKeyPairCommand({ KeyName: name }));
            actionMsg = `Key pair ${name} deleted.`;
            loadKeyPairs();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>
<div class="h-full flex flex-col overflow-hidden">
<TabBar
    tabs={[
        { id: "instances", label: "Instances", href: "/ec2/instances" },
        { id: "amis", label: "AMIs", href: "/ec2/amis" },
        { id: "volumes", label: "Volumes", href: "/ec2/volumes" },
        { id: "snapshots", label: "Snapshots", href: "/ec2/snapshots" },
        { id: "security-groups", label: "Security Groups", href: "/ec2/security-groups" },
        { id: "key-pairs", label: "Key Pairs", href: "/ec2/key-pairs" },
        { id: "elastic-ips", label: "Elastic IPs", href: "/ec2/elastic-ips" },
    ]}
    activeTab="key-pairs"
/>
<div class="flex-1 overflow-hidden relative">
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
        items={keyPairs}
        {loading}
        onRefresh={loadKeyPairs}
        columns={[
            { label: "Name", key: "name" },
            { label: "Key Pair ID", key: "id" },
            { label: "Fingerprint", key: "fingerprint" },
            { label: "Type", key: "type" },
            { label: "Created", key: "creation" },
        ]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => {
                    showCreateModal = true;
                    createdKey = "";
                }}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Create Key Pair</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => handleDelete(item.id, item.name)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Delete</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showCreateModal} title="Create Key Pair">
    <div class="space-y-4 p-4 text-gray-300">
        {#if !createdKey}
            <div>
                <label
                    class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                    >Key Name</label
                >
                <input
                    type="text"
                    bind:value={keyName}
                    class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
                />
            </div>
            <div class="flex justify-end pt-2">
                <button
                    onclick={handleCreate}
                    disabled={creating}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
                >
                    {#if creating}<Icon path={mdiLoading} size={14} class="animate-spin" />{/if} Create
                </button>
            </div>
        {:else}
            <div>
                <label
                    class="block text-[10px] font-bold text-red-500 uppercase mb-1 tracking-widest"
                    >Private Key Material (Save now!)</label
                >
                <textarea
                    readonly
                    class="w-full h-64 bg-black border border-red-900/40 rounded p-2 text-[10px] font-mono text-gray-300 whitespace-pre overflow-auto"
                    >{createdKey}</textarea
                >
            </div>
            <div class="flex justify-end pt-2">
                <button
                    onclick={() => (showCreateModal = false)}
                    class="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded text-xs font-bold transition"
                    >Close</button
                >
            </div>
        {/if}
    </div>
</Modal>
</div>
</div>
