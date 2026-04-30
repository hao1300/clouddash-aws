<script lang="ts">
    import { aws } from "$lib/services/aws.svelte";
    import { CreateRoleCommand } from "@aws-sdk/client-iam";
    import Modal from "$lib/components/Modal.svelte";
    import JsonEditor from "$lib/components/JsonEditor.svelte";

    let {
        show = $bindable(false),
        onSaved = () => {}
    } = $props<{
        show: boolean;
        onSaved?: () => void;
    }>();

    let saving = $state(false);
    let roleName = $state("");
    let trustPolicyStr = $state("");
    let error = $state("");

    $effect(() => {
        if (show) {
            error = "";
            roleName = "";
            trustPolicyStr = "{\n  \"Version\": \"2012-10-17\",\n  \"Statement\": [\n    {\n      \"Effect\": \"Allow\",\n      \"Principal\": {\n        \"Service\": \"ec2.amazonaws.com\"\n      },\n      \"Action\": \"sts:AssumeRole\"\n    }\n  ]\n}";
        }
    });

    async function saveRole() {
        if (!aws.iam || !roleName.trim()) return;
        saving = true;
        error = "";
        try {
            try { JSON.parse(trustPolicyStr); } catch (e: any) { throw new Error("Invalid JSON: " + e.message); }
            await aws.iam.send(new CreateRoleCommand({ RoleName: roleName.trim(), AssumeRolePolicyDocument: trustPolicyStr }));
            show = false;
            onSaved();
        } catch(e: any) {
            error = e.message || String(e);
        } finally {
            saving = false;
        }
    }
</script>

<Modal bind:open={show} title="Create IAM Role" maxWidth="max-w-3xl">
    <div class="space-y-4 w-full h-[60vh] flex flex-col">
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 text-xs rounded border border-red-500/30 shrink-0">
                {error}
            </div>
        {/if}
        <div class="shrink-0">
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Role Name</label>
            <input bind:value={roleName} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" placeholder="e.g. MyRole" />
        </div>
        <div class="flex-1 rounded overflow-hidden min-h-0 border border-gray-700 flex flex-col">
            <label class="block text-[10px] font-bold text-gray-500 uppercase p-2 shrink-0 bg-gray-900 border-b border-gray-700">Trust Policy (AssumeRolePolicyDocument)</label>
            <div class="flex-1 min-h-0">
                <JsonEditor bind:value={trustPolicyStr} />
            </div>
        </div>
        <div class="flex justify-end gap-2 pt-2 shrink-0">
            <button onclick={() => show = false} class="px-4 py-2 text-xs text-gray-400 hover:text-white transition">Cancel</button>
            <button onclick={saveRole} disabled={saving || !roleName.trim()} class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow disabled:opacity-50 inline-flex items-center gap-2">
                {#if saving}<span class="animate-spin">⟳</span>{/if} Create Role
            </button>
        </div>
    </div>
</Modal>
