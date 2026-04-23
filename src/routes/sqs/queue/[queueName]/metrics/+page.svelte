<script lang="ts">
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import MetricChart from "$lib/components/MetricChart.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import Select from "$lib/components/Select.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiClockOutline, mdiTrendingUp, mdiTrendingDown, mdiMinus } from "@mdi/js";

    let queueName = $derived($page.params.queueName || "");

    $effect(() => {
        titleService.setResource(queueName, undefined, $page.url.pathname);
    });

    let metricsLoading = $state(false);
    let timeRange = $state(1440); // 24 hours in minutes

    const timeRangeOptions = [
        { value: 60, label: "1 Hour", period: 60 },
        { value: 180, label: "3 Hours", period: 60 },
        { value: 720, label: "12 Hours", period: 300 },
        { value: 1440, label: "24 Hours", period: 300 },
        { value: 4320, label: "3 Days", period: 900 },
        { value: 10080, label: "7 Days", period: 3600 },
    ];

    let metricsData = $state({
        messagesVisible: [] as any[],
        messagesNotVisible: [] as any[],
        messagesDelayed: [] as any[],
        messagesSent: [] as any[],
        messagesReceived: [] as any[],
        messagesDeleted: [] as any[],
    });

    const latestValues = $derived({
        visible: metricsData.messagesVisible.slice(-1)[0]?.rawAverage || 0,
        notVisible: metricsData.messagesNotVisible.slice(-1)[0]?.rawAverage || 0,
        delayed: metricsData.messagesDelayed.slice(-1)[0]?.rawAverage || 0,
        sent: metricsData.messagesSent.slice(-1)[0]?.rawAverage || 0,
        received: metricsData.messagesReceived.slice(-1)[0]?.rawAverage || 0,
        deleted: metricsData.messagesDeleted.slice(-1)[0]?.rawAverage || 0,
    });

    $effect(() => {
        if (aws.cw && queueName && timeRange) {
            loadMetrics();
        }
    });

    async function loadMetrics() {
        if (!aws.cw) return;
        metricsLoading = true;

        const selectedRange = timeRangeOptions.find((o) => o.value === timeRange);
        const period = selectedRange?.period || 300;

        try {
            const end = new Date();
            const start = new Date(end.getTime() - timeRange * 60 * 1000);

            const fetchMetric = async (metricName: string) => {
                const resp = await aws.cw!.send(
                    new GetMetricStatisticsCommand({
                        Namespace: "AWS/SQS",
                        MetricName: metricName,
                        Dimensions: [{ Name: "QueueName", Value: queueName }],
                        StartTime: start,
                        EndTime: end,
                        Period: period,
                        Statistics: ["Average", "Sum"],
                    }),
                );

                return (resp.Datapoints || [])
                    .sort(
                        (a, b) =>
                            a.Timestamp!.getTime() - b.Timestamp!.getTime(),
                    )
                    .map((dp) => ({
                        rawTimestamp: dp.Timestamp!,
                        rawAverage:
                            metricName.startsWith("Approximate")
                                ? dp.Average || 0
                                : dp.Sum || 0,
                    }));
            };

            const [visible, notVisible, delayed, sent, received, deleted] =
                await Promise.all([
                    fetchMetric("ApproximateNumberOfMessagesVisible"),
                    fetchMetric("ApproximateNumberOfMessagesNotVisible"),
                    fetchMetric("ApproximateNumberOfMessagesDelayed"),
                    fetchMetric("NumberOfMessagesSent"),
                    fetchMetric("NumberOfMessagesReceived"),
                    fetchMetric("NumberOfMessagesDeleted"),
                ]);

            metricsData = {
                messagesVisible: visible,
                messagesNotVisible: notVisible,
                messagesDelayed: delayed,
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
    class="h-full flex flex-col bg-gray-950 text-white overflow-hidden relative"
>
    <!-- Header with Time Selector -->
    <div
        class="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10"
    >
        <div class="flex items-center gap-2">
            <div class="p-2 bg-blue-500/10 rounded-lg">
                <Icon path={mdiClockOutline} size={20} class="text-blue-400" />
            </div>
            <div>
                <h2 class="text-sm font-bold text-gray-200">Queue Metrics</h2>
                <p class="text-[10px] text-gray-500 font-mono">{queueName}</p>
            </div>
        </div>

        <div class="w-48">
            <Select
                bind:value={timeRange}
                options={timeRangeOptions}
                small
                placeholder="Select Time Range"
            />
        </div>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-auto p-4 custom-scrollbar">
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {#each [
                { label: 'Visible', value: latestValues.visible, color: 'text-green-400', bg: 'bg-green-400/5' },
                { label: 'Not Visible', value: latestValues.notVisible, color: 'text-yellow-400', bg: 'bg-yellow-400/5' },
                { label: 'Delayed', value: latestValues.delayed, color: 'text-orange-400', bg: 'bg-orange-400/5' },
                { label: 'Sent', value: latestValues.sent, color: 'text-blue-400', bg: 'bg-blue-400/5' },
                { label: 'Received', value: latestValues.received, color: 'text-purple-400', bg: 'bg-purple-400/5' },
                { label: 'Deleted', value: latestValues.deleted, color: 'text-red-400', bg: 'bg-red-400/5' }
            ] as card}
                <InfoCard 
                    label={card.label} 
                    value={card.value.toLocaleString()} 
                    className="{card.bg} !p-3 !rounded-xl"
                    valueClass="!text-lg !font-mono {card.color} !bg-transparent !border-none !px-0 !py-0"
                />
            {/each}
        </div>

        <!-- Charts Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-gray-900/40 p-4 rounded-xl border border-gray-800/50 shadow-lg">
                <MetricChart
                    title="Messages Visible (Avg)"
                    data={metricsData.messagesVisible}
                    loading={metricsLoading}
                />
            </div>
            <div class="bg-gray-900/40 p-4 rounded-xl border border-gray-800/50 shadow-lg">
                <MetricChart
                    title="Messages Not Visible (Avg)"
                    data={metricsData.messagesNotVisible}
                    loading={metricsLoading}
                />
            </div>
            <div class="bg-gray-900/40 p-4 rounded-xl border border-gray-800/50 shadow-lg">
                <MetricChart
                    title="Messages Delayed (Avg)"
                    data={metricsData.messagesDelayed}
                    loading={metricsLoading}
                />
            </div>
            <div class="bg-gray-900/40 p-4 rounded-xl border border-gray-800/50 shadow-lg">
                <MetricChart
                    title="Messages Sent (Sum)"
                    data={metricsData.messagesSent}
                    loading={metricsLoading}
                />
            </div>
            <div class="bg-gray-900/40 p-4 rounded-xl border border-gray-800/50 shadow-lg">
                <MetricChart
                    title="Messages Received (Sum)"
                    data={metricsData.messagesReceived}
                    loading={metricsLoading}
                />
            </div>
            <div class="bg-gray-900/40 p-4 rounded-xl border border-gray-800/50 shadow-lg">
                <MetricChart
                    title="Messages Deleted (Sum)"
                    data={metricsData.messagesDeleted}
                    loading={metricsLoading}
                />
            </div>
        </div>
    </div>
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #1f2937;
        border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #374151;
    }
</style>
