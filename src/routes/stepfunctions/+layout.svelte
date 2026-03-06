<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let smArn = $derived($page.url.searchParams.get("arn") || "");
    let execArn = $derived($page.url.searchParams.get("exec") || "");
    let activeTab = $derived($page.url.pathname.split("/").pop() || "list");

    let tabs = $derived([
        { id: "list", label: "State Machines" },
        ...(smArn ? [{ id: "details", label: "Details" }] : []),
        ...(execArn ? [{ id: "execution", label: "Execution" }] : []),
    ]);

    function handleTabChange(tabId: string) {
        const url = new URL($page.url);
        url.pathname = `/stepfunctions/${tabId}`;
        goto(url.toString());
    }
</script>

<ServiceLayout
    title="Step Functions"
    {tabs}
    {activeTab}
    onTabChange={handleTabChange}
>
    {@render children()}
</ServiceLayout>
