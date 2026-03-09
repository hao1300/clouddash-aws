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
        class="text-2xl text-white hover:text-gray-200 transition shrink-0 flex items-center gap-1.5"
        onclick={handleClick}
    >
        {#if children}
            {@render children()}
        {:else}
            ←
        {/if}
    </button>
{/if}
