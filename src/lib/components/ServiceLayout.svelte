<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title = "",
        tabs = [],
        activeTab = $bindable(tabs.length > 0 ? tabs[0].id : ""),
        children,
    }: {
        title?: string;
        tabs?: { id: string; label: string }[];
        activeTab?: string;
        children: Snippet;
    } = $props();
</script>

<div class="flex h-full bg-gray-950 text-white overflow-hidden">
    <!-- Sidebar -->
    <aside
        class="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0"
    >
        {#if title}
            <div
                class="px-4 py-3 border-b border-gray-800 font-bold text-gray-200 truncate"
            >
                {title}
            </div>
        {/if}
        <nav class="flex-1 overflow-y-auto py-2">
            <ul class="space-y-0.5">
                {#each tabs as tab}
                    <li>
                        <button
                            onclick={() => (activeTab = tab.id)}
                            class="w-full text-left px-4 py-1.5 text-sm transition-colors {activeTab ===
                            tab.id
                                ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500 font-medium'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border-l-2 border-transparent'}"
                        >
                            {tab.label}
                        </button>
                    </li>
                {/each}
            </ul>
        </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-auto bg-gray-950 relative">
        {@render children()}
    </main>
</div>
