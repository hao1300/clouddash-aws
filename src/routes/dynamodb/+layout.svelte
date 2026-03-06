<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let tableName = $derived($page.url.searchParams.get("table") || "");
    let activeTab = $derived($page.url.pathname.split("/").pop() || "tables");

    let tabs = $derived([
        { id: "tables", label: "Tables" },
        ...(tableName
            ? [
                  { id: "details", label: "Details" },
                  { id: "explore", label: "Explore Items" },
              ]
            : []),
    ]);

    function handleTabChange(tabId: string) {
        const url = new URL($page.url);
        url.pathname = `/dynamodb/${tabId}`;
        goto(url.toString());
    }
</script>

<ServiceLayout
    title="DynamoDB"
    {tabs}
    {activeTab}
    onTabChange={handleTabChange}
>
    {@render children()}
</ServiceLayout>
