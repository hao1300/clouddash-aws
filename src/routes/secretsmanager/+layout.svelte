<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let secretId = $derived($page.url.searchParams.get("id") || "");
    let activeTab = $derived($page.url.pathname.split("/").pop() || "secrets");

    let tabs = $derived([
        { id: "secrets", label: "Secrets" },
        ...(secretId ? [{ id: "details", label: "Details" }] : []),
    ]);

    function handleTabChange(tabId: string) {
        const url = new URL($page.url);
        url.pathname = `/secretsmanager/${tabId}`;
        goto(url.toString());
    }
</script>

<ServiceLayout
    title="Secrets Manager"
    {tabs}
    {activeTab}
    onTabChange={handleTabChange}
>
    {@render children()}
</ServiceLayout>
