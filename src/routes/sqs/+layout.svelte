<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let queueUrl = $derived($page.url.searchParams.get("queue") || "");
    let activeTab = $derived($page.url.pathname.split("/").pop() || "queues");

    let tabs = $derived([
        { id: "queues", label: "Queues" },
        ...(queueUrl
            ? [
                  { id: "messages", label: "Messages" },
                  { id: "config", label: "Configuration" },
              ]
            : []),
    ]);

    function handleTabChange(tabId: string) {
        const url = new URL($page.url);
        url.pathname = `/sqs/${tabId}`;
        goto(url.toString());
    }
</script>

<ServiceLayout title="SQS" {tabs} {activeTab} onTabChange={handleTabChange}>
    {@render children()}
</ServiceLayout>
