<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    const tabs = [{ id: "distributions", label: "Distributions" }];

    let activeTab = $derived(
        $page.url.pathname.split("/").pop() || "distributions",
    );

    function handleTabChange(tabId: string) {
        goto(`/cloudfront/${tabId}`);
    }
</script>

<ServiceLayout
    title="CloudFront"
    {tabs}
    {activeTab}
    onTabChange={handleTabChange}
>
    {@render children()}
</ServiceLayout>
