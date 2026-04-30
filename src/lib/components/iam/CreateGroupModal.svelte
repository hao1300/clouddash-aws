<script lang="ts">
    import { aws } from "$lib/services/aws.svelte";
    import { CreateGroupCommand } from "@aws-sdk/client-iam";
    import Modal from "$lib/components/Modal.svelte";

    let {
        show = $bindable(false),
        onSaved = () => {}
    } = $props<{
        show: boolean;
        onSaved?: () => void;
    }>();

    let saving = $state(false);
    let groupName = $state("");
    let error = $state("");

    $effect(() => {
        if (show) {
            error = "";
            groupName = "";
        }
    });

    async function saveGroup() {
        if (!aws.iam || !groupName.trim()) return;
        saving = true;
        error = "";
        try {
            await aws.iam.send(new CreateGroupCommand({ GroupName: groupName.trim() }));
            show = false;
            onSaved();
        } catch(e: any) {
            error = e.message || String(e);
        } finally {
            saving = false;
        }
    }
</script>

<Modal bind:open={show} title="Create IAM Group" maxWidth="max-w-md">
    <div class="space-y-4 w-full flex flex-col">
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 text-xs rounded border border-red-500/30 shrink-0">
                {error}
            </div>
        {/if}
        <div class="shrink-0">
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Group Name</label>
            <input bind:value={groupName} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" placeholder="e.g. MyGroup" />
        </div>
        <div class="flex justify-end gap-2 pt-2 shrink-0">
            <button onclick={() => show = false} class="px-4 py-2 text-xs text-gray-400 hover:text-white transition">Cancel</button>
            <button onclick={saveGroup} disabled={saving || !groupName.trim()} class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow disabled:opacity-50 inline-flex items-center gap-2">
                {#if saving}<span class="animate-spin">⟳</span>{/if} Create Group
            </button>
        </div>
    </div>
</Modal>
