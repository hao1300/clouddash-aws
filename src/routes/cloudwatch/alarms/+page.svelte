<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import {
        DescribeAlarmsCommand,
        DeleteAlarmsCommand,
    } from "@aws-sdk/client-cloudwatch";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import { pushToken, popToken } from "$lib/utils/pagination";
    import { aws } from "$lib/services/aws.svelte";

    let error = $state("");
    let actionMsg = $state("");
    let loading = $state(false);

    let alarms = $state<any[]>([]);
    let alarmsLoading = $state(false);
    let alarmsTokenMap = $state<string[]>([]);
    let alarmsCurrentToken = $state<string | undefined>(undefined);

    $effect(() => {
        if (aws.cw && alarms.length === 0) {
            loadAlarms();
        }
    });

    $effect(() => {
        titleService.setResource("", undefined, $page.url.pathname);
    });

    async function loadAlarms(token?: string) {
        if (!aws.cw) return;
        try {
            alarmsLoading = true;
            error = "";
            actionMsg = "";
            const params: any = { MaxRecords: 50, NextToken: token };
            const resp = await aws.cw.send(new DescribeAlarmsCommand(params));
            let fetched = (resp.MetricAlarms ?? []).map((a) => ({
                name: a.AlarmName ?? "Unknown",
                state: a.StateValue ?? "UNKNOWN",
                description: a.AlarmDescription ?? null,
                metric: a.MetricName ?? "",
                namespace: a.Namespace ?? "",
                condition: `${a.ComparisonOperator} ${a.Threshold}`,
                updated: a.StateUpdatedTimestamp?.toISOString(),
                dimensions: (a.Dimensions ?? [])
                    .map((d) => `${d.Name}=${d.Value}`)
                    .join(" "),
            }));

            fetched.sort((a, b) => {
                if (a.state === "ALARM" && b.state !== "ALARM") return -1;
                if (a.state !== "ALARM" && b.state === "ALARM") return 1;
                return a.name.localeCompare(b.name);
            });

            alarms = fetched;
            pushToken(alarmsTokenMap, resp.NextToken);
            alarmsCurrentToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            alarmsLoading = false;
        }
    }

    async function deleteAlarm(alarmName: string) {
        if (!aws.cw) return;
        if (!confirm(`Are you sure you want to delete alarm "${alarmName}"?`))
            return;
        try {
            alarmsLoading = true;
            error = "";
            actionMsg = "";
            await aws.cw.send(
                new DeleteAlarmsCommand({
                    AlarmNames: [alarmName],
                }),
            );
            actionMsg = `Alarm "${alarmName}" deleted.`;
            alarmsTokenMap = [];
            await loadAlarms();
        } catch (e) {
            error = String(e);
            alarmsLoading = false;
        }
    }

    function navigateToMetric(item: any) {
        const dimensions = JSON.stringify(
            (item.dimensions || "")
                .split(" ")
                .map((d: string) => {
                    const [Name, Value] = d.split("=");
                    return { Name, Value };
                })
                .filter((d: any) => d.Name && d.Value),
        );
        const url = `/cloudwatch/metrics/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.metric)}?dimensions=${encodeURIComponent(dimensions)}`;
        goto(url);
    }
</script>

<PaginatedTable
    items={alarms}
    loading={alarmsLoading}
    hasNext={!!alarmsCurrentToken}
    hasPrev={alarmsTokenMap.length > 0}
    {error}
    {actionMsg}
    onNext={() => loadAlarms(alarmsCurrentToken)}
    onPrev={() => loadAlarms(popToken(alarmsTokenMap))}
    onRefresh={() => {
        alarmsTokenMap = [];
        loadAlarms();
    }}
    columns={[
        {
            key: "name",
            label: "Alarm Name",
            onClick: (item) => {
                goto(`/cloudwatch/alarms/${encodeURIComponent(item.name)}`);
            },
        },
        {
            key: "state",
            label: "State",
            format: (v) =>
                v === "ALARM"
                    ? "🔴 ALARM"
                    : v === "OK"
                      ? "🟢 OK"
                      : `⚪ ${v}`,
        },
        {
            key: "metric",
            label: "Metric",
            onClick: (item) => navigateToMetric(item),
        },
        { key: "condition", label: "Condition" },
        {
            key: "updated",
            label: "Last Updated",
            format: (v) => (v ? new Date(v).toLocaleString() : "-"),
        },
    ]}
>
    {#snippet actionsSnippet(item)}
        <button
            onclick={(e) => {
                e.stopPropagation();
                deleteAlarm(item.name);
            }}
            class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-600/10 hover:bg-red-600/20 rounded transition"
            >Delete</button
        >
    {/snippet}
</PaginatedTable>
