<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let bucket = $derived($page.url.searchParams.get("bucket") || "");
    let activeTab = $derived($page.url.pathname.split("/").pop() || "buckets");

    let tabs = $derived([
        { id: "buckets", label: "Buckets" },
        ...(bucket ? [{ id: "objects", label: "Objects" }] : []),
    ]);

    function handleTabChange(tabId: string) {
        const url = new URL($page.url);
        url.pathname = `/s3/${tabId}`;
        goto(url.toString());
    }
</script>

<ServiceLayout title="S3" {tabs} {activeTab} onTabChange={handleTabChange}>
    {@render children()}
</ServiceLayout>
