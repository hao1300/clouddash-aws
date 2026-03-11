<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title,
        hideTitle = false,
        fullWidth = false,
        error = "",
        actionMsg = "",
        actionsSnippet,
        mainSnippet,
        sidebarSnippet,
        bottomSnippet,
        isSidebarCollapsed = $bindable(false),
    }: {
        title: string;
        hideTitle?: boolean;
        fullWidth?: boolean;
        error?: string;
        actionMsg?: string;
        actionsSnippet?: Snippet;
        mainSnippet: Snippet;
        sidebarSnippet?: Snippet;
        bottomSnippet?: Snippet;
        isSidebarCollapsed?: boolean;
    } = $props();
</script>

<div class="h-full relative overflow-hidden flex flex-col bg-gray-950 w-full text-white">
    {#if error}
        <div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">
            {error}
        </div>
    {/if}
    {#if actionMsg}
        <div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">
            {actionMsg}
        </div>
    {/if}

    <div class="flex-1 overflow-auto p-2 transition-all duration-300 ease-in-out {error || actionMsg ? 'pt-8' : ''}">
        <div class="{fullWidth ? 'w-full' : 'max-w-6xl mx-auto w-full'} flex flex-col gap-4 {bottomSnippet ? 'min-h-full' : 'h-full min-h-0'}">
            <!-- Header -->
            {#if !hideTitle}
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
                    <h1 class="text-2xl font-bold text-gray-100 break-words">{title}</h1>
                    {#if actionsSnippet}
                        <div class="flex gap-3 shrink-0">
                            {@render actionsSnippet()}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Content Area -->
            <div class="flex {bottomSnippet ? 'shrink-0' : 'h-full flex-1 min-h-0'} gap-4">
                <!-- Main Content Section -->
                <div class="flex-1 min-w-0 transition-all duration-300 h-full">
                    {@render mainSnippet()}
                </div>

                <!-- Sidebar Section -->
                {#if sidebarSnippet}
                    <div class="{isSidebarCollapsed ? 'w-10' : 'w-80'} shrink-0 transition-all duration-300 flex flex-col relative {bottomSnippet ? 'self-stretch' : 'h-full'}">
                        <button
                            onclick={() => isSidebarCollapsed = !isSidebarCollapsed}
                            class="absolute -left-3 top-1/2 -translate-y-1/2 bg-gray-800 border border-gray-700 rounded-full p-1 text-gray-400 hover:text-white hover:bg-gray-700 z-10 hidden lg:block shadow-md focus:outline-none"
                            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            <svg class="w-4 h-4 transition-transform duration-300 {isSidebarCollapsed ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                            </svg>
                        </button>
                        <div class="{isSidebarCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'} transition-all duration-300 h-full flex flex-col gap-4 w-80 overflow-y-auto overflow-x-hidden">
                            {@render sidebarSnippet()}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Bottom Section -->
            {#if bottomSnippet}
                <div class="flex-1 min-w-0 transition-all duration-300 mt-2 flex flex-col">
                    {@render bottomSnippet()}
                </div>
            {/if}
        </div>
    </div>
</div>
