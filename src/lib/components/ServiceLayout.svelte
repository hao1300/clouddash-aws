<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title = "",
        children,
    }: {
        title?: string;
        children: Snippet;
    } = $props();
</script>

<div class="flex flex-col h-full min-h-0 bg-gray-950 text-white overflow-hidden relative">
    <main class="flex-1 min-h-0 overflow-auto overscroll-contain relative">
        {@render children()}
    </main>
</div>
