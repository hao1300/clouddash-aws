<script lang="ts" generics="T">
    import type { Snippet } from "svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiMagnify, mdiClose, mdiArrowUp, mdiArrowDown, mdiChevronLeft, mdiChevronRight } from "@mdi/js";

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
            class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3 border-b border-gray-800 bg-gray-900/50 shrink-0 gap-3"
        >
            <!-- Filter -->
            <div class="relative w-full sm:w-64 shrink-0">
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
                <tbody>
                    {#if loading && processedItems.length === 0}
                        <tr>
                            <td
                                colspan={columns.length +
                                    (actionsSnippet ? 1 : 0)}
                                class="p-8 text-center text-gray-500 italic"
                            >
                                Loading...
                            </td>
                        </tr>
                    {:else if processedItems.length === 0}
                        <tr>
                            <td
                                colspan={columns.length +
                                    (actionsSnippet ? 1 : 0)}
                                class="p-8 text-center text-gray-500"
                            >
                                No results found.
                            </td>
                        </tr>
                    {:else}
                        {#each processedItems as item}
                            <tr
                                class="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors {onRowClick
                                    ? 'cursor-pointer text-blue-400 hover:text-blue-300'
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
                                        class="px-4 py-2 truncate text-inherit {columnWidths[
                                            col.key
                                        ]
                                            ? ''
                                            : 'max-w-xs'}"
                                        style={columnWidths[col.key]
                                            ? `width: ${columnWidths[col.key]}px; min-width: ${columnWidths[col.key]}px; max-width: ${columnWidths[col.key]}px;`
                                            : ""}
                                    >
                                        {#if col.onClick}
                                            <button
                                                onclick={() =>
                                                    col.onClick!(item)}
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
