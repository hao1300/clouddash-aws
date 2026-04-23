<script lang="ts">
    import TabBar from "$lib/components/TabBar.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { 
        ListBucketsCommand, 
        GetBucketLocationCommand, 
        ListBucketMetricsConfigurationsCommand 
    } from "@aws-sdk/client-s3";
    import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
    import CopyButton from "$lib/components/CopyButton.svelte";
    import MetricChart from "$lib/components/MetricChart.svelte";
    import InfoCard from "$lib/components/InfoCard.svelte";

    let bucket = $derived($page.params.bucketName || "");
    
    let bucketData = $state<any>(null);
    let region = $state("");
    let loading = $state(true);
    let error = $state("");

    let sizeMetrics = $state<any[]>([]);
    let objectMetrics = $state<any[]>([]);
    let metricsLoading = $state(false);

    let metricsConfigs = $state<any[]>([]);

    const arn = $derived(`arn:aws:s3:::${bucket}`);

    $effect(() => {
        titleService.setResources([
            { name: bucket, path: $page.url.pathname }
        ]);
    });

    $effect(() => {
        if (bucket) { // Changed condition
            loadBucketDetails();
        }
    });

    async function loadBucketDetails() {
        if (!bucket) return; // Added check
        try {
            loading = true;
            error = "";

            const fetchedRegion = await aws.getBucketRegion(bucket);
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            const listResp = await s3Client.send(new ListBucketsCommand({}));
            bucketData = listResp.Buckets?.find(b => b.Name === bucket);
            region = fetchedRegion;

            try {
                const metricsResp = await s3Client.send(new ListBucketMetricsConfigurationsCommand({ Bucket: bucket }));
                metricsConfigs = metricsResp.MetricsConfigurationList ?? [];
            } catch(e) {
                console.warn("Could not list metrics configs", e);
            }

            loadMetrics(); // Keep this call
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function loadMetrics() {
        if (!bucket) return;
        try {
            metricsLoading = true;
            const cwClient = await aws.getCWClientForBucket(bucket);
            if (!cwClient) throw new Error("Could not initialize CloudWatch client");

            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

            // Fetch Size
            const sizeResp = await cwClient.send(new GetMetricStatisticsCommand({
                Namespace: "AWS/S3",
                MetricName: "BucketSizeBytes",
                Dimensions: [
                    { Name: "BucketName", Value: bucket },
                    { Name: "StorageType", Value: "StandardStorage" }
                ],
                StartTime: startTime,
                EndTime: endTime,
                Period: 86400,
                Statistics: ["Average"]
            }));

            sizeMetrics = (sizeResp.Datapoints ?? []).map(dp => ({
                rawTimestamp: dp.Timestamp!,
                rawAverage: dp.Average || 0
            })).sort((a, b) => a.rawTimestamp.getTime() - b.rawTimestamp.getTime());

            // Fetch Object Count
            const countResp = await cwClient.send(new GetMetricStatisticsCommand({
                Namespace: "AWS/S3",
                MetricName: "NumberOfObjects",
                Dimensions: [
                    { Name: "BucketName", Value: bucket },
                    { Name: "StorageType", Value: "AllStorageTypes" }
                ],
                StartTime: startTime,
                EndTime: endTime,
                Period: 86400,
                Statistics: ["Average"]
            }));

            objectMetrics = (countResp.Datapoints ?? []).map(dp => ({
                rawTimestamp: dp.Timestamp!,
                rawAverage: dp.Average || 0
            })).sort((a, b) => a.rawTimestamp.getTime() - b.rawTimestamp.getTime());

        } catch (e) {
            console.error("Failed to load metrics:", e);
        } finally {
            metricsLoading = false;
        }
    }

    function formatBytes(bytes: number) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
</script>

<div class="h-full flex flex-col overflow-hidden">
    <TabBar
        tabs={[
            { id: "objects", label: "Objects", href: `/s3/bucket/${encodeURIComponent(bucket)}/objects` },
            { id: "details", label: "Details", href: `/s3/bucket/${encodeURIComponent(bucket)}/details` },
        ]}
        activeTab="details"
    />
<div class="flex-1 p-4 bg-gray-950 text-gray-300 overflow-auto">
    <div class="max-w-6xl mx-auto space-y-6">
        {#if error}
            <div class="bg-red-500/20 text-red-300 px-4 py-3 rounded border border-red-500/30 text-sm">
                {error}
            </div>
        {/if}

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoCard label="Region" value={region || (loading ? 'Loading...' : 'Unknown')} />
            <InfoCard label="Creation Date" value={bucketData?.CreationDate ? new Date(bucketData.CreationDate).toLocaleString() : (loading ? 'Loading...' : '-')} />
            <InfoCard label="Amazon Resource Name (ARN)" value={arn} />
            {#if metricsConfigs.length > 0}
                <InfoCard label="Metrics Configurations">
                    {#snippet children()}
                        <div class="flex flex-wrap gap-2">
                            {#each metricsConfigs as config}
                                <span class="bg-blue-600/10 text-blue-400 border border-blue-600/20 px-2 py-1 rounded text-[11px] font-mono">
                                    {config.Id}
                                </span>
                            {/each}
                        </div>
                    {/snippet}
                </InfoCard>
            {/if}
        </div>

        <!-- CloudWatch Metrics Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-sm">
                <MetricChart 
                    title="Bucket Size (Total Bytes)" 
                    data={sizeMetrics} 
                    loading={metricsLoading}
                    formatValue={formatBytes}
                    yLabel="Bytes"
                />
                {#if sizeMetrics.length > 0}
                    <div class="mt-4 text-center">
                        <div class="text-xs text-gray-500">Current Average</div>
                        <div class="text-xl font-bold text-blue-400">{formatBytes(sizeMetrics[sizeMetrics.length - 1].rawAverage)}</div>
                    </div>
                {/if}
            </div>

            <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-sm">
                <MetricChart 
                    title="Total Objects" 
                    data={objectMetrics} 
                    loading={metricsLoading}
                    formatValue={v => Math.round(v).toLocaleString()}
                    yLabel="Count"
                />
                {#if objectMetrics.length > 0}
                    <div class="mt-4 text-center">
                        <div class="text-xs text-gray-500">Current Average</div>
                        <div class="text-xl font-bold text-blue-400">{Math.round(objectMetrics[objectMetrics.length - 1].rawAverage).toLocaleString()}</div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
</div>
