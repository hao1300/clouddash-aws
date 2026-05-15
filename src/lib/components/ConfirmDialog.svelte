<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiClose } from "@mdi/js";
    import { confirmService } from "$lib/services/confirm.svelte";

    let current = $derived(confirmService.active);

    function onKeydown(e: KeyboardEvent) {
        if (!current) return;
        if (e.key === "Escape") {
            e.preventDefault();
            confirmService.cancel();
        } else if (e.key === "Enter") {
            e.preventDefault();
            confirmService.confirm();
        }
    }

    function onBackdrop(e: MouseEvent) {
        if (e.target === e.currentTarget) confirmService.cancel();
    }
</script>

<svelte:window onkeydown={onKeydown} />

{#if current}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
        class="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onclick={onBackdrop}
    >
        <div
            class="bg-gray-900 rounded-xl border border-gray-800 shadow-2xl w-full max-w-md flex flex-col"
        >
            <div
                class="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0"
            >
                <h2 class="text-sm font-bold text-gray-200">
                    {current.title ?? "Confirm"}
                </h2>
                <button
                    onclick={() => confirmService.cancel()}
                    class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
                    title="Cancel"
                >
                    <Icon path={mdiClose} size={20} />
                </button>
            </div>

            <div class="px-5 py-4">
                <p class="text-sm text-gray-300 whitespace-pre-wrap break-words">
                    {current.message}
                </p>
            </div>

            <div
                class="flex justify-end gap-2 px-5 py-3 border-t border-gray-800 shrink-0"
            >
                <button
                    onclick={() => confirmService.cancel()}
                    class="px-4 py-2 rounded text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 transition"
                >
                    {current.cancelText ?? "Cancel"}
                </button>
                <button
                    onclick={() => confirmService.confirm()}
                    class="px-4 py-2 rounded text-xs font-semibold transition text-white {current.destructive
                        ? 'bg-red-600 hover:bg-red-500'
                        : 'bg-blue-600 hover:bg-blue-500'}"
                >
                    {current.confirmText ?? "OK"}
                </button>
            </div>
        </div>
    </div>
{/if}