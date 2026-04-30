<script lang="ts">
    import Modal from "$lib/components/Modal.svelte";

    let {
        show = $bindable(false),
        title = "Confirm",
        message = "Are you sure you want to proceed?",
        confirmText = "Confirm",
        error = "",
        loading = false,
        onConfirm = () => {}
    } = $props<{
        show: boolean;
        title?: string;
        message?: string;
        confirmText?: string;
        error?: string;
        loading?: boolean;
        onConfirm: () => void;
    }>();
</script>

<Modal bind:open={show} {title} maxWidth="max-w-sm">
    <div class="space-y-4 w-full flex flex-col">
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 text-xs rounded border border-red-500/30 shrink-0">
                {error}
            </div>
        {/if}
        <div class="shrink-0 text-sm text-gray-300">
            <p>{message}</p>
        </div>
        <div class="flex justify-end gap-2 pt-4 shrink-0">
            <button onclick={() => show = false} class="px-4 py-2 text-xs text-gray-400 hover:text-white transition" disabled={loading}>Cancel</button>
            <button onclick={onConfirm} disabled={loading} class="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow disabled:opacity-50 inline-flex items-center gap-2">
                {#if loading}<span class="animate-spin">⟳</span>{/if} {confirmText}
            </button>
        </div>
    </div>
</Modal>
