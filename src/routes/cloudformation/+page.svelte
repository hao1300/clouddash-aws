<script lang="ts">
    import {
        DescribeStackResourcesCommand,
        DescribeStacksCommand,
        type Stack,
        type StackResource,
    } from "@aws-sdk/client-cloudformation";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiCircle, mdiChevronDown } from "@mdi/js";
    import { COLORS } from "$lib/constants";

    let stacks = $state<Stack[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    // The selected stack lives in the query string so the master/detail view stays
    // deep-linkable and the browser back button steps out of the detail.
    let selectedStackName = $derived($page.url.searchParams.get("stack") || "");
    let listCollapsed = $state(false);
    // Stack metadata starts collapsed — the resources table is what people come here
    // for, and the four info cards push it off a phone screen.
    let detailsCollapsed = $state(true);
    let resourcesCollapsed = $state(false);

    let stack = $state<Stack | null>(null);
    let resources = $state<StackResource[]>([]);
    let detailLoading = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.cloudFormation && !__initLoaded) {
            __initLoaded = true;
            loadStacks();
        }
    });

    // Selecting a stack collapses the list so the details own the viewport. On a
    // phone the two sections cannot both fit, so the collapse is what makes the
    // detail reachable at all.
    $effect(() => {
        const name = selectedStackName;
        if (!name) {
            stack = null;
            resources = [];
            titleService.setResources([]);
            return;
        }
        listCollapsed = true;
        detailsCollapsed = true;
        resourcesCollapsed = false;
        titleService.setResource(name, undefined, "/cloudformation");
        if (aws.cloudFormation) loadStackDetails(name);
    });

    async function loadStacks(token?: string) {
        if (!aws.cloudFormation) return;
        try {
            loading = true;
            error = "";
            const res = await aws.cloudFormation.send(
                new DescribeStacksCommand({ NextToken: token }),
            );
            stacks = res.Stacks || [];
            if (token) history.push(token);
            marker = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    // Guards against a slow response for a previously selected stack landing after
    // the user has already picked a different one.
    let detailReq = 0;

    async function loadStackDetails(name: string) {
        if (!aws.cloudFormation) return;
        const req = ++detailReq;
        try {
            detailLoading = true;
            error = "";
            const [resDetails, resResources] = await Promise.all([
                aws.cloudFormation.send(
                    new DescribeStacksCommand({ StackName: name }),
                ),
                aws.cloudFormation.send(
                    new DescribeStackResourcesCommand({ StackName: name }),
                ),
            ]);
            if (req !== detailReq) return;
            stack = resDetails.Stacks?.[0] ?? null;
            resources = resResources.StackResources || [];
        } catch (e: any) {
            if (req !== detailReq) return;
            error = e.message || String(e);
        } finally {
            if (req === detailReq) detailLoading = false;
        }
    }

    function selectStack(item: Stack) {
        goto(`/cloudformation?stack=${encodeURIComponent(item.StackName || "")}`, {
            keepFocus: true,
            noScroll: true,
        });
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
        <!-- Stacks list — collapses once a stack is selected -->
        <section
            class="bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden {selectedStackName
                ? 'shrink-0'
                : 'flex-1 min-h-0'}"
        >
            <button
                class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left shrink-0 {listCollapsed
                    ? ''
                    : 'border-b border-gray-800'}"
                onclick={() => (listCollapsed = !listCollapsed)}
                aria-expanded={!listCollapsed}
            >
                <span
                    class="text-xs font-bold text-gray-300 uppercase tracking-wider truncate"
                >
                    Stacks
                    {#if stacks.length > 0}
                        <span class="text-blue-400 ml-2">({stacks.length})</span
                        >
                    {/if}
                </span>
                <Icon
                    path={mdiChevronDown}
                    size={16}
                    class="text-gray-500 shrink-0 transition-transform duration-200 {listCollapsed
                        ? ''
                        : 'rotate-180'}"
                />
            </button>

            {#if !listCollapsed}
                <!-- PaginatedTable is h-full, so it needs a parent with a definite
                     height. flex-1 alone collapses to zero on short viewports. -->
                <div
                    class="{selectedStackName
                        ? 'h-[55dvh] min-h-[280px]'
                        : 'flex-1 min-h-0'} overflow-hidden"
                >
                    <PaginatedTable
                        items={stacks}
                        {loading}
                        onRefresh={() => {
                            history = [];
                            loadStacks();
                        }}
                        hasNext={!!marker}
                        hasPrev={history.length > 0}
                        onNext={() => loadStacks(marker)}
                        onPrev={() => {
                            history.pop();
                            loadStacks(history[history.length - 1]);
                        }}
                        columns={[
                            {
                                label: "Stack Name",
                                key: "StackName",
                                onClick: (item) => selectStack(item),
                            },
                            {
                                label: "Status",
                                key: "StackStatus",
                                renderCell: statusCell,
                            },
                            {
                                label: "Creation Time",
                                key: "CreationTime",
                                format: (v) =>
                                    v ? new Date(v).toLocaleString() : "",
                            },
                            { label: "Description", key: "Description" },
                        ]}
                    />
                </div>
            {/if}
        </section>

        <!-- Selected stack details -->
        {#if selectedStackName}
            {#if detailLoading}
                <div
                    class="py-12 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest shrink-0"
                >
                    Loading Stack Details...
                </div>
            {:else if stack}
                <!-- Stack metadata — collapsed by default so Resources stays in view -->
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
                        <span class="flex items-baseline gap-2 min-w-0">
                            <span
                                class="text-xs font-bold text-gray-300 uppercase tracking-wider shrink-0"
                                >Stack Details</span
                            >
                            <span class="text-xs text-gray-500 truncate"
                                >{selectedStackName}</span
                            >
                        </span>
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
                        onclick={() =>
                            (resourcesCollapsed = !resourcesCollapsed)}
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
                                            v
                                                ? new Date(v).toLocaleString()
                                                : "-",
                                    },
                                ]}
                            />
                        </div>
                    {/if}
                </section>
            {/if}
        {/if}
    </div>
</div>
