<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading, mdiCircle } from "@mdi/js";

    import {
        DescribeApplicationVersionsCommand,
        type ApplicationVersionDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import { GetObjectCommand } from "@aws-sdk/client-s3";
    import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import { goto } from "$app/navigation";

    let rawId = $derived($page.params.id || "");
    let decodedId = $derived(decodeURIComponent(rawId));
    let [appName, versionLabel] = $derived(decodedId.split("::"));

    let version = $state<ApplicationVersionDescription | null>(null);
    let loading = $state(false);
    let error = $state("");
    let downloading = $state(false);
    let downloadError = $state("");

    $effect(() => {
        titleService.setResource(versionLabel || decodedId, undefined, $page.url.pathname);
    });

    $effect(() => {
        if (aws.eb && appName && versionLabel) {
            loadVersion();
        }
    });

    async function loadVersion() {
        if (!aws.eb || !appName || !versionLabel) return;
        try {
            loading = true;
            error = "";
            const res = await aws.eb.send(
                new DescribeApplicationVersionsCommand({
                    ApplicationName: appName,
                    VersionLabels: [versionLabel]
                }),
            );
            if (res.ApplicationVersions && res.ApplicationVersions.length > 0) {
                version = res.ApplicationVersions[0];
            } else {
                error = "Version not found";
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function downloadBundle() {
        if (!aws.s3 || !version?.SourceBundle?.S3Bucket || !version?.SourceBundle?.S3Key) return;
        try {
            downloading = true;
            downloadError = "";
            
            const command = new GetObjectCommand({
                Bucket: version.SourceBundle.S3Bucket,
                Key: version.SourceBundle.S3Key,
            });
            
            // Using presigned URL to allow browser download
            const url = await getSignedUrl(aws.s3, command, { expiresIn: 3600 });
            
            // Trigger download
            const a = document.createElement("a");
            a.href = url;
            a.download = version.SourceBundle.S3Key.split('/').pop() || "source-bundle.zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e: any) {
            downloadError = e.message || String(e);
        } finally {
            downloading = false;
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-auto p-6 relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    {#if loading && !version}
        <div
            class="flex-1 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest"
        >
            Loading Version...
        </div>
    {:else if version}
        <div class="flex items-center justify-between mb-6 shrink-0">
            <div
                class="flex items-center gap-3 bg-gray-900 p-3 rounded-lg border border-gray-800 shadow-sm flex-1 mr-4"
            >
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-gray-200"
                        >{version.VersionLabel}</span
                    >
                    <button class="text-xs text-left text-gray-500 hover:text-blue-400 focus:outline-none transition-colors"
                        onclick={() => goto(`/elasticbeanstalk/application/${encodeURIComponent(version!.ApplicationName || '')}`)}
                        >App: {version.ApplicationName}</button
                    >
                </div>
            </div>
            
            <div class="flex items-center gap-2">
                <button
                    class="px-4 py-2 bg-blue-900/50 hover:bg-blue-900 border border-blue-800 text-blue-200 text-xs font-bold rounded shadow-sm transition-colors disabled:opacity-50 flex items-center"
                    onclick={downloadBundle}
                    disabled={downloading || !version.SourceBundle}
                    title={!version.SourceBundle ? "No source bundle available" : "Download Source Bundle from S3"}
                >
                    {#if downloading}
                        <Icon path={mdiLoading} size={14} class="animate-spin mr-2" />
                    {/if}
                    Download Source Bundle
                </button>
            </div>
        </div>

        {#if downloadError}
            <div class="mb-4 bg-red-500/20 text-red-300 p-3 text-sm rounded border border-red-500/30">
                {downloadError}
            </div>
        {/if}

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 shrink-0">
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Status
                </div>
                <div
                    class="text-base font-bold flex items-center gap-1.5 {version.Status === 'Processed' || version.Status === 'Unprocessed'
                        ? 'text-green-400'
                        : 'text-yellow-400'}"
                >
                    <Icon
                        path={mdiCircle}
                        size={10}
                        color={version.Status === "Processed"
                            ? "#22c55e"
                            : "#eab308"}
                    />
                    {version.Status}
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm overflow-hidden"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Description
                </div>
                <div class="text-base font-bold text-gray-200 truncate" title={version.Description || ""}>
                    {version.Description || "-"}
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Created
                </div>
                <div class="text-sm font-bold text-gray-200 truncate">
                    {version.DateCreated
                        ? new Date(version.DateCreated).toLocaleString()
                        : "-"}
                </div>
            </div>
            <div
                class="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-sm"
            >
                <div
                    class="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold"
                >
                    Updated
                </div>
                <div class="text-sm font-bold text-gray-200 truncate">
                    {version.DateUpdated
                        ? new Date(version.DateUpdated).toLocaleString()
                        : "-"}
                </div>
            </div>
        </div>

        {#if version.SourceBundle}
            <div class="mb-6 shrink-0">
                <div
                    class="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold"
                >
                    Source Bundle Location
                </div>
                <div class="bg-gray-900 border border-gray-800 p-4 rounded-lg flex flex-col gap-2">
                    <div class="flex items-center">
                        <span class="text-xs text-gray-500 w-24">Bucket:</span>
                        <span class="text-sm text-gray-200 font-mono">{version.SourceBundle.S3Bucket}</span>
                    </div>
                    <div class="flex items-center">
                        <span class="text-xs text-gray-500 w-24">Key:</span>
                        <span class="text-sm text-gray-200 font-mono">{version.SourceBundle.S3Key}</span>
                    </div>
                    <div class="flex items-center">
                        <span class="text-xs text-gray-500 w-24">S3 URI:</span>
                        <button class="text-sm text-left text-blue-400 hover:text-blue-300 font-mono focus:outline-none transition-colors"
                            onclick={() => goto(`/s3/bucket/${encodeURIComponent(version!.SourceBundle!.S3Bucket || '')}/objects/detail/${version!.SourceBundle!.S3Key}`)}
                        >s3://{version.SourceBundle.S3Bucket}/{version.SourceBundle.S3Key}</button>
                    </div>
                </div>
            </div>
        {/if}
        
    {/if}
</div>
