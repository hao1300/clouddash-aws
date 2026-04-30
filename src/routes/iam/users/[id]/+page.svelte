<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiChevronRight } from "@mdi/js";

    import {
        GetUserCommand,
        ListGroupsForUserCommand,
        ListAttachedUserPoliciesCommand,
        ListUserPoliciesCommand,
        DeleteUserCommand,
        RemoveUserFromGroupCommand,
        type User,
        type Group,
        type AttachedPolicy
    } from "@aws-sdk/client-iam";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import InlinePolicyModal from "$lib/components/InlinePolicyModal.svelte";
    import DeleteConfirmModal from "$lib/components/iam/DeleteConfirmModal.svelte";

    let userName = $derived($page.params.id || "");

    $effect(() => {
        titleService.setResource(userName, undefined, $page.url.pathname);
    });

    let loading = $state(false);
    let error = $state("");
    let userDetails = $state<User | null>(null);
    let groups = $state<Group[]>([]);
    let attachedPolicies = $state<AttachedPolicy[]>([]);
    let inlinePolicies = $state<string[]>([]);
    let detailTab = $state<"overview" | "groups" | "policies">("overview");

    let showInlineModal = $state(false);
    let editInlineName = $state<string | null>(null);

    let showDeleteModal = $state(false);
    let deleting = $state(false);

    let groupToRemove = $state<string | null>(null);
    let showRemoveGroupModal = $state(false);
    let removingGroup = $state(false);

    $effect(() => {
        if (aws.iam && userName) {
            loadDetails();
        }
    });

    async function loadDetails() {
        if (!aws.iam || !userName) return;
        try {
            loading = true;
            const res = await aws.iam.send(new GetUserCommand({ UserName: userName }));
            userDetails = res.User || null;

            const groupsRes = await aws.iam.send(new ListGroupsForUserCommand({ UserName: userName }));
            groups = groupsRes.Groups || [];

            const attachedRes = await aws.iam.send(new ListAttachedUserPoliciesCommand({ UserName: userName }));
            attachedPolicies = attachedRes.AttachedPolicies || [];

            const inlineRes = await aws.iam.send(new ListUserPoliciesCommand({ UserName: userName }));
            inlinePolicies = inlineRes.PolicyNames || [];
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function deleteUser() {
        if (!aws.iam || !userName) return;
        try {
            deleting = true;
            error = "";
            await aws.iam.send(new DeleteUserCommand({ UserName: userName }));
            showDeleteModal = false;
            goto("/iam/users");
        } catch(e: any) {
            error = e.message || String(e);
            showDeleteModal = false;
        } finally {
            deleting = false;
        }
    }

    function promptRemoveGroup(groupNameToRemove: string) {
        groupToRemove = groupNameToRemove;
        showRemoveGroupModal = true;
    }

    async function confirmRemoveGroup() {
        if (!aws.iam || !userName || !groupToRemove) return;
        try {
            removingGroup = true;
            await aws.iam.send(new RemoveUserFromGroupCommand({ GroupName: groupToRemove, UserName: userName }));
            loadDetails(); // Refresh
            showRemoveGroupModal = false;
        } catch(e: any) {
            error = e.message || String(e);
            showRemoveGroupModal = false;
        } finally {
            removingGroup = false;
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
                onclick={() => (detailTab = "groups")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'groups'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Groups</button
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
                        <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest">User Overview</h3>
                        <button onclick={() => showDeleteModal = true} class="text-[10px] bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-3 py-1 rounded shadow-sm transition border border-red-800/50">
                            Delete User
                        </button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">User Name</label>
                            <div class="text-sm text-gray-300">{userDetails?.UserName || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">User ID</label>
                            <div class="text-sm text-gray-300">{userDetails?.UserId || 'N/A'}</div>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">ARN</label>
                            <div class="text-sm text-gray-300 font-mono truncate">{userDetails?.Arn || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Creation Date</label>
                            <div class="text-sm text-gray-300">{userDetails?.CreateDate ? new Date(userDetails.CreateDate).toLocaleString() : 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Password Last Used</label>
                            <div class="text-sm text-gray-300">{userDetails?.PasswordLastUsed ? new Date(userDetails.PasswordLastUsed).toLocaleString() : 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>
        {:else if detailTab === "groups"}
            <div class="h-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
                {#snippet actionsSnippet(item: any)}
                    <button onclick={() => promptRemoveGroup(item.GroupName)} class="text-[10px] bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-3 py-1 rounded shadow-sm transition border border-red-800/50">
                        Remove
                    </button>
                {/snippet}
                <PaginatedTable
                    items={groups}
                    {loading}
                    onRefresh={loadDetails}
                    {actionsSnippet}
                    columns={[
                        {
                            label: "Group Name",
                            key: "GroupName",
                            onClick: (item) => goto(`/iam/groups/${item.GroupName}`)
                        },
                        { label: "Group ID", key: "GroupId" },
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
                                        <span class="text-xs text-gray-500 group-hover:text-gray-300 flex items-center gap-1">Edit <Icon path={mdiChevronRight} size={12} /></span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            <InlinePolicyModal bind:show={showInlineModal} type="User" entityName={userName} policyName={editInlineName} onSaved={loadDetails} />
        {/if}
    </div>
    <DeleteConfirmModal bind:show={showDeleteModal} resourceName={userName} onConfirm={deleteUser} loading={deleting} {error} />
    {#if groupToRemove}
        <DeleteConfirmModal bind:show={showRemoveGroupModal} title="Remove Group from User" resourceName={groupToRemove} onConfirm={confirmRemoveGroup} loading={removingGroup} />
    {/if}
</div>
