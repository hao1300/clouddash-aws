<script lang="ts">
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import Icon from "./Icon.svelte";
    import { mdiDotsVertical } from "@mdi/js";

    let {
        tabs,
        activeTab,
    }: {
        tabs: { id: string; label: string; href: string }[];
        activeTab: string;
    } = $props();

    let container = $state<HTMLElement | null>(null);
    let tabElements = $state<HTMLElement[]>([]);
    let visibleCount = $state(tabs.length);
    let dropdownOpen = $state(false);

    let visibleTabs = $derived(tabs.slice(0, visibleCount));
    let hiddenTabs = $derived(tabs.slice(visibleCount));
    let isActiveInDropdown = $derived(hiddenTabs.some(t => t.id === activeTab));

    function updateOverflow() {
        if (!container || tabElements.length === 0) return;

        // Account for px-6 padding (24px each side = 48px total)
        const availableWidth = container.clientWidth - 48;
        const MORE_BUTTON_WIDTH = 56; // Buffer for "..." button
        let currentWidth = 0;
        let newVisibleCount = 0;

        for (let i = 0; i < tabElements.length; i++) {
            const tabWidth = tabElements[i].offsetWidth + 16; // width + gap
            
            // If this is not the last tab, we need to account for the "More" button possibly appearing
            const spaceNeeded = currentWidth + tabWidth + (i < tabs.length - 1 ? MORE_BUTTON_WIDTH : 0);
            
            if (spaceNeeded <= availableWidth) {
                currentWidth += tabWidth;
                newVisibleCount++;
            } else {
                break;
            }
        }
        
        // Special case: if we can fit ALL tabs without the "More" button
        let totalWidth = tabElements.reduce((acc, el) => acc + el.offsetWidth + 16, 0) - 16;
        if (totalWidth <= availableWidth) {
            newVisibleCount = tabs.length;
        }

        visibleCount = Math.max(1, newVisibleCount);
    }

    onMount(() => {
        if (!container) return;
        const observer = new ResizeObserver(() => {
            updateOverflow();
        });
        observer.observe(container);
        updateOverflow();
        return () => observer.disconnect();
    });

    // Handle clicks outside dropdown
    function handleWindowClick() {
        dropdownOpen = false;
    }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="bg-gray-900 border-b border-gray-800 shrink-0 px-6 relative" bind:this={container}>
    <nav class="flex gap-4 items-center">
        <!-- Hidden measuring tabs (opacity 0, absolute) -->
        <div class="absolute opacity-0 pointer-events-none flex gap-4 whitespace-nowrap" aria-hidden="true">
            {#each tabs as tab, i}
                <button bind:this={tabElements[i]} class="py-3 text-xs font-bold uppercase">
                    {tab.label}
                </button>
            {/each}
        </div>

        <!-- Visible Tabs -->
        {#each visibleTabs as tab}
            <button
                onclick={() => goto(tab.href)}
                class="py-3 text-xs font-bold uppercase transition border-b-2 whitespace-nowrap {activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'}"
            >
                {tab.label}
            </button>
        {/each}

        <!-- More Dropdown -->
        {#if hiddenTabs.length > 0}
            <div class="relative flex items-center">
                <button
                    onclick={(e) => {
                        e.stopPropagation();
                        dropdownOpen = !dropdownOpen;
                    }}
                    class="p-2 text-gray-400 hover:text-white transition rounded-md hover:bg-gray-800 {isActiveInDropdown ? 'text-blue-400' : ''}"
                >
                    <Icon path={mdiDotsVertical} size={18} />
                </button>

                {#if dropdownOpen}
                    <div 
                        class="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-800 rounded-md shadow-xl z-[100] py-1 overflow-hidden"
                        onclick={(e) => e.stopPropagation()}
                    >
                        {#each hiddenTabs as tab}
                            <button
                                onclick={() => {
                                    goto(tab.href);
                                    dropdownOpen = false;
                                }}
                                class="w-full text-left px-4 py-2 text-xs font-bold uppercase transition hover:bg-gray-800 {activeTab === tab.id ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400'}"
                            >
                                {tab.label}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </nav>
</div>
