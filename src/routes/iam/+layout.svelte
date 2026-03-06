<script lang="ts">
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    let activeTab = $derived($page.url.pathname.split("/").pop() || "users");

    const tabs = [
        { id: "users", label: "Users" },
        { id: "groups", label: "Groups" },
        { id: "roles", label: "Roles" },
        { id: "policies", label: "Policies" },
    ];

    function handleTabChange(tabId: string) {
        goto(`/iam/${tabId}`);
    }
</script>

<ServiceLayout title="IAM" {tabs} {activeTab} onTabChange={handleTabChange}>
    {@render children()}
</ServiceLayout>
