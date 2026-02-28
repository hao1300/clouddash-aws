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

<div
    class="flex flex-col md:flex-row h-full bg-gray-950 text-white overflow-hidden"
>
    <!-- Sidebar -->
    <aside
        class="w-full md:w-56 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-800 flex flex-col shrink-0"
    >
        {#if title}
            <div
                class="px-4 py-2 md:py-3 border-b border-gray-800 font-bold text-gray-200 truncate hidden md:block"
            >
                {title}
            </div>
        {/if}
        <nav
            class="md:flex-1 w-full overflow-x-auto md:overflow-y-auto py-2 px-2 md:px-0 scrollbar-hide"
        >
            <ul class="flex md:flex-col gap-1 md:gap-0 md:space-y-0.5">
                {#each tabs as tab}
                    <li class="shrink-0 md:shrink">
                        <button
                            onclick={() => (activeTab = tab.id)}
                            class="w-full text-left px-3 md:px-4 py-1.5 text-[13px] md:text-sm rounded md:rounded-none transition-colors whitespace-nowrap {activeTab ===
                            tab.id
                                ? 'bg-blue-600/20 text-blue-400 md:border-l-2 border-transparent md:border-blue-500 font-medium'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 md:border-l-2 border-transparent md:border-transparent'}"
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
