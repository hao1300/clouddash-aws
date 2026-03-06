<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let activeTab = $derived($page.url.pathname.split("/").pop() || "topics");

    const tabs = [
        { id: "topics", label: "Topics" },
        { id: "platform-apps", label: "Platform Applications" },
        { id: "subscriptions", label: "Subscriptions" },
    ];

    function handleTabChange(tabId: string) {
        goto(`/sns/${tabId}`);
    }
</script>

<ServiceLayout title="SNS" {tabs} {activeTab} onTabChange={handleTabChange}>
    {@render children()}
</ServiceLayout>
