<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        label,
        value = "",
        href = "",
        onclick = null,
        children = null,
        className = "",
        valueClass = ""
    }: {
        label: string;
        value?: string;
        href?: string;
        onclick?: (() => void) | null;
        children?: Snippet | null;
        className?: string;
        valueClass?: string;
    } = $props();
</script>

<div class="bg-gray-900/50 rounded-lg border border-gray-800 p-4 shadow-sm group transition-all duration-200 hover:border-gray-700/50 flex flex-col min-w-0 {className}">
    <h4 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 group-hover:text-gray-300 transition-colors shrink-0">
        {label}
    </h4>
    
    <div class="flex-1 min-h-0">
        {#if children}
            <div class="line-clamp-3 group-hover:line-clamp-none transition-all">
                {@render children()}
            </div>
        {:else if href}
            <a 
                {href} 
                class="text-xs sm:text-sm font-bold text-blue-400 hover:text-blue-300 transition-all break-all leading-relaxed font-mono bg-gray-950/40 px-3 py-2 rounded border border-gray-800/30 block group-hover:bg-blue-500/5 group-hover:border-blue-500/20 line-clamp-3 group-hover:line-clamp-none {valueClass}"
            >
                {value}
            </a>
        {:else if onclick}
            <button 
                {onclick}
                class="text-xs sm:text-sm font-bold text-blue-400 hover:text-blue-300 transition-all text-left break-all leading-relaxed font-mono bg-gray-950/40 px-3 py-2 rounded border border-gray-800/30 block w-full group-hover:bg-blue-500/5 group-hover:border-blue-500/20 line-clamp-3 group-hover:line-clamp-none {valueClass}"
            >
                {value}
            </button>
        {:else}
            <div class="text-xs sm:text-sm font-bold text-gray-200 break-words leading-relaxed bg-gray-950/40 px-3 py-2 rounded border border-gray-800/30 line-clamp-3 group-hover:line-clamp-none transition-all {valueClass}">
                {value || "-"}
            </div>
        {/if}
    </div>
</div>
