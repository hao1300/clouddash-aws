<script lang="ts">
    import type { Snippet } from "svelte";

    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

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
    import { bookmarks } from "$lib/services/bookmarks.svelte";

    // -- Action for Portal --
    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    }

    let menuOpenId = $state("");
    let menuX = $state(0);
    let menuY = $state(0);
    let menuGoesUp = $state(false);

    let activeTabLabel = $derived(
        tabs.find((t) => t.id === activeTab)?.label || "",
    );
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
                            onclick={() => {
                                if (onTabChange) {
                                    onTabChange(tab.id);
                                } else {
                                    activeTab = tab.id;
                                }
                            }}
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

        <div
            class="p-3 border-t border-gray-800 bg-gray-900/50 mt-auto shrink-0 hidden md:block"
        >
            <button
                onclick={() => {
                    let paramValues = Array.from(
                        $page.url.searchParams.values(),
                    ).filter((v) => v);
                    let extractedLabel = activeTabLabel;
                    if (paramValues.length > 0) {
                        extractedLabel += ` (${paramValues.join(", ")})`;
                    }
                    bookmarks.toggle(extractedLabel);
                }}
                class="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded text-xs font-medium border transition-colors {bookmarks.isBookmarked
                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/20'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
            >
                {#if bookmarks.isBookmarked}
                    <span>★ Bookmarked</span>
                {:else}
                    <span>☆ Bookmark Current</span>
                {/if}
            </button>

            {#if bookmarks.all.length > 0}
                <div class="mt-4">
                    <div
                        class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1"
                    >
                        Bookmarks
                    </div>
                    <ul
                        class="space-y-0.5 max-h-32 overflow-y-auto pr-1 scrollbar-hide"
                    >
                        {#each bookmarks.all as b}
                            <li class="relative font-sans">
                                <div
                                    class="flex items-center w-full rounded transition-colors {b.url ===
                                    $page.url.pathname + $page.url.search
                                        ? 'bg-blue-600/20 text-blue-400'
                                        : 'text-gray-400 hover:bg-gray-800'}"
                                >
                                    <button
                                        onclick={() => {
                                            goto(b.url);
                                        }}
                                        class="flex-1 text-left px-2 py-1.5 text-[11px] truncate flex items-center"
                                        title={b.label}
                                    >
                                        <span
                                            class="text-yellow-500/70 mr-1.5 shrink-0"
                                            >★</span
                                        >
                                        <span class="truncate">{b.label}</span>
                                    </button>
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            if (menuOpenId === b.id) {
                                                menuOpenId = "";
                                            } else {
                                                menuOpenId = b.id;
                                                const rect =
                                                    e.currentTarget.getBoundingClientRect();
                                                menuGoesUp =
                                                    window.innerHeight -
                                                        rect.bottom <
                                                    100;
                                                // Calculate absolute positions relative to the viewport
                                                menuX = rect.right;
                                                menuY = menuGoesUp
                                                    ? rect.top
                                                    : rect.bottom;
                                            }
                                        }}
                                        class="px-2 py-1.5 text-gray-500 hover:text-gray-300 font-bold shrink-0"
                                        >...</button
                                    >
                                </div>
                                {#if menuOpenId === b.id}
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <div
                                        class="fixed inset-0 z-[100]"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            menuOpenId = "";
                                        }}
                                    ></div>
                                    <div
                                        use:portal
                                        class="fixed bg-gray-800 border border-gray-700 rounded shadow-2xl z-[101] py-1 w-24"
                                        style="left: {menuX - 96}px; {menuGoesUp
                                            ? `bottom: ${window.innerHeight - menuY}px`
                                            : `top: ${menuY}px`};"
                                    >
                                        <button
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                const newLabel = prompt(
                                                    "Rename bookmark:",
                                                    b.label,
                                                );
                                                if (
                                                    newLabel &&
                                                    newLabel.trim()
                                                ) {
                                                    bookmarks.rename(
                                                        b.id,
                                                        newLabel.trim(),
                                                    );
                                                }
                                                menuOpenId = "";
                                            }}
                                            class="block w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700"
                                            >Rename</button
                                        >
                                        <button
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                bookmarks.remove(b.id);
                                                menuOpenId = "";
                                            }}
                                            class="block w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-gray-700"
                                            >Delete</button
                                        >
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-auto bg-gray-950 relative">
        {@render children()}
    </main>
</div>
