<script lang="ts">
    import { aws } from "$lib/services/aws.svelte";
    import JsonEditor from "$lib/components/JsonEditor.svelte";
    import {
        GetUserPolicyCommand, PutUserPolicyCommand,
        GetRolePolicyCommand, PutRolePolicyCommand,
        GetGroupPolicyCommand, PutGroupPolicyCommand
    } from "@aws-sdk/client-iam";
    import Modal from "$lib/components/Modal.svelte";

    let {
        show = $bindable(false),
        type,
        entityName,
        policyName = null,
        onSaved = () => {}
    } = $props<{
        show: boolean;
        type: "User" | "Role" | "Group";
        entityName: string;
        policyName: string | null;
        onSaved?: () => void;
    }>();

    let loading = $state(false);
    let saving = $state(false);
    let policyDocStr = $state("{}");
    let editPolicyName = $state("");
    let error = $state("");

    $effect(() => {
        if (show) {
            error = "";
            if (policyName) {
                editPolicyName = policyName;
                loadPolicy();
            } else {
                editPolicyName = "";
                policyDocStr = "{\n  \"Version\": \"2012-10-17\",\n  \"Statement\": []\n}";
            }
        }
    });

    async function loadPolicy() {
        if (!aws.iam || !policyName) return;
        loading = true;
        try {
            let docStr = "";
            if (type === "User") {
                const res = await aws.iam.send(new GetUserPolicyCommand({ UserName: entityName, PolicyName: policyName }));
                docStr = decodeURIComponent(res.PolicyDocument || "");
            } else if (type === "Role") {
                const res = await aws.iam.send(new GetRolePolicyCommand({ RoleName: entityName, PolicyName: policyName }));
                docStr = decodeURIComponent(res.PolicyDocument || "");
            } else if (type === "Group") {
                const res = await aws.iam.send(new GetGroupPolicyCommand({ GroupName: entityName, PolicyName: policyName }));
                docStr = decodeURIComponent(res.PolicyDocument || "");
            }
            try {
                policyDocStr = JSON.stringify(JSON.parse(docStr), null, 4);
            } catch(e) {
                policyDocStr = docStr;
            }
        } catch(e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function savePolicy() {
        if (!aws.iam || !editPolicyName.trim()) return;
        saving = true;
        error = "";
        try {
            try { JSON.parse(policyDocStr); } catch (e: any) { throw new Error("Invalid JSON: " + e.message); }
            if (type === "User") {
                await aws.iam.send(new PutUserPolicyCommand({ UserName: entityName, PolicyName: editPolicyName.trim(), PolicyDocument: policyDocStr }));
            } else if (type === "Role") {
                await aws.iam.send(new PutRolePolicyCommand({ RoleName: entityName, PolicyName: editPolicyName.trim(), PolicyDocument: policyDocStr }));
            } else if (type === "Group") {
                await aws.iam.send(new PutGroupPolicyCommand({ GroupName: entityName, PolicyName: editPolicyName.trim(), PolicyDocument: policyDocStr }));
            }
            show = false;
            onSaved();
        } catch(e: any) {
            error = e.message || String(e);
        } finally {
            saving = false;
        }
    }
</script>

<Modal bind:open={show} title={policyName ? `Edit Inline Policy: ${policyName}` : 'Create Inline Policy'} maxWidth="max-w-3xl">
    <div class="space-y-4 w-full h-[60vh] flex flex-col">
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 text-xs rounded border border-red-500/30 shrink-0">
                {error}
            </div>
        {/if}
        {#if loading}
            <div class="text-center text-gray-400 py-10 flex-1 flex items-center justify-center">Loading policy document...</div>
        {:else}
            <div class="shrink-0">
                <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Policy Name</label>
                <input bind:value={editPolicyName} disabled={!!policyName} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 disabled:opacity-50 outline-none focus:border-blue-500" placeholder="e.g. MyInlinePolicy" />
            </div>
            <div class="flex-1 rounded overflow-hidden min-h-0 border border-gray-700">
                <JsonEditor bind:value={policyDocStr} />
            </div>
            <div class="flex justify-end gap-2 pt-2 shrink-0">
                <button onclick={() => show = false} class="px-4 py-2 text-xs text-gray-400 hover:text-white transition">Cancel</button>
                <button onclick={savePolicy} disabled={saving} class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow disabled:opacity-50 inline-flex items-center gap-2">
                    {#if saving}<span class="animate-spin">⟳</span>{/if} Save
                </button>
            </div>
        {/if}
    </div>
</Modal>
