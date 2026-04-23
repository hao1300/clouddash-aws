<script lang="ts">
    import type { Snippet } from "svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiClose } from "@mdi/js";

    let {
        open = $bindable(false),
        title = "",
        maxWidth = "max-w-lg",
        children,
        headerActions,
    }: {
        open?: boolean;
        title?: string;
        maxWidth?: string;
        children: Snippet;
        headerActions?: Snippet;
    } = $props();

    function handleBackdrop(e: MouseEvent) {
        if (e.target === e.currentTarget) open = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") open = false;
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onclick={handleBackdrop}
        onkeydown={handleKeydown}
    >
        <div
            class="bg-gray-900 rounded-xl border border-gray-800 shadow-2xl flex flex-col w-full {maxWidth} max-h-[90vh] overflow-hidden"
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0"
            >
                <div class="flex items-center gap-3">
                    <h2 class="text-sm font-bold text-gray-200">{title}</h2>
                    {#if headerActions}
                        {@render headerActions()}
                    {/if}
                </div>
                <button
                    onclick={() => (open = false)}
                    class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition text-lg leading-none"
                    title="Close"><Icon path={mdiClose} size={20} /></button
                >
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-auto p-5">
                {@render children()}
            </div>
        </div>
    </div>
{/if}
