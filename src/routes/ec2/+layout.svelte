<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let instanceId = $derived($page.url.searchParams.get("id") || "");
    let activeTab = $derived(
        $page.url.pathname.split("/").pop() || "instances",
    );

    let tabs = $derived([
        { id: "instances", label: "Instances" },
        ...(instanceId ? [{ id: "details", label: "Details" }] : []),
        { id: "amis", label: "AMIs" },
        { id: "volumes", label: "Volumes" },
        { id: "snapshots", label: "Snapshots" },
        { id: "security-groups", label: "Security Groups" },
        { id: "key-pairs", label: "Key Pairs" },
        { id: "elastic-ips", label: "Elastic IPs" },
    ]);

    function handleTabChange(tabId: string) {
        const url = new URL($page.url);
        url.pathname = `/ec2/${tabId}`;
        goto(url.toString());
    }
</script>

<ServiceLayout title="EC2" {tabs} {activeTab} onTabChange={handleTabChange}>
    {@render children()}
</ServiceLayout>
