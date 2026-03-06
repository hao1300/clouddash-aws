<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let stackName = $derived($page.url.searchParams.get("stack") || "");
    let activeTab = $derived($page.url.pathname.split("/").pop() || "stacks");

    let tabs = $derived([
        { id: "stacks", label: "Stacks" },
        ...(stackName ? [{ id: "details", label: "Details" }] : []),
        { id: "exports", label: "Exports" },
        { id: "stack-sets", label: "StackSets" },
    ]);

    function handleTabChange(tabId: string) {
        const url = new URL($page.url);
        url.pathname = `/cloudformation/${tabId}`;
        goto(url.toString());
    }
</script>

<ServiceLayout
    title="CloudFormation"
    {tabs}
    {activeTab}
    onTabChange={handleTabChange}
>
    {@render children()}
</ServiceLayout>
