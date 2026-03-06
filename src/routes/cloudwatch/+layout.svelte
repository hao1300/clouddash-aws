<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    const tabs = [
        { id: "alarms", label: "Alarms" },
        { id: "metrics", label: "Metrics" },
        { id: "dashboards", label: "Dashboards" },
        { id: "logs", label: "Log Groups" },
        { id: "insights", label: "Logs Insights" },
    ];

    let activeTab = $derived($page.url.pathname.split("/").pop() || "alarms");

    function handleTabChange(tabId: string) {
        goto(`/cloudwatch/${tabId}`);
    }
</script>

<ServiceLayout
    title="CloudWatch"
    {tabs}
    {activeTab}
    onTabChange={handleTabChange}
>
    {@render children()}
</ServiceLayout>
