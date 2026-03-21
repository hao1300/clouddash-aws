<script lang="ts">
    import {
        GetGroupCommand,
        ListGroupPoliciesCommand,
        ListAttachedGroupPoliciesCommand,
        type Group,
        type AttachedPolicy,
        type User
    } from "@aws-sdk/client-iam";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import InlinePolicyModal from "$lib/components/InlinePolicyModal.svelte";

    let groupName = $derived($page.params.id || "");

    $effect(() => {
        titleService.setResource(groupName, undefined, $page.url.pathname);
    });

    let loading = $state(false);
    let error = $state("");
    let groupDetails = $state<Group | null>(null);
    let users = $state<User[]>([]);
    let attachedPolicies = $state<AttachedPolicy[]>([]);
    let inlinePolicies = $state<string[]>([]);
    let detailTab = $state<"overview" | "users" | "policies">("overview");

    let showInlineModal = $state(false);
    let editInlineName = $state<string | null>(null);

    $effect(() => {
        if (aws.iam && groupName) {
            loadDetails();
        }
    });

    async function loadDetails() {
        if (!aws.iam || !groupName) return;
        try {
            loading = true;
            const res = await aws.iam.send(new GetGroupCommand({ GroupName: groupName }));
            groupDetails = res.Group || null;
            users = res.Users || [];

            const attachedRes = await aws.iam.send(new ListAttachedGroupPoliciesCommand({ GroupName: groupName }));
            attachedPolicies = attachedRes.AttachedPolicies || [];

            const inlineRes = await aws.iam.send(new ListGroupPoliciesCommand({ GroupName: groupName }));
            inlinePolicies = inlineRes.PolicyNames || [];
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div class="px-6 border-b border-gray-800 bg-gray-900 shrink-0 {error ? 'mt-8' : ''} flex justify-between items-center">
        <nav class="flex gap-4">
            <button
                onclick={() => (detailTab = "overview")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'overview'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Overview</button
            >
            <button
                onclick={() => (detailTab = "users")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'users'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Users</button
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
                        <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest">Group Overview</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Group Name</label>
                            <div class="text-sm text-gray-300">{groupDetails?.GroupName || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Group ID</label>
                            <div class="text-sm text-gray-300">{groupDetails?.GroupId || 'N/A'}</div>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">ARN</label>
                            <div class="text-sm text-gray-300 font-mono truncate">{groupDetails?.Arn || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Creation Date</label>
                            <div class="text-sm text-gray-300">{groupDetails?.CreateDate ? new Date(groupDetails.CreateDate).toLocaleString() : 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>
        {:else if detailTab === "users"}
            <div class="h-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
                <PaginatedTable
                    items={users}
                    {loading}
                    onRefresh={loadDetails}
                    columns={[
                        {
                            label: "User Name",
                            key: "UserName",
                            onClick: (item) => goto(`/iam/users/${item.UserName}`)
                        },
                        { label: "User ID", key: "UserId" },
                        { label: "ARN", key: "Arn" },
                        {
                            label: "Creation Date",
                            key: "CreateDate",
                            format: (v) => (v ? new Date(v).toLocaleString() : ""),
                        },
                    ]}
                />
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
                                        <span class="text-xs text-gray-500 group-hover:text-gray-300">Edit ▸</span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            <InlinePolicyModal bind:show={showInlineModal} type="Group" entityName={groupName} policyName={editInlineName} onSaved={loadDetails} />
        {/if}
    </div>
</div>
