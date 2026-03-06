<script lang="ts">
    import {
        DescribeApplicationsCommand,
        type ApplicationDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let applications = $state<ApplicationDescription[]>([]);
    let loading = $state(false);
    let error = $state("");

    $effect(() => {
        if (aws.eb && applications.length === 0) {
            loadApplications();
        }
    });

    async function loadApplications() {
        if (!aws.eb) return;
        try {
            loading = true;
            error = "";
            const res = await aws.eb.send(new DescribeApplicationsCommand({}));
            applications = res.Applications || [];
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <PaginatedTable
        items={applications}
        {loading}
        onRefresh={() => {
            loadApplications();
        }}
        hasNext={false}
        hasPrev={false}
        columns={[
            { label: "Application Name", key: "ApplicationName" },
            { label: "Description", key: "Description" },
            {
                label: "Date Created",
                key: "DateCreated",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
            {
                label: "Date Updated",
                key: "DateUpdated",
                format: (v) => (v ? new Date(v).toLocaleString() : ""),
            },
        ]}
    />
</div>
