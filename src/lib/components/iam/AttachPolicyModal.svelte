<script lang="ts">
    import { aws } from "$lib/services/aws.svelte";
    import { 
        ListPoliciesCommand, 
        AttachUserPolicyCommand, 
        AttachGroupPolicyCommand, 
        AttachRolePolicyCommand,
        type Policy 
    } from "@aws-sdk/client-iam";
    import Modal from "$lib/components/Modal.svelte";

    let {
        show = $bindable(false),
        entityType,
        entityName,
        onSaved = () => {}
    } = $props<{
        show: boolean;
        entityType: "User" | "Group" | "Role";
        entityName: string;
        onSaved?: () => void;
    }>();

    let saving = $state(false);
    let searchText = $state("");
    let selectedArn = $state("");
    let error = $state("");
    
    let allPolicies = $state<Policy[]>([]);
    let loaded = $state(false);

    $effect(() => {
        if (show) {
            error = "";
            searchText = "";
            selectedArn = "";
            if (!loaded) loadPolicies();
        }
    });

    async function loadPolicies() {
        if (!aws.iam) return;
        try {
            const res = await aws.iam.send(new ListPoliciesCommand({ MaxItems: 500 }));
            allPolicies = res.Policies || [];
            loaded = true;
        } catch(e) {
            // Ignore
        }
    }

    let filteredPolicies = $derived(
        searchText 
        ? allPolicies.filter(p => (p.PolicyName && p.PolicyName.toLowerCase().includes(searchText.toLowerCase())) || (p.Arn && p.Arn.toLowerCase().includes(searchText.toLowerCase())))
        : allPolicies.slice(0, 100)
    );

    let showDropdown = $state(false);

    function selectPolicy(arn: string, name: string) {
        searchText = name;
        selectedArn = arn;
        showDropdown = false;
    }

    function handleInput() {
        selectedArn = searchText; // If they manually type an ARN
    }

    async function attach() {
        if (!aws.iam || !selectedArn.trim() || !entityName) return;
        saving = true;
        error = "";
        try {
            const arn = selectedArn.trim();
            if (entityType === "User") {
                await aws.iam.send(new AttachUserPolicyCommand({ UserName: entityName, PolicyArn: arn }));
            } else if (entityType === "Group") {
                await aws.iam.send(new AttachGroupPolicyCommand({ GroupName: entityName, PolicyArn: arn }));
            } else if (entityType === "Role") {
                await aws.iam.send(new AttachRolePolicyCommand({ RoleName: entityName, PolicyArn: arn }));
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

<Modal bind:open={show} title="Attach Policy to {entityType}" maxWidth="max-w-md" overflowVisible={true}>
    <div class="space-y-4 w-full flex flex-col">
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 text-xs rounded border border-red-500/30 shrink-0">
                {error}
            </div>
        {/if}
        <div class="shrink-0 relative">
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Search Policy or Enter ARN</label>
            <input 
                bind:value={searchText} 
                oninput={handleInput}
                onfocus={() => showDropdown = true}
                onblur={() => setTimeout(() => showDropdown = false, 200)}
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" 
                placeholder="e.g. AdministratorAccess or arn:aws:iam::..." 
            />
            {#if showDropdown && filteredPolicies.length > 0}
                <div class="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg max-h-48 overflow-auto">
                    {#each filteredPolicies as policy}
                        <button type="button" class="w-full text-left px-3 py-2 border-b border-gray-800 last:border-0 hover:bg-gray-800" onclick={() => selectPolicy(policy.Arn || "", policy.PolicyName || "")}>
                            <div class="text-sm text-gray-200 font-medium">{policy.PolicyName}</div>
                            <div class="text-[10px] text-gray-500 truncate">{policy.Arn}</div>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
        <div class="flex justify-end gap-2 pt-2 shrink-0">
            <button onclick={() => show = false} class="px-4 py-2 text-xs text-gray-400 hover:text-white transition">Cancel</button>
            <button onclick={attach} disabled={saving || !selectedArn.trim()} class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow disabled:opacity-50 inline-flex items-center gap-2">
                {#if saving}<span class="animate-spin">⟳</span>{/if} Attach Policy
            </button>
        </div>
    </div>
</Modal>
