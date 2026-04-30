<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiChevronRight } from "@mdi/js";

    import {
        GetRoleCommand,
        ListAttachedRolePoliciesCommand,
        ListRolePoliciesCommand,
        UpdateAssumeRolePolicyCommand,
        DeleteRoleCommand,
        type Role,
        type AttachedPolicy
    } from "@aws-sdk/client-iam";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import JsonEditor from "$lib/components/JsonEditor.svelte";
    import InlinePolicyModal from "$lib/components/InlinePolicyModal.svelte";
    import DeleteConfirmModal from "$lib/components/iam/DeleteConfirmModal.svelte";

    let roleName = $derived($page.params.id || "");

    $effect(() => {
        titleService.setResource(roleName, undefined, $page.url.pathname);
    });

    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let roleDetails = $state<Role | null>(null);
    let attachedPolicies = $state<AttachedPolicy[]>([]);
    let inlinePolicies = $state<string[]>([]);
    let detailTab = $state<"overview" | "trust" | "policies">("overview");

    let showInlineModal = $state(false);
    let editInlineName = $state<string | null>(null);

    let showDeleteModal = $state(false);
    let deleting = $state(false);

    $effect(() => {
        if (aws.iam && roleName) {
            loadDetails();
        }
    });

    let trustPolicyStr = $state("");
    let savingTrust = $state(false);

    async function loadDetails() {
        if (!aws.iam || !roleName) return;
        try {
            loading = true;
            const res = await aws.iam.send(new GetRoleCommand({ RoleName: roleName }));
            roleDetails = res.Role || null;
            if (roleDetails?.AssumeRolePolicyDocument) {
                try {
                    const decoded = decodeURIComponent(roleDetails.AssumeRolePolicyDocument);
                    trustPolicyStr = JSON.stringify(JSON.parse(decoded), null, 4);
                } catch(e) {
                    trustPolicyStr = decodeURIComponent(roleDetails.AssumeRolePolicyDocument);
                }
            }

            const attachedRes = await aws.iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
            attachedPolicies = attachedRes.AttachedPolicies || [];

            const inlineRes = await aws.iam.send(new ListRolePoliciesCommand({ RoleName: roleName }));
            inlinePolicies = inlineRes.PolicyNames || [];
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function saveTrustPolicy() {
        if (!aws.iam || !roleName) return;
        try {
            savingTrust = true;
            error = "";
            actionMsg = "";
            let policyToSave = trustPolicyStr;
            // Best effort validation
            try { JSON.parse(trustPolicyStr); } catch (e: any) { throw new Error("Invalid JSON: " + e.message); }
            
            await aws.iam.send(new UpdateAssumeRolePolicyCommand({
                RoleName: roleName,
                PolicyDocument: policyToSave
            }));
            actionMsg = "Trust policy updated successfully.";
            loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            savingTrust = false;
        }
    }

    async function deleteRole() {
        if (!aws.iam || !roleName) return;
        try {
            deleting = true;
            error = "";
            await aws.iam.send(new DeleteRoleCommand({ RoleName: roleName }));
            showDeleteModal = false;
            goto("/iam/roles");
        } catch(e: any) {
            error = e.message || String(e);
            showDeleteModal = false;
        } finally {
            deleting = false;
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
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

    <div class="px-6 border-b border-gray-800 bg-gray-900 shrink-0 {error || actionMsg ? 'mt-8' : ''} flex justify-between items-center">
        <nav class="flex gap-4">
            <button
                onclick={() => (detailTab = "overview")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'overview'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Overview</button
            >
            <button
                onclick={() => (detailTab = "trust")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'trust'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Trust Relationships</button
            >
            <button
                onclick={() => (detailTab = "policies")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'policies'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Policies</button
            >
        </nav>
    </div>

    <div class="flex-1 overflow-auto p-6 min-h-0 relative">
        {#if detailTab === "overview"}
            <div class="max-w-4xl space-y-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <div class="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
                        <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest">Role Overview</h3>
                        <button onclick={() => showDeleteModal = true} class="text-[10px] bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-3 py-1 rounded shadow-sm transition border border-red-800/50">
                            Delete Role
                        </button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Role Name</label>
                            <div class="text-sm text-gray-300">{roleDetails?.RoleName || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Role ID</label>
                            <div class="text-sm text-gray-300">{roleDetails?.RoleId || 'N/A'}</div>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">ARN</label>
                            <div class="text-sm text-gray-300 font-mono truncate">{roleDetails?.Arn || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Creation Date</label>
                            <div class="text-sm text-gray-300">{roleDetails?.CreateDate ? new Date(roleDetails.CreateDate).toLocaleString() : 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Max Session Duration</label>
                            <div class="text-sm text-gray-300">{roleDetails?.MaxSessionDuration ? (roleDetails.MaxSessionDuration / 3600) + ' hours' : 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>
        {:else if detailTab === "trust"}
            <div class="flex flex-col h-full max-w-4xl space-y-4">
                <div class="flex justify-between items-center">
                    <h3 class="text-sm font-bold text-gray-200">Assume Role Policy Document</h3>
                    <button
                        onclick={saveTrustPolicy}
                        disabled={savingTrust}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow disabled:opacity-50"
                    >
                        {savingTrust ? "Saving..." : "Save Policy"}
                    </button>
                </div>
                <div class="flex-1 min-h-0 bg-gray-900 border border-gray-800 rounded overflow-hidden">
                    <JsonEditor bind:value={trustPolicyStr} />
                </div>
            </div>
        {:else if detailTab === "policies"}
            <div class="flex flex-col gap-6 h-full">
                <!-- Attached Policies -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex-1 flex flex-col min-h-0">
                    <div class="p-4 border-b border-gray-800 bg-gray-900/50">
                        <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest">Attached Policies</h3>
                    </div>
                    <div class="flex-1 overflow-auto">
                        <PaginatedTable
                            items={attachedPolicies}
                            {loading}
                            onRefresh={loadDetails}
                            columns={[
                                {
                                    label: "Policy Name",
                                    key: "PolicyName",
                                    onClick: (item) => goto(`/iam/policies/${encodeURIComponent(item.PolicyArn || "")}`)
                                },
                                { label: "Policy ARN", key: "PolicyArn" },
                            ]}
                        />
                    </div>
                </div>

                <!-- Inline Policies -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex-1 flex flex-col min-h-0">
                    <div class="p-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
                        <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest">Inline Policies</h3>
                        <button onclick={() => { editInlineName = null; showInlineModal = true; }} class="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded shadow-sm transition">
                            Create Inline Policy
                        </button>
                    </div>
                    <div class="flex-1 overflow-auto p-4">
                        {#if inlinePolicies.length === 0}
                            <div class="text-center text-gray-500 text-xs italic py-4 border border-gray-800 border-dashed rounded bg-gray-900/50">No inline policies</div>
                        {:else}
                            <div class="grid grid-cols-1 gap-2">
                                {#each inlinePolicies as p}
                                    <button onclick={() => { editInlineName = p; showInlineModal = true; }} class="text-left bg-gray-950/50 hover:bg-gray-800 border border-gray-800 hover:border-blue-500/50 p-3 rounded group transition flex justify-between items-center">
                                        <span class="text-sm text-blue-400 group-hover:text-blue-300 transition-colors font-medium">{p}</span>
                                        <span class="text-xs text-gray-500 group-hover:text-gray-300 flex items-center gap-1">Edit <Icon path={mdiChevronRight} size={12} /></span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            <InlinePolicyModal bind:show={showInlineModal} type="Role" entityName={roleName} policyName={editInlineName} onSaved={loadDetails} />
        {/if}
    </div>
    <DeleteConfirmModal bind:show={showDeleteModal} resourceName={roleName} onConfirm={deleteRole} loading={deleting} {error} />
</div>
