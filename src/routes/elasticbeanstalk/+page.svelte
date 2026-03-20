<script lang="ts">
    import {
        DescribeEnvironmentsCommand,
        type EnvironmentDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let environments = $state<EnvironmentDescription[]>([]);
    let loading = $state(false);
    let error = $state("");
    let marker = $state<string | undefined>(undefined);
    let history = $state<string[]>([]);

    let __initLoaded = false;
    $effect(() => {
        if (aws.eb && !__initLoaded) {
            __initLoaded = true;
            loadEnvironments();
        }
    });

    async function loadEnvironments(token?: string) {
        if (!aws.eb) return;
        try {
            loading = true;
            error = "";
            const res = await aws.eb.send(
                new DescribeEnvironmentsCommand({ NextToken: token }),
            );
            environments = res.Environments || [];
            if (token) history.push(token);
            marker = res.NextToken;
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
        items={environments}
        {loading}
        onRefresh={() => {
            history = [];
            loadEnvironments();
        }}
        hasNext={!!marker}
        hasPrev={history.length > 0}
        onNext={() => loadEnvironments(marker)}
        onPrev={() => {
            history.pop();
            loadEnvironments(history[history.length - 1]);
        }}
        columns={[
            { label: "Environment Name", key: "EnvironmentName" },
            { label: "Application", key: "ApplicationName" },
            {
                label: "Status",
                key: "Status",
                format: (v) => (v === "Ready" ? "🟢 Ready" : "🟠 " + v),
            },
            {
                label: "Health",
                key: "Health",
                format: (v) =>
                    v === "Green"
                        ? "🟢 Green"
                        : v === "Yellow"
                          ? "🟡 Yellow"
                          : v === "Red"
                            ? "🔴 Red"
                            : "⚪ " + (v || "Unknown"),
            },
        ]}
    />
</div>
