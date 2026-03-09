<script lang="ts">
    import { goto } from "$app/navigation";

    let {
        href = "",
        onclick = undefined,
        children = undefined,
    }: {
        href?: string;
        onclick?: () => void;
        children?: any;
    } = $props();

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

<button
    class="text-xs text-blue-400 hover:text-blue-300 transition px-2.5 py-1.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center gap-1.5 shrink-0"
    onclick={handleClick}
>
    {#if children}
        {@render children()}
    {:else}
        ← Back
    {/if}
</button>
