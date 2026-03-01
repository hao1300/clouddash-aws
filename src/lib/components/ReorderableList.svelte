<script lang="ts" generics="T">
    import type { Snippet } from "svelte";

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

    let dragIdx = $state(-1);
    let dragOverIdx = $state(-1);

    function handleDragStart(e: DragEvent, idx: number) {
        dragIdx = idx;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(idx));
            // Setting a drag image can help in some WebViews
        }
    }

    function handleDragOver(e: DragEvent, idx: number) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "move";
        dragOverIdx = idx;
    }

    function handleDragEnter(e: DragEvent, idx: number) {
        e.preventDefault();
        dragOverIdx = idx;
    }

    function handleDrop(e: DragEvent, toIdx: number) {
        e.preventDefault();
        if (dragIdx < 0 || dragIdx === toIdx) {
            dragIdx = -1;
            dragOverIdx = -1;
            return;
        }
        const copy = [...items];
        const [moved] = copy.splice(dragIdx, 1);
        copy.splice(toIdx, 0, moved);
        onReorder(copy);

        dragIdx = -1;
        dragOverIdx = -1;
    }

    function handleDragEnd() {
        dragIdx = -1;
        dragOverIdx = -1;
    }
</script>

<div class="space-y-1">
    {#each items as item, idx (keyFn(item))}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            draggable="true"
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragenter={(e) => handleDragEnter(e, idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            class="flex items-center gap-2 px-3 py-2 rounded border transition {dragOverIdx ===
            idx
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-800 bg-gray-800/30 hover:bg-gray-800/60'} {dragIdx ===
            idx
                ? 'opacity-40'
                : ''}"
        >
            <div
                class="cursor-grab active:cursor-grabbing px-1 text-gray-600 hover:text-gray-400 transition select-none"
                title="Drag to reorder"
            >
                ⠿
            </div>
            <div class="flex-1 flex items-center min-w-0">
                {@render children(item)}
            </div>
        </div>
    {/each}
</div>
