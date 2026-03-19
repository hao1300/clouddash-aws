<script lang="ts">
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import MetricChart from "$lib/components/MetricChart.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";

    let queueName = $derived($page.params.queueName || "");

    $effect(() => {
        titleService.setResource(queueName, undefined, $page.url.pathname);
    });

    let metricsLoading = $state(false);
    let metricsData = $state({
        messagesVisible: [] as any[],
        messagesSent: [] as any[],
        messagesReceived: [] as any[],
        messagesDeleted: [] as any[],
    });

    $effect(() => {
        if (aws.cw && queueName) {
            loadMetrics();
        }
    });

    async function loadMetrics() {
        if (!aws.cw) return;
        metricsLoading = true;

        try {
            const end = new Date();
            const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // last 24h

            const fetchMetric = async (metricName: string) => {
                const resp = await aws.cw!.send(
                    new GetMetricStatisticsCommand({
                        Namespace: "AWS/SQS",
                        MetricName: metricName,
                        Dimensions: [{ Name: "QueueName", Value: queueName }],
                        StartTime: start,
                        EndTime: end,
                        Period: 300, // 5 minutes
                        Statistics: ["Average", "Sum"],
                    }),
                );

                return (resp.Datapoints || []).map((dp) => ({
                    rawTimestamp: dp.Timestamp!,
                    rawAverage:
                        metricName === "ApproximateNumberOfMessagesVisible"
                            ? dp.Average || 0
                            : dp.Sum || 0,
                }));
            };

            const [visible, sent, received, deleted] = await Promise.all([
                fetchMetric("ApproximateNumberOfMessagesVisible"),
                fetchMetric("NumberOfMessagesSent"),
                fetchMetric("NumberOfMessagesReceived"),
                fetchMetric("NumberOfMessagesDeleted"),
            ]);

            metricsData = {
                messagesVisible: visible,
                messagesSent: sent,
                messagesReceived: received,
                messagesDeleted: deleted,
            };
        } catch (e) {
            console.error(e);
        } finally {
            metricsLoading = false;
        }
    }
</script>

<div
    class="h-full flex flex-col p-4 bg-gray-950 text-white overflow-hidden relative"
>
    <div
        class="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-auto"
    >
        <div class="bg-gray-900 p-4 rounded-lg border border-gray-800">
            <MetricChart
                title="Messages Visible (Avg)"
                data={metricsData.messagesVisible}
                loading={metricsLoading}
            />
        </div>
        <div class="bg-gray-900 p-4 rounded-lg border border-gray-800">
            <MetricChart
                title="Messages Sent (Sum)"
                data={metricsData.messagesSent}
                loading={metricsLoading}
            />
        </div>
        <div class="bg-gray-900 p-4 rounded-lg border border-gray-800">
            <MetricChart
                title="Messages Received (Sum)"
                data={metricsData.messagesReceived}
                loading={metricsLoading}
            />
        </div>
        <div class="bg-gray-900 p-4 rounded-lg border border-gray-800">
            <MetricChart
                title="Messages Deleted (Sum)"
                data={metricsData.messagesDeleted}
                loading={metricsLoading}
            />
        </div>
    </div>
</div>
