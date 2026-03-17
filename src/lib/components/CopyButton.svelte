<script lang="ts">
    import { toastService } from "$lib/services/toast.svelte";

    let { text, label = "", class: className = "" }: { 
        text: string; 
        label?: string; 
        class?: string 
    } = $props();

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(text);
            toastService.success("Copied to clipboard!");
        } catch (err) {
            console.error("Failed to copy: ", err);
            toastService.error("Failed to copy to clipboard");
        }
    }
</script>

<button
    onclick={handleCopy}
    class="flex items-center gap-2 transition {className}"
    title="Copy to clipboard"
>
    {#if label}
        <span class="truncate">{label}</span>
    {/if}
    <span class="text-gray-500 hover:text-white transition">📋</span>
</button>
