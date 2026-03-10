<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title = "",
        tabs = [],
        activeTab = $bindable(tabs.length > 0 ? tabs[0].id : ""),
        onTabChange,
        children,
    }: {
        title?: string;
        tabs?: { id: string; label: string }[];
        activeTab?: string;
        onTabChange?: (id: string) => void;
        children: Snippet;
    } = $props();
</script>

<div class="flex flex-col h-full bg-gray-950 text-white overflow-hidden relative">
    <main class="flex-1 overflow-auto relative">
        {@render children()}
    </main>
</div>
