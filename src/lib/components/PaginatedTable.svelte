<script lang="ts" generics="T">
    import type { Snippet } from "svelte";

    let {
        items = [],
        columns = [],
        loading = false,
        hasNext = false,
        hasPrev = false,
        onNext = () => {},
        onPrev = () => {},
        onRefresh = () => {},
        actionsSnippet = undefined,
        headerActionsSnippet = undefined,
    }: {
        items?: T[];
        columns?: {
            key: string;
            label: string;
            sortable?: boolean;
            format?: (val: any, item: T) => string;
            onClick?: (item: T) => void;
        }[];
        loading?: boolean;
        hasNext?: boolean;
        hasPrev?: boolean;
        onNext?: () => void;
        onPrev?: () => void;
        onRefresh?: () => void;
        actionsSnippet?: Snippet<[T]>;
        headerActionsSnippet?: Snippet;
    } = $props();

    // Local state
    let filterText = $state("");
    let sortKey = $state<string | null>(null);
    let sortAsc = $state(true);

    // Sorting and filtering logic over the *current page* only
    let processedItems = $derived.by(() => {
        let result = [...items];

        // 1. Filter
        if (filterText) {
            const lower = filterText.toLowerCase();
            result = result.filter((item) => {
                // Simple search across all formatted string values
                return columns.some((col) => {
                    const val = (item as any)[col.key];
                    const str = col.format
                        ? col.format(val, item)
                        : String(val ?? "");
                    return str.toLowerCase().includes(lower);
                });
            });
        }

        // 2. Sort
        if (sortKey) {
            result.sort((a, b) => {
                const valA = (a as any)[sortKey!];
                const valB = (b as any)[sortKey!];

                let cmp = 0;
                if (typeof valA === "number" && typeof valB === "number") {
                    cmp = valA - valB;
                } else {
                    const sA = String(valA ?? "");
                    const sB = String(valB ?? "");
                    cmp = sA.localeCompare(sB);
                }
                return sortAsc ? cmp : -cmp;
            });
        }

        return result;
    });

    function handleSort(key: string, sortable?: boolean) {
        if (sortable === false) return;
        if (sortKey === key) {
            if (sortAsc) sortAsc = false;
            else {
                sortKey = null;
                sortAsc = true;
            } // Reset toggle
        } else {
            sortKey = key;
            sortAsc = true;
        }
    }
</script>

<div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div
        class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3 border-b border-gray-800 bg-gray-900/50 shrink-0 gap-3"
    >
        <!-- Filter -->
        <div class="relative w-full sm:w-64 shrink-0">
            <span
                class="absolute inset-y-0 left-2.5 flex items-center text-gray-500"
                >🔍</span
            >
            <input
                type="text"
                bind:value={filterText}
                placeholder="Filter currently loaded..."
                class="w-full bg-gray-950 border border-gray-700 rounded pl-8 pr-3 py-1.5 text-sm outline-none focus:border-blue-500 text-gray-200 transition-colors"
            />
            {#if filterText}
                <button
                    onclick={() => (filterText = "")}
                    class="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-300"
                    >✕</button
                >
            {/if}
        </div>

        <!-- Right Actions -->
        <div class="flex items-center gap-2 justify-end">
            {#if headerActionsSnippet}
                {@render headerActionsSnippet()}
            {/if}
        </div>
    </div>

    <!-- Table Core -->
    <div class="flex-1 overflow-auto bg-gray-950">
        <table class="w-full text-left border-collapse text-sm">
            <thead class="sticky top-0 bg-gray-900 shadow z-10">
                <tr>
                    {#each columns as col}
                        <th
                            class="border-b border-gray-800 px-4 py-2 font-semibold text-gray-400 {col.sortable !==
                            false
                                ? 'cursor-pointer hover:text-gray-200'
                                : ''} transition-colors whitespace-nowrap"
                            onclick={() => handleSort(col.key, col.sortable)}
                        >
                            <div class="flex items-center gap-1">
                                {col.label}
                                {#if sortKey === col.key}
                                    <span class="text-blue-400 text-xs"
                                        >{sortAsc ? "▲" : "▼"}</span
                                    >
                                {/if}
                            </div>
                        </th>
                    {/each}
                    {#if actionsSnippet}
                        <th
                            class="border-b border-gray-800 px-4 py-2 font-semibold text-gray-400 text-right"
                            >Actions</th
                        >
                    {/if}
                </tr>
            </thead>
            <tbody>
                {#if loading && processedItems.length === 0}
                    <tr>
                        <td
                            colspan={columns.length + (actionsSnippet ? 1 : 0)}
                            class="p-8 text-center text-gray-500 italic"
                        >
                            Loading...
                        </td>
                    </tr>
                {:else if processedItems.length === 0}
                    <tr>
                        <td
                            colspan={columns.length + (actionsSnippet ? 1 : 0)}
                            class="p-8 text-center text-gray-500"
                        >
                            No results found.
                        </td>
                    </tr>
                {:else}
                    {#each processedItems as item}
                        <tr
                            class="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors"
                        >
                            {#each columns as col}
                                <td
                                    class="px-4 py-2 text-gray-300 truncate max-w-xs"
                                >
                                    {#if col.onClick}
                                        <button
                                            onclick={() => col.onClick!(item)}
                                            class="text-blue-400 hover:text-blue-300 hover:underline text-left font-medium transition-colors"
                                        >
                                            {col.format
                                                ? col.format(
                                                      (item as any)[col.key],
                                                      item,
                                                  )
                                                : String(
                                                      (item as any)[col.key] ??
                                                          "-",
                                                  )}
                                        </button>
                                    {:else}
                                        {col.format
                                            ? col.format(
                                                  (item as any)[col.key],
                                                  item,
                                              )
                                            : String(
                                                  (item as any)[col.key] ?? "-",
                                              )}
                                    {/if}
                                </td>
                            {/each}
                            {#if actionsSnippet}
                                <td class="px-4 py-2 text-right">
                                    {@render actionsSnippet(item)}
                                </td>
                            {/if}
                        </tr>
                    {/each}
                {/if}
            </tbody>
        </table>
    </div>

    <!-- Pagination Footer -->
    <div
        class="flex items-center justify-between p-3 border-t border-gray-800 bg-gray-900/50 shrink-0"
    >
        <div class="text-xs text-gray-500">
            Displaying {processedItems.length} items (Page View)
            {#if filterText}
                <span class="text-blue-400">— Filtered</span>
            {/if}
        </div>
        <div class="flex items-center gap-2">
            <button
                onclick={onPrev}
                disabled={!hasPrev || loading}
                class="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
                ◀ Previous
            </button>
            <button
                onclick={onNext}
                disabled={!hasNext || loading}
                class="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
                Next ▶
            </button>
        </div>
    </div>
</div>
