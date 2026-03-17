<script lang="ts">
    import { fly, fade } from 'svelte/transition';
    import { toastService } from '$lib/services/toast.svelte';
</script>

<div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
    {#each toastService.activeToasts as toast (toast.id)}
        <div
            in:fly={{ y: 20, duration: 300 }}
            out:fade={{ duration: 200 }}
            class="pointer-events-auto px-4 py-2 rounded-lg shadow-2xl border flex items-center gap-3 min-w-[200px] max-w-md
                {toast.type === 'success' ? 'bg-green-600/90 border-green-500 text-white' : 
                 toast.type === 'error' ? 'bg-red-600/90 border-red-500 text-white' : 
                 'bg-gray-800/90 border-gray-700 text-gray-200'}"
        >
            {#if toast.type === 'success'}
                <span class="text-sm">✓</span>
            {:else if toast.type === 'error'}
                <span class="text-sm">⚠</span>
            {:else}
                <span class="text-sm">ℹ</span>
            {/if}
            
            <span class="text-xs font-medium">{toast.message}</span>
            
            <button 
                onclick={() => toastService.remove(toast.id)}
                class="ml-auto text-white/50 hover:text-white transition-colors text-sm px-1"
            >
                ×
            </button>
        </div>
    {/each}
</div>
