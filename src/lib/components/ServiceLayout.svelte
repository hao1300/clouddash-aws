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

    function handleTabClick(id: string) {
        activeTab = id;
        onTabChange?.(id);
    }
</script>

<div class="flex flex-col h-full bg-gray-950 text-white overflow-hidden relative">
    {#if tabs.length > 0}
        <div class="bg-gray-900 border-b border-gray-800 shrink-0 px-6">
            <div class="flex gap-4">
                {#each tabs as tab}
                    <button
                        onclick={() => handleTabClick(tab.id)}
                        class="py-3 text-xs font-bold uppercase transition border-b-2 {activeTab === tab.id || activeTab.startsWith(tab.id + '/')
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-gray-400 hover:text-gray-200'}"
                    >
                        {tab.label}
                    </button>
                {/each}
            </div>
        </div>
    {/if}
    <main class="flex-1 overflow-auto relative">
        {@render children()}
    </main>
</div>
