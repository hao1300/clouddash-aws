<script lang="ts">
    import {
        DescribeStackResourcesCommand,
        DescribeStacksCommand,
        type Stack,
        type StackResource,
    } from "@aws-sdk/client-cloudformation";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import { mdiCircle, mdiChevronDown } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    let stackId = $derived($page.params.id || "");

    $effect(() => {
        const name = stack?.StackName || stackId.split("/")[1] || stackId;
        titleService.setResource(name, undefined, $page.url.pathname);
    });

    let resources = $state<StackResource[]>([]);
    let stack = $state<Stack | null>(null);
    let loading = $state(false);
    let error = $state("");

    // Metadata starts collapsed — the resources table is what people come here for,
    // and the four info cards otherwise push it off a phone screen.
    let detailsCollapsed = $state(true);
    let resourcesCollapsed = $state(false);

    $effect(() => {
        if (aws.cloudFormation && stackId) {
            loadStackDetails();
        }
    });

    // Guards against a slow response for a previously viewed stack landing after
    // the user has already navigated to a different one.
    let detailReq = 0;

    async function loadStackDetails() {
        if (!aws.cloudFormation || !stackId) return;
        const req = ++detailReq;
        try {
            loading = true;
            error = "";
            const [resDetails, resResources] = await Promise.all([
                aws.cloudFormation.send(
                    new DescribeStacksCommand({ StackName: stackId }),
                ),
                aws.cloudFormation.send(
                    new DescribeStackResourcesCommand({ StackName: stackId }),
                ),
            ]);
            if (req !== detailReq) return;
            stack = resDetails.Stacks?.[0] ?? null;
            resources = resResources.StackResources || [];
        } catch (e: any) {
            if (req !== detailReq) return;
            error = e.message || String(e);
        } finally {
            if (req === detailReq) loading = false;
        }
    }
</script>

{#snippet statusCell(v: string)}
    <div class="flex items-center gap-1.5">
        <Icon
            path={mdiCircle}
            size={10}
            color={v?.includes("COMPLETE")
                ? COLORS.SUCCESS
                : v?.includes("FAILED") || v?.includes("ROLLBACK")
                  ? COLORS.ERROR
                  : COLORS.CAUTION}
        />
        <span>{v}</span>
    </div>
{/snippet}

<div class="h-full relative overflow-hidden flex flex-col bg-gray-950">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div
        class="flex-1 overflow-y-auto flex flex-col gap-3 p-2 {error
            ? 'pt-8'
            : ''}"
    >
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
            <!-- Stack metadata -->
            <section
                class="bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden shrink-0"
            >
                <button
                    class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left shrink-0 {detailsCollapsed
                        ? ''
                        : 'border-b border-gray-800'}"
                    onclick={() => (detailsCollapsed = !detailsCollapsed)}
                    aria-expanded={!detailsCollapsed}
                >
                    <span
                        class="text-xs font-bold text-gray-300 uppercase tracking-wider truncate"
                        >Stack Details</span
                    >
                    <Icon
                        path={mdiChevronDown}
                        size={16}
                        class="text-gray-500 shrink-0 transition-transform duration-200 {detailsCollapsed
                            ? ''
                            : 'rotate-180'}"
                    />
                </button>

                {#if !detailsCollapsed}
                    <div
                        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4"
                    >
                        <InfoCard label="Stack ID" value={stack.StackId} />
                        <InfoCard label="Status" value={stack.StackStatus} />
                        <InfoCard
                            label="Created"
                            value={stack.CreationTime?.toLocaleString()}
                        />
                        <InfoCard
                            label="Description"
                            value={stack.Description || "-"}
                        />
                    </div>
                {/if}
            </section>

            <!-- Resources -->
            <section
                class="bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden shrink-0"
            >
                <button
                    class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left shrink-0 {resourcesCollapsed
                        ? ''
                        : 'border-b border-gray-800'}"
                    onclick={() => (resourcesCollapsed = !resourcesCollapsed)}
                    aria-expanded={!resourcesCollapsed}
                >
                    <span
                        class="text-xs font-bold text-gray-300 uppercase tracking-wider truncate"
                    >
                        Resources
                        {#if resources.length > 0}
                            <span class="text-blue-400 ml-2"
                                >({resources.length})</span
                            >
                        {/if}
                    </span>
                    <Icon
                        path={mdiChevronDown}
                        size={16}
                        class="text-gray-500 shrink-0 transition-transform duration-200 {resourcesCollapsed
                            ? ''
                            : 'rotate-180'}"
                    />
                </button>

                {#if !resourcesCollapsed}
                    <!-- PaginatedTable is h-full, so it needs a parent with a
                         definite height. flex-1 alone collapses to zero here. -->
                    <div
                        class="{detailsCollapsed
                            ? 'h-[72dvh]'
                            : 'h-[60dvh]'} min-h-[320px] overflow-hidden"
                    >
                        <PaginatedTable
                            items={resources}
                            loading={false}
                            columns={[
                                {
                                    label: "Logical ID",
                                    key: "LogicalResourceId",
                                },
                                {
                                    label: "Physical ID",
                                    key: "PhysicalResourceId",
                                },
                                { label: "Type", key: "ResourceType" },
                                {
                                    label: "Status",
                                    key: "ResourceStatus",
                                    renderCell: statusCell,
                                },
                                {
                                    label: "Last Updated",
                                    key: "LastUpdatedTimestamp",
                                    format: (v) =>
                                        v ? new Date(v).toLocaleString() : "-",
                                },
                            ]}
                        />
                    </div>
                {/if}
            </section>
        {/if}
    </div>
</div>
