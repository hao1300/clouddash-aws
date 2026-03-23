<script lang="ts" generics="T">
    import type { Snippet } from "svelte";
    import { dndzone, type DndEvent } from "svelte-dnd-action";
    import { flip } from "svelte/animate";

    let {
        items,
        onReorder,
        keyFn = (item: T) => String(item),
        children,
    }: {
        items: T[];
        onReorder: (newItems: T[]) => void;
        keyFn?: (item: T) => string;
        children: Snippet<[T]>;
    } = $props();

    // svelte-dnd-action requires items to be an array of objects with an `id` property.
    let wrappedItems = $derived(
        items.map((item) => ({ id: keyFn(item), value: item })),
    );

    // Provide local state for intermediate dragging steps
    let localItems = $state(items.map((item) => ({ id: keyFn(item), value: item })));

    $effect(() => {
        localItems = wrappedItems;
    });

    const flipDurationMs = 200;

    function handleDndConsider(
        e: CustomEvent<DndEvent<{ id: string; value: T }>>,
    ) {
        localItems = e.detail.items;
    }

    function handleDndFinalize(
        e: CustomEvent<DndEvent<{ id: string; value: T }>>,
    ) {
        localItems = e.detail.items;
        onReorder(localItems.map((wrapped) => wrapped.value));
    }
</script>

<div
    class="space-y-1 min-h-[40px]"
    use:dndzone={{ items: localItems, flipDurationMs, dropTargetStyle: {} }}
    onconsider={handleDndConsider}
    onfinalize={handleDndFinalize}
>
    {#each localItems as item (item.id)}
        <div
            animate:flip={{ duration: flipDurationMs }}
            class="flex items-center gap-2 px-3 py-2 rounded border border-gray-800 bg-gray-800/30 hover:bg-gray-800/60 transition"
        >
            <div
                class="cursor-grab active:cursor-grabbing px-1 text-gray-600 hover:text-gray-400 transition select-none"
                title="Drag to reorder"
            >
                ⠿
            </div>
            <div class="flex-1 flex items-center min-w-0">
                {@render children(item.value)}
            </div>
        </div>
    {/each}
</div>
