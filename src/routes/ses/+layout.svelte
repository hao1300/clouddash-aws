<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let activeTab = $derived(
        $page.url.pathname.split("/").pop() || "identities",
    );

    const tabs = [
        { id: "identities", label: "Identities" },
        { id: "configuration-sets", label: "Configuration Sets" },
        { id: "templates", label: "Templates" },
    ];

    function handleTabChange(tabId: string) {
        goto(`/ses/${tabId}`);
    }
</script>

<ServiceLayout title="SES" {tabs} {activeTab} onTabChange={handleTabChange}>
    {@render children()}
</ServiceLayout>
