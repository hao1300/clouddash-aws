<script lang="ts">
    import { goto, afterNavigate } from "$app/navigation";
    import { onMount } from "svelte";

    let {
        href = "",
        onclick = undefined,
        children = undefined,
    }: {
        href?: string;
        onclick?: () => void;
        children?: any;
    } = $props();

    let canGoBack = $state(true);

    function updateVisibility() {
        if (typeof window !== "undefined" && window.history) {
            const index = window.history.state?.["sveltekit:index"];
            if (index !== undefined) {
                canGoBack = index > 0;
            } else {
                // Fallback if sveltekit:index is not available
                canGoBack = window.history.length > 1;
            }
        }
    }

    onMount(() => {
        updateVisibility();
    });

    afterNavigate(() => {
        updateVisibility();
    });

    function handleClick(e: MouseEvent) {
        if (onclick) {
            onclick();
        } else if (href) {
            goto(href);
        } else {
            window.history.back();
        }
    }
</script>

{#if canGoBack || href || onclick}
    <button
        class="text-white hover:text-gray-200 transition shrink-0 flex items-center gap-1.5"
        onclick={handleClick}
    >
        {#if children}
            {@render children()}
        {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
        {/if}
    </button>
{/if}
