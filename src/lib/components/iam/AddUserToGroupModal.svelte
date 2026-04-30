<script lang="ts">
    import { aws } from "$lib/services/aws.svelte";
    import { AddUserToGroupCommand, ListUsersCommand, type User } from "@aws-sdk/client-iam";
    import Modal from "$lib/components/Modal.svelte";

    let {
        show = $bindable(false),
        groupName,
        onSaved = () => {}
    } = $props<{
        show: boolean;
        groupName: string;
        onSaved?: () => void;
    }>();

    let saving = $state(false);
    let userName = $state("");
    let error = $state("");
    
    // To optionally provide suggestions
    let allUsers = $state<User[]>([]);

    $effect(() => {
        if (show) {
            error = "";
            userName = "";
            loadUsers();
        }
    });

    async function loadUsers() {
        if (!aws.iam) return;
        try {
            const res = await aws.iam.send(new ListUsersCommand({ MaxItems: 100 }));
            allUsers = res.Users || [];
        } catch(e) {
            // Ignore failure on loading suggestions
        }
    }

    let filteredUsers = $derived(
        userName 
        ? allUsers.filter(u => u.UserName && u.UserName.toLowerCase().includes(userName.toLowerCase()))
        : allUsers
    );

    let showDropdown = $state(false);

    function selectUser(name: string) {
        userName = name;
        showDropdown = false;
    }

    async function addUser() {
        if (!aws.iam || !userName.trim() || !groupName) return;
        saving = true;
        error = "";
        try {
            await aws.iam.send(new AddUserToGroupCommand({ GroupName: groupName, UserName: userName.trim() }));
            show = false;
            onSaved();
        } catch(e: any) {
            error = e.message || String(e);
        } finally {
            saving = false;
        }
    }
</script>

<Modal bind:open={show} title="Add User to Group" maxWidth="max-w-md" overflowVisible={true}>
    <div class="space-y-4 w-full flex flex-col">
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 text-xs rounded border border-red-500/30 shrink-0">
                {error}
            </div>
        {/if}
        <div class="shrink-0 relative">
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">User Name</label>
            <input 
                bind:value={userName} 
                onfocus={() => showDropdown = true}
                onblur={() => setTimeout(() => showDropdown = false, 200)}
                class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500" 
                placeholder="e.g. MyUser" 
            />
            {#if showDropdown && filteredUsers.length > 0}
                <div class="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg max-h-48 overflow-auto">
                    {#each filteredUsers as user}
                        <button type="button" class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white" onclick={() => selectUser(user.UserName || "")}>
                            {user.UserName}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
        <div class="flex justify-end gap-2 pt-2 shrink-0">
            <button onclick={() => show = false} class="px-4 py-2 text-xs text-gray-400 hover:text-white transition">Cancel</button>
            <button onclick={addUser} disabled={saving || !userName.trim()} class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow disabled:opacity-50 inline-flex items-center gap-2">
                {#if saving}<span class="animate-spin">⟳</span>{/if} Add User
            </button>
        </div>
    </div>
</Modal>
