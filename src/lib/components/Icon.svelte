<script lang="ts">
    let { 
        path, 
        size = "1em", 
        color = "currentColor", 
        class: className = "" 
    }: { 
        path: string; 
        size?: string | number; 
        color?: string; 
        class?: string;
    } = $props();

    const sizePx = typeof size === "number" ? `${size}px` : size;
    const isPath = $derived(path?.startsWith('/'));
</script>

{#if isPath}
    <img 
        src={path} 
        alt="" 
        class={className} 
        style="width: {sizePx}; height: {sizePx}; display: inline-block; vertical-align: middle;" 
    />
{:else}
    <svg
        viewBox="0 0 24 24"
        width={sizePx}
        height={sizePx}
        fill={color}
        class={className}
        style="display: inline-block; vertical-align: middle;"
    >
        <path d={path} />
    </svg>
{/if}
