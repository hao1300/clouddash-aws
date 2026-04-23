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
</script>

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
