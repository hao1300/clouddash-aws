<script lang="ts">
    import {
        DescribeStackResourcesCommand,
        DescribeStacksCommand,
        type StackResource,
    } from "@aws-sdk/client-cloudformation";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    let stackId = $derived($page.url.searchParams.get("id") || "");

    let resources = $state<StackResource[]>([]);
    let stack = $state<any>(null);
    let loading = $state(false);
    let error = $state("");

    $effect(() => {
        if (aws.cf && stackId) {
            loadStackDetails();
        }
    });

    async function loadStackDetails() {
        if (!aws.cf || !stackId) return;
        try {
            loading = true;
            error = "";
            const [resDetails, resResources] = await Promise.all([
                aws.cf.send(new DescribeStacksCommand({ StackName: stackId })),
                aws.cf.send(
                    new DescribeStackResourcesCommand({ StackName: stackId }),
                ),
            ]);
            stack = resDetails.Stacks?.[0];
            resources = resResources.StackResources || [];
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleBack() {
        goto("/cloudformation/stacks");
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-auto p-6 relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div class="flex items-center gap-3 mb-8 shrink-0">
        <button
            onclick={handleBack}
            class="text-xs text-blue-400 hover:text-blue-300 transition"
            >← Back to Stacks</button
        >
        <h2 class="text-sm font-bold text-gray-200">
            {stackId}
            <span class="text-gray-500 font-normal ml-2"
                >{stack?.StackStatus}</span
            >
        </h2>
    </div>

    {#if !stackId}
        <div
            class="p-8 text-gray-500 italic text-xs uppercase tracking-widest bg-gray-900/20 border border-gray-800 rounded-lg text-center"
        >
            No Stack Selected
        </div>
    {:else if loading}
        <div
            class="flex-1 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest"
        >
            Loading Stack Details...
        </div>
    {:else if stack}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {#each [{ label: "Stack ID", value: stack.StackId }, { label: "Status", value: stack.StackStatus }, { label: "Created", value: stack.CreationTime?.toLocaleString() }, { label: "Description", value: stack.Description || "-" }] as item}
                <div
                    class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
                >
                    <div
                        class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                    >
                        {item.label}
                    </div>
                    <div
                        class="text-xs font-bold text-gray-200 truncate"
                        title={item.value}
                    >
                        {item.value}
                    </div>
                </div>
            {/each}
        </div>

        <div class="flex-1 min-h-0 flex flex-col">
            <h3
                class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 border-b border-gray-800 pb-2"
            >
                Resources
            </h3>
            <div
                class="flex-1 min-h-0 border border-gray-800 rounded-xl overflow-hidden"
            >
                <PaginatedTable
                    items={resources}
                    loading={false}
                    columns={[
                        { label: "Logical ID", key: "LogicalResourceId" },
                        { label: "Physical ID", key: "PhysicalResourceId" },
                        { label: "Type", key: "ResourceType" },
                        { label: "Status", key: "ResourceStatus" },
                        {
                            label: "Last Updated",
                            key: "LastUpdatedTimestamp",
                            format: (v) =>
                                v ? new Date(v).toLocaleString() : "-",
                        },
                    ]}
                />
            </div>
        </div>
    {/if}
</div>
