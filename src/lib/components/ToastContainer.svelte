<script lang="ts">
    import { fly, fade } from 'svelte/transition';
    import { onMount } from 'svelte';
    import { toastService } from '$lib/services/toast.svelte';
    
</script>

<div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
    {#each toastService.activeToasts as toast (toast.id)}
        <!-- {console.log("Rendering toast:", toast.id)} -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            in:fly={{ y: 20, duration: 300 }}
            out:fade={{ duration: 200 }}
            onclick={() => {
                if (toast.onClick) {
                    toast.onClick();
                }
                toastService.remove(toast.id);
            }}
            class="pointer-events-auto px-4 py-2 rounded-lg shadow-2xl border flex items-center gap-3 min-w-[200px] max-w-md transition-all
                {toast.onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-95' : ''}
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
            
            <div class="flex flex-col">
                <span class="text-xs font-medium">{toast.message}</span>
                {#if toast.onClick}
                    <span class="text-[9px] opacity-70 underline mt-0.5">Click to open folder</span>
                {/if}
            </div>
            
            <button 
                onclick={(e) => {
                    e.stopPropagation();
                    toastService.remove(toast.id);
                }}
                class="ml-auto text-white/50 hover:text-white transition-colors text-sm px-1 shrink-0"
            >
                ×
            </button>
        </div>
    {/each}
</div>
