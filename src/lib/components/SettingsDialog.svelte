<script lang="ts">
    import Modal from "./Modal.svelte";
    import ReorderableList from "./ReorderableList.svelte";
    import type { ServiceDef } from "$lib/services/registry";

    let {
        open = $bindable(false),
        profileOrder = $bindable([]),
        profileVisible = $bindable(new Set()),
        regionOrder = $bindable([]),
        regionVisible = $bindable(new Set()),
        serviceOrder = $bindable([]),
        serviceVisible = $bindable(new Set()),
        services = [],
        onChange,
    }: {
        open: boolean;
        profileOrder: string[];
        profileVisible: Set<string>;
        regionOrder: string[];
        regionVisible: Set<string>;
        serviceOrder: string[];
        serviceVisible: Set<string>;
        services: ServiceDef[];
        onChange: () => void;
    } = $props();

    let settingsTab = $state<"profiles" | "regions" | "services">("profiles");

    function toggleInSet(s: Set<string>, id: string, minSize = 1): Set<string> {
        const next = new Set(s);
        if (next.has(id)) {
            if (next.size > minSize) next.delete(id);
        } else next.add(id);
        return next;
    }

    function toggleProfile(id: string) {
        profileVisible = toggleInSet(profileVisible, id, 1);
        onChange();
    }

    function toggleRegion(id: string) {
        regionVisible = toggleInSet(regionVisible, id, 1);
        onChange();
    }

    function toggleService(id: string) {
        serviceVisible = toggleInSet(serviceVisible, id, 1);
        onChange();
    }

    function handleProfileReorder(newOrder: string[]) {
        profileOrder = newOrder;
        onChange();
    }

    function handleRegionReorder(newOrder: string[]) {
        regionOrder = newOrder;
        onChange();
    }

    function handleServiceReorder(newOrder: string[]) {
        serviceOrder = newOrder;
        onChange();
    }
</script>

<Modal bind:open title="Settings" maxWidth="max-w-xl">
    <div class="flex -m-5" style="height: 420px;">
        <!-- Left vertical tabs -->
        <div
            class="w-32 bg-gray-950 border-r border-gray-800 flex flex-col py-2 shrink-0"
        >
            {#each [["profiles", "Profiles"], ["regions", "Regions"], ["services", "Services"]] as const as [key, label]}
                <button
                    onclick={() => (settingsTab = key)}
                    class="px-4 py-2.5 text-left text-xs font-semibold transition whitespace-nowrap {settingsTab ===
                    key
                        ? 'bg-gray-800 text-blue-400 border-r-2 border-blue-500'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900 border-r-2 border-transparent'}"
                >
                    {label}
                </button>
            {/each}
        </div>

        <!-- Right content -->
        <div class="flex-1 p-4 overflow-auto">
            {#if settingsTab === "profiles"}
                <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    Profiles — drag to reorder
                </h3>
                <ReorderableList
                    items={profileOrder}
                    onReorder={handleProfileReorder}
                >
                    {#snippet children(id)}
                        <span class="flex-1 text-sm font-mono text-gray-200"
                            >{id}</span
                        >
                        <button
                            onclick={() => toggleProfile(id)}
                            aria-label="Toggle {id}"
                            class="w-9 h-5 rounded-full relative transition-colors {profileVisible.has(
                                id,
                            )
                                ? 'bg-blue-600'
                                : 'bg-gray-700'}"
                        >
                            <span
                                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {profileVisible.has(
                                    id,
                                )
                                    ? 'left-[18px]'
                                    : 'left-0.5'}"
                            ></span>
                        </button>
                    {/snippet}
                </ReorderableList>
            {:else if settingsTab === "regions"}
                <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    Regions — drag to reorder
                </h3>
                <ReorderableList
                    items={regionOrder}
                    onReorder={handleRegionReorder}
                >
                    {#snippet children(id)}
                        <span class="flex-1 text-sm font-mono text-gray-200"
                            >{id}</span
                        >
                        <button
                            onclick={() => toggleRegion(id)}
                            aria-label="Toggle {id}"
                            class="w-9 h-5 rounded-full relative transition-colors {regionVisible.has(
                                id,
                            )
                                ? 'bg-blue-600'
                                : 'bg-gray-700'}"
                        >
                            <span
                                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {regionVisible.has(
                                    id,
                                )
                                    ? 'left-[18px]'
                                    : 'left-0.5'}"
                            ></span>
                        </button>
                    {/snippet}
                </ReorderableList>
            {:else if settingsTab === "services"}
                <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    Services — drag to reorder
                </h3>
                <ReorderableList
                    items={serviceOrder}
                    onReorder={handleServiceReorder}
                >
                    {#snippet children(id)}
                        {@const svc = services.find((s) => s.id === id)}
                        {#if svc}
                            <span class="flex-1 text-sm text-gray-200"
                                >{svc.label}</span
                            >
                            <button
                                onclick={() => toggleService(id)}
                                aria-label="Toggle {svc.label}"
                                class="w-9 h-5 rounded-full relative transition-colors {serviceVisible.has(
                                    id,
                                )
                                    ? 'bg-blue-600'
                                    : 'bg-gray-700'}"
                            >
                                <span
                                    class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {serviceVisible.has(
                                        id,
                                    )
                                        ? 'left-[18px]'
                                        : 'left-0.5'}"
                                ></span>
                            </button>
                        {/if}
                    {/snippet}
                </ReorderableList>
            {/if}
        </div>
    </div>
</Modal>
