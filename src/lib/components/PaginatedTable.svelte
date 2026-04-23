<script lang="ts" generics="T">
    import type { Snippet } from "svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiMagnify, mdiClose, mdiArrowUp, mdiArrowDown, mdiChevronLeft, mdiChevronRight, mdiSort } from "@mdi/js";

    let {
        items = [],
        columns = [],
        loading = false,
        hasNext = false,
        hasPrev = false,
        error = "",
        actionMsg = "",
        onNext = () => {},
        onPrev = () => {},
        onRefresh = () => {},
        onRowClick = undefined,
        actionsSnippet = undefined,
        headerActionsSnippet = undefined,
        cellSnippet = undefined,
        children = undefined,
    }: {
        items?: T[];
        columns?: {
            key: string;
            label: string;
            sortable?: boolean;
            format?: (val: any, item: T) => string;
            renderCell?: Snippet<[any, T]>;
            onClick?: (item: T) => void;
            wrap?: boolean;
        }[];
        loading?: boolean;
        hasNext?: boolean;
        hasPrev?: boolean;
        error?: string;
        actionMsg?: string;
        onNext?: () => void;
        onPrev?: () => void;
        onRefresh?: () => void;
        onRowClick?: (item: T) => void;
        actionsSnippet?: Snippet<[T]>;
        headerActionsSnippet?: Snippet;
        cellSnippet?: Snippet<[string, any, T]>;
        children?: Snippet<[T]>;
    } = $props();

    // Local state
    let filterText = $state("");
    let showMobileSearch = $state(false);
    let showMobileSort = $state(false);
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

    // Resizing logic
    let columnWidths = $state<Record<string, number>>({});
    let draggingCol = $state<string | null>(null);
    let startX = $state(0);
    let startWidth = $state(0);

    function startResize(e: MouseEvent, key: string) {
        e.stopPropagation();
        e.preventDefault();
        draggingCol = key;
        startX = e.clientX;
        const th = (e.currentTarget as HTMLElement).closest("th");
        startWidth =
            columnWidths[key] || th?.getBoundingClientRect().width || 100;

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }

    function onMouseMove(e: MouseEvent) {
        if (!draggingCol) return;
        const diff = e.clientX - startX;
        columnWidths[draggingCol] = Math.max(50, startWidth + diff);
    }

    function onMouseUp() {
        draggingCol = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}
        <div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>
    {/if}
    {#if actionMsg}
        <div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30"
        >
            {actionMsg}
        </div>
    {/if}

    <div
        class="flex-1 flex flex-col min-h-0 {error || actionMsg ? 'pt-8' : ''}"
    >
        <!-- Toolbar -->
        <div
            class="flex flex-row items-center justify-between p-3 border-b border-gray-800 bg-gray-900/50 shrink-0 gap-3"
        >
            <!-- Mobile Actions (Left) -->
            <div class="flex items-center gap-2 sm:hidden">
                <button
                    onclick={() => showMobileSearch = !showMobileSearch}
                    class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors {showMobileSearch || filterText ? 'text-blue-400 border-blue-500/50 bg-blue-500/10' : ''}"
                >
                    <Icon path={mdiMagnify} size={18} />
                </button>
                
                <div class="relative">
                    <button
                        onclick={() => showMobileSort = !showMobileSort}
                        class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors {sortKey ? 'text-blue-400 border-blue-500/50 bg-blue-500/10' : ''}"
                    >
                        <Icon path={mdiSort} size={18} />
                    </button>
                    
                    {#if showMobileSort}
                        <!-- Click-away overlay -->
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="fixed inset-0 z-40" onclick={() => showMobileSort = false}></div>
                        
                        <div class="absolute left-0 top-full mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 py-1 overflow-hidden">
                            <button
                                type="button"
                                onclick={() => { sortKey = null; showMobileSort = false; }}
                                class="w-full text-left px-3 py-2 text-xs hover:bg-blue-600/20 hover:text-blue-400 transition-colors {!sortKey ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-300'}"
                            >
                                Default Sort
                            </button>
                            {#each columns as col}
                                {#if col.sortable !== false}
                                    <button
                                        type="button"
                                        onclick={() => { sortKey = col.key; sortAsc = true; showMobileSort = false; }}
                                        class="w-full text-left px-3 py-2 text-xs hover:bg-blue-600/20 hover:text-blue-400 transition-colors {sortKey === col.key && sortAsc ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-300'}"
                                    >
                                        {col.label} (Asc)
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => { sortKey = col.key; sortAsc = false; showMobileSort = false; }}
                                        class="w-full text-left px-3 py-2 text-xs hover:bg-blue-600/20 hover:text-blue-400 transition-colors {sortKey === col.key && !sortAsc ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-300'}"
                                    >
                                        {col.label} (Desc)
                                    </button>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Desktop Filter -->
            <div class="relative w-full sm:w-64 shrink-0 hidden sm:block">
                <span
                    class="absolute inset-y-0 left-2.5 flex items-center text-gray-500"
                    ><Icon path={mdiMagnify} size={14} /></span
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
                        ><Icon path={mdiClose} size={14} /></button
                    >
                {/if}
            </div>

            <!-- Right Actions Snippet -->
            <div class="flex items-center gap-2 justify-end ml-auto">
                {#if headerActionsSnippet}
                    {@render headerActionsSnippet()}
                {/if}
            </div>
        </div>

        <!-- Mobile Search Expansion -->
        {#if showMobileSearch}
            <div class="p-3 border-b border-gray-800 bg-gray-900 sm:hidden flex gap-2 items-center">
                <div class="relative w-full">
                    <span class="absolute inset-y-0 left-2.5 flex items-center text-gray-500"><Icon path={mdiMagnify} size={14} /></span>
                    <input
                        type="text"
                        bind:value={filterText}
                        placeholder="Search..."
                        class="w-full bg-gray-950 border border-gray-700 rounded pl-8 pr-3 py-1.5 text-sm outline-none focus:border-blue-500 text-gray-200 transition-colors"
                        autofocus
                    />
                    {#if filterText}
                        <button
                            onclick={() => (filterText = "")}
                            class="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-300"
                        ><Icon path={mdiClose} size={14} /></button>
                    {/if}
                </div>
                <button onclick={() => { showMobileSearch = false; filterText = ''; }} class="text-xs font-semibold text-gray-400 hover:text-white px-2">Cancel</button>
            </div>
        {/if}

        <!-- Table Core -->
        <div class="flex-1 overflow-auto bg-gray-950 p-3 sm:p-0">
            <table class="w-full text-left border-collapse text-sm block sm:table">
                <thead class="sticky top-0 bg-gray-900 shadow z-10 hidden sm:table-header-group">
                    <tr class="block sm:table-row">
                        {#each columns as col}
                            <th
                                class="relative border-b border-gray-800 px-4 py-2 font-semibold text-gray-300 group {col.sortable !==
                                false
                                    ? 'cursor-pointer hover:text-gray-200'
                                    : ''} transition-colors whitespace-nowrap {columnWidths[
                                    col.key
                                ]
                                    ? ''
                                    : 'max-w-xs'}"
                                style={columnWidths[col.key]
                                    ? `width: ${columnWidths[col.key]}px; min-width: ${columnWidths[col.key]}px; max-width: ${columnWidths[col.key]}px; overflow: hidden; text-overflow: ellipsis;`
                                    : ""}
                                onclick={() =>
                                    handleSort(col.key, col.sortable)}
                            >
                                <div class="flex items-center gap-1">
                                    <span class="truncate">{col.label}</span>
                                    {#if sortKey === col.key}
                                        <span
                                            class="text-blue-400 text-xs shrink-0"
                                            ><Icon path={sortAsc ? mdiArrowUp : mdiArrowDown} size={14} /></span
                                        >
                                    {/if}
                                </div>

                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                <div
                                    class="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-blue-500 {draggingCol ===
                                    col.key
                                        ? 'bg-blue-500 opacity-100'
                                        : ''}"
                                    onmousedown={(e) => startResize(e, col.key)}
                                    onclick={(e) => e.stopPropagation()}
                                ></div>
                            </th>
                        {/each}
                        {#if actionsSnippet}
                            <th
                                class="border-b border-gray-800 px-4 py-2 font-semibold text-gray-300 text-right w-24"
                                >Actions</th
                            >
                        {/if}
                    </tr>
                </thead>
                <tbody class="block sm:table-row-group">
                    {#if loading && processedItems.length === 0}
                        <tr class="block sm:table-row">
                            <td
                                colspan={columns.length +
                                    (actionsSnippet ? 1 : 0)}
                                class="block sm:table-cell p-8 text-center text-gray-500 italic"
                            >
                                Loading...
                            </td>
                        </tr>
                    {:else if processedItems.length === 0}
                        <tr class="block sm:table-row">
                            <td
                                colspan={columns.length +
                                    (actionsSnippet ? 1 : 0)}
                                class="block sm:table-cell p-8 text-center text-gray-500"
                            >
                                No results found.
                            </td>
                        </tr>
                    {:else}
                        {#each processedItems as item}
                            <tr
                                class="flex flex-col sm:table-row border border-gray-800/80 sm:border-0 sm:border-b hover:bg-gray-800/50 transition-colors mb-3 sm:mb-0 rounded-lg sm:rounded-none bg-gray-900/40 sm:bg-transparent p-3 sm:p-0 {onRowClick
                                    ? 'cursor-pointer text-blue-400 sm:text-inherit hover:text-blue-300'
                                    : 'text-gray-300'}"
                                onclick={() => onRowClick && onRowClick(item)}
                                onkeydown={(e) => {
                                    if (e.key === "Enter" && onRowClick)
                                        onRowClick(item);
                                }}
                                tabindex={onRowClick ? 0 : undefined}
                            >
                                {#each columns as col}
                                    <td
                                        class="flex sm:table-cell items-center px-1 sm:px-4 py-1.5 sm:py-2 text-inherit border-b border-gray-800/30 sm:border-0 last:border-0 {columnWidths[
                                            col.key
                                        ]
                                            ? ''
                                            : 'sm:max-w-xs'}"
                                        style={columnWidths[col.key]
                                            ? `width: ${columnWidths[col.key]}px; min-width: ${columnWidths[col.key]}px; max-width: ${columnWidths[col.key]}px;`
                                            : ""}
                                    >
                                        <span class="inline-block sm:hidden text-gray-500 text-xs font-semibold mr-3 w-1/3 shrink-0">{col.label}</span>
                                        <div class="{col.wrap ? 'whitespace-normal break-all' : 'truncate'} flex-1">
                                            {#if col.onClick}
                                                <button
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        col.onClick!(item);
                                                    }}
                                                    class="text-blue-400 hover:text-blue-300 hover:underline text-left font-medium transition-colors truncate max-w-full inline-block align-bottom"
                                                >
                                                    {col.format
                                                        ? col.format(
                                                              (item as any)[
                                                                  col.key
                                                              ],
                                                              item,
                                                          )
                                                        : String(
                                                              (item as any)[
                                                                  col.key
                                                              ] ?? "-",
                                                          )}
                                                </button>
                                            {:else if col.renderCell}
                                                {@render col.renderCell((item as any)[col.key], item)}
                                            {:else if cellSnippet}
                                                {@render cellSnippet(
                                                    col.key,
                                                    (item as any)[col.key],
                                                    item,
                                                )}
                                            {:else if col.format}
                                                {col.format(
                                                    (item as any)[col.key],
                                                    item,
                                                )}
                                            {:else}
                                                {String(
                                                    (item as any)[col.key] ?? "-",
                                                )}
                                            {/if}
                                        </div>
                                    </td>
                                {/each}
                                {#if actionsSnippet}
                                    <td class="flex sm:table-cell justify-end px-1 sm:px-4 py-2 mt-2 sm:mt-0 border-t border-gray-800/50 sm:border-0 sm:text-right">
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
                    class="bg-gray-800 hover:bg-gray-700 border border-gray-700 p-1 rounded text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <Icon path={mdiChevronLeft} size={18} />
                </button>
                <button
                    onclick={onNext}
                    disabled={!hasNext || loading}
                    class="bg-gray-800 hover:bg-gray-700 border border-gray-700 p-1 rounded text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <Icon path={mdiChevronRight} size={18} />
                </button>
            </div>
        </div>
    </div>
</div>
