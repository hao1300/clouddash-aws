<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let fnName = $derived($page.url.searchParams.get("name") || "");
    let activeTab = $derived(
        $page.url.pathname.split("/").pop() || "functions",
    );

    let tabs = $derived([
        { id: "functions", label: "Functions" },
        ...(fnName ? [{ id: "details", label: "Details" }] : []),
    ]);

    function handleTabChange(tabId: string) {
        const url = new URL($page.url);
        url.pathname = `/lambda/${tabId}`;
        goto(url.toString());
    }
</script>

<ServiceLayout title="Lambda" {tabs} {activeTab} onTabChange={handleTabChange}>
    {@render children()}
</ServiceLayout>
