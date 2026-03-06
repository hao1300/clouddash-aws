<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let activeTab = $derived(
        $page.url.pathname.split("/").pop() || "environments",
    );

    const tabs = [
        { id: "environments", label: "Environments" },
        { id: "applications", label: "Applications" },
        { id: "versions", label: "Application Versions" },
    ];

    function handleTabChange(tabId: string) {
        goto(`/elasticbeanstalk/${tabId}`);
    }
</script>

<ServiceLayout
    title="Elastic Beanstalk"
    {tabs}
    {activeTab}
    onTabChange={handleTabChange}
>
    {@render children()}
</ServiceLayout>
