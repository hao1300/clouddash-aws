<script lang="ts">
    import Modal from "$lib/components/Modal.svelte";

    let {
        show = $bindable(false),
        title = "Confirm Deletion",
        resourceName,
        error = "",
        loading = false,
        onConfirm = () => {}
    } = $props<{
        show: boolean;
        title?: string;
        resourceName: string;
        error?: string;
        loading?: boolean;
        onConfirm: () => void;
    }>();

    let confirmText = $state("");

    $effect(() => {
        if (show) {
            confirmText = "";
        }
    });

    let canConfirm = $derived(confirmText === resourceName);

</script>

<Modal bind:open={show} {title} maxWidth="max-w-md">
    <div class="space-y-4 w-full flex flex-col">
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 text-xs rounded border border-red-500/30 shrink-0">
                {error}
            </div>
        {/if}
        <div class="shrink-0 text-sm text-gray-300">
            <p class="mb-4">You are about to delete <strong>{resourceName}</strong>. This action cannot be undone.</p>
            <p class="mb-2 text-xs text-gray-400">Please type the name of the resource to confirm:</p>
            <input bind:value={confirmText} class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-red-500" placeholder={resourceName} />
        </div>
        <div class="flex justify-end gap-2 pt-2 shrink-0">
            <button onclick={() => show = false} class="px-4 py-2 text-xs text-gray-400 hover:text-white transition" disabled={loading}>Cancel</button>
            <button onclick={onConfirm} disabled={loading || !canConfirm} class="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow disabled:opacity-50 inline-flex items-center gap-2">
                {#if loading}<span class="animate-spin">⟳</span>{/if} Delete
            </button>
        </div>
    </div>
</Modal>
