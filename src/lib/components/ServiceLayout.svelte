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

<div class="flex flex-col h-full bg-gray-950 text-white overflow-hidden relative">
    <main class="flex-1 overflow-auto relative">
        {@render children()}
    </main>
</div>
