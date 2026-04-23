<script lang="ts">
    import { onMount } from "svelte";
    import Icon from "./Icon.svelte";
    import { mdiChevronDown } from "@mdi/js";

    let {
        value = $bindable(),
        options = [], // string[] or { value: string, label: string, color?: string }[]
        class: className = "",
        placeholder = "Select...",
        onchange,
        mono = false,
        small = false,
        primary = false,
    }: {
        value: any;
        options: (string | { value: any; label: string; color?: string; fontMono?: boolean })[];
        class?: string;
        placeholder?: string;
        onchange?: (val: any) => void;
        mono?: boolean;
        small?: boolean;
        primary?: boolean;
    } = $props();

    let isOpen = $state(false);
    let openUp = $state(false);
    let container: HTMLElement;

    const normalizedOptions = $derived(
        options.map((opt) =>
            typeof opt === "string" ? { value: opt, label: opt } : opt,
        ),
    );

    const selectedOption = $derived(
        normalizedOptions.find((opt) => opt.value === value),
    );

    function toggle() {
        if (!isOpen && container) {
            const rect = container.getBoundingClientRect();
            const dropdownMaxHeight = 240; // max-h-60 = 15rem = 240px
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            openUp = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;
        }
        isOpen = !isOpen;
    }

    function select(val: any) {
        value = val;
        isOpen = false;
        if (onchange) onchange(val);
    }

    function handleClickOutside(event: MouseEvent) {
        if (container && !container.contains(event.target as Node)) {
            isOpen = false;
        }
    }

    onMount(() => {
        window.addEventListener("click", handleClickOutside);
        return () => window.removeEventListener("click", handleClickOutside);
    });
</script>

<div class="relative inline-block w-full {className}" bind:this={container}>
    <button
        type="button"
        onclick={toggle}
        class="w-full flex items-center justify-between gap-2 bg-gray-800 rounded border border-gray-700 hover:border-gray-600 transition-all text-left {small ? 'p-1.5 text-[10px]' : 'p-2 text-sm'} {mono || selectedOption?.fontMono ? 'font-mono' : ''}"
    >
        <span class="truncate {selectedOption || primary ? 'text-blue-400' : 'text-gray-500'}">
            {selectedOption ? selectedOption.label : placeholder}
        </span>
        <Icon path={mdiChevronDown} size={small ? 14 : 16} class="{selectedOption || primary ? 'text-blue-400' : 'text-gray-500'} shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}" />
    </button>

    {#if isOpen}
        <div
            class="absolute z-[1000] left-0 right-0 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden py-1 max-h-60 overflow-y-auto animate-in {openUp ? 'bottom-full mb-1' : 'top-full mt-1'}"
        >
            {#each normalizedOptions as opt}
                <button
                    type="button"
                    onclick={() => select(opt.value)}
                    class="w-full text-left px-3 py-2 text-xs hover:bg-blue-600/20 hover:text-blue-400 transition-colors flex items-center justify-between {opt.value === value ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-300'} {mono || opt.fontMono ? 'font-mono' : ''}"
                >
                    <span class="truncate">{opt.label}</span>
                    {#if opt.value === value}
                        <div class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></div>
                    {/if}
                </button>
            {/each}
            {#if normalizedOptions.length === 0}
                <div class="px-3 py-4 text-center text-xs text-gray-600 italic">
                    No options available
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    @keyframes in {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
    .animate-in {
        animation: in 0.1s ease-out;
    }
</style>
