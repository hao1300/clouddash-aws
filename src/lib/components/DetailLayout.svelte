<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title,
        actionsSnippet,
        mainSnippet,
        sidebarSnippet,
    }: {
        title: string;
        actionsSnippet?: Snippet;
        mainSnippet: Snippet;
        sidebarSnippet?: Snippet;
    } = $props();
</script>

<div class="max-w-6xl mx-auto flex flex-col gap-6 w-full">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 class="text-2xl font-bold text-gray-100 break-words">{title}</h1>
        {#if actionsSnippet}
            <div class="flex gap-3 shrink-0">
                {@render actionsSnippet()}
            </div>
        {/if}
    </div>

    <!-- Content Area -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Content Section -->
        <div class="lg:col-span-2 space-y-6">
            {@render mainSnippet()}
        </div>

        <!-- Sidebar Section -->
        {#if sidebarSnippet}
            <div class="flex flex-col gap-6">
                {@render sidebarSnippet()}
            </div>
        {/if}
    </div>
</div>
