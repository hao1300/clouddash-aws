<script lang="ts">
    import {
        GetObjectCommand,
        DeleteObjectCommand,
    } from "@aws-sdk/client-s3";
    import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";
    import CopyButton from "$lib/components/CopyButton.svelte";
    import hljs from 'highlight.js';
    import 'highlight.js/styles/github-dark.css';
    import { invoke } from "@tauri-apps/api/core";
    import { openPath } from "@tauri-apps/plugin-opener";
    import { settings } from "$lib/services/settings.svelte";
    import { toastService } from "$lib/services/toast.svelte";

    let bucket = $derived($page.params.bucketName || "");
    let key = $derived($page.params.key || "");

    let objectDetails = $state<any>(null);
    let previewContent = $state("");
    let previewHtml = $state("");
    let previewTruncated = $state(false);
    let loading = $state(true);
    let error = $state("");
    
    let presignedUrl = $state("");
    let presignedLoading = $state(false);

    const s3Url = $derived(`https://${bucket}.s3.amazonaws.com/${key}`);
    const arn = $derived(`arn:aws:s3:::${bucket}/${key}`);

    $effect(() => {
        if (bucket && key) {
            loadObject();
        }
    });

    $effect(() => {
        if (bucket && key) {
            const parts = key.split('/').filter(Boolean);
            const resources = [
                { name: bucket, href: `/s3/bucket/${encodeURIComponent(bucket)}/objects` }
            ];
            let currentPrefix = '';
            // Add breadcrumbs for the folders in the key
            for (let i = 0; i < parts.length - 1; i++) {
                currentPrefix += parts[i] + '/';
                resources.push({
                    name: parts[i],
                    href: `/s3/bucket/${encodeURIComponent(bucket)}/objects?prefix=${encodeURIComponent(currentPrefix)}`
                });
            }
            // The file itself
            resources.push({
                name: parts[parts.length - 1],
                href: $page.url.pathname
            });
            titleService.setResources(resources);
        }
    });

    async function loadObject() {
        if (!bucket || !key) return;
        try {
            loading = true;
            error = "";
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");
            
            // Just use GetObject with Range for preview
            const res = await s3Client.send(
                new GetObjectCommand({ 
                    Bucket: bucket, 
                    Key: key,
                    Range: 'bytes=0-1048575' // 1MB
                }),
            );

            // Fetch full metadata if needed, but GetObject returns enough for now
            const bytes = await res.Body?.transformToByteArray();
            if (bytes) {
                // Check truncation
                const contentRange = (res as any).ContentRange || "";
                if (contentRange) {
                    const totalSize = parseInt(contentRange.split('/')[1]);
                    if (totalSize > bytes.length) {
                        previewTruncated = true;
                    }
                }

                // naive binary check
                const first100 = bytes.slice(0, 100);
                if (first100.some((b: number) => b === 0)) {
                    previewContent = "<Binary Content>";
                    previewHtml = '<div class="flex h-full items-center justify-center text-gray-500 italic py-20 text-xs">Binary content cannot be previewed.</div>';
                } else {
                    previewContent = new TextDecoder().decode(bytes);
                    const ext = key.split('.').pop()?.toLowerCase() || '';
                    
                    if (ext && hljs.getLanguage(ext)) {
                        previewHtml = hljs.highlight(previewContent, { language: ext }).value;
                    } else {
                        previewHtml = hljs.highlightAuto(previewContent).value;
                    }
                }
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handlePresign() {
        if (!bucket || !key) return;
        try {
            presignedLoading = true;
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            const command = new GetObjectCommand({ Bucket: bucket, Key: key });
            // @ts-ignore
            presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        } catch (e: any) {
            error = "Failed to generate presigned URL: " + e.message;
        } finally {
            presignedLoading = false;
        }
    }


    async function handleDownload() {
        console.log(`Starting download for key: ${key}`);
        try {
            const fileName = key.split("/").pop() || "download";
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            const res = await s3Client.send(
                new GetObjectCommand({ Bucket: bucket, Key: key }),
            );
            const body = res.Body;
            if (body) {
                const bytes = await body.transformToByteArray();
                console.log(`Bytes received: ${bytes.length}`);
                
                if (settings.downloadFolder) {
                    console.log(`Saving to custom folder: ${settings.downloadFolder}`);
                    const path = `${settings.downloadFolder}\\${fileName}`;
                    await invoke("save_file", { path, data: Array.from(bytes) });
                    toastService.success(`Downloaded to ${settings.downloadFolder}`, 5000, () => {
                        console.log(`Opening path: ${settings.downloadFolder}`);
                        openPath(settings.downloadFolder);
                    });
                } else {
                    console.log("Saving to default folder");
                    const blob = new Blob([bytes]);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                    toastService.success(`Downloaded to your Downloads folder`, 5000);
                }
            }
        } catch (e: any) {
            console.error("Download failed", e);
            error = e.message || String(e);
            toastService.error(`Download failed: ${error}`);
        }
    }

    async function handleDelete() {
        if (!bucket || !confirm(`Delete object ${key}?`)) return;
        try {
            loading = true;
            const s3Client = await aws.getS3ClientForBucket(bucket);
            if (!s3Client) throw new Error("Could not initialize S3 client");

            await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
            // Go back to the folder
            const prefix = key.substring(0, key.lastIndexOf('/') + 1);
            goto(`/s3/bucket/${encodeURIComponent(bucket)}/objects?prefix=${encodeURIComponent(prefix)}`);
        } catch (e: any) {
            error = e.message || String(e);
            loading = false;
        }
    }
</script>

<div class="h-full bg-gray-950 flex flex-col overflow-hidden">
    {#if error}
        <div class="bg-red-500/20 text-red-300 p-3 text-xs border-b border-red-500/30">
            {error}
        </div>
    {/if}

    <div class="flex-1 overflow-auto p-6 space-y-6">
        <!-- Header Actions -->
        <div class="flex justify-between items-start">
            <h1 class="text-xl font-bold text-white tracking-tight truncate flex-1 mr-4">
                {key.split('/').pop()}
            </h1>
            <div class="flex gap-2 shrink-0">
                <button
                    onclick={() => {
                        console.log("Download button clicked for detail page object");
                        handleDownload();
                    }}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition shadow-lg flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg>
                    Download
                </button>
                <button
                    onclick={handleDelete}
                    class="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 px-4 py-2 rounded text-xs font-bold transition"
                >
                    Delete
                </button>
            </div>
        </div>

        <!-- Metadata Section -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-3">
                <div>
                    <h3 class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">S3 URI</h3>
                    <div class="flex items-center gap-2 bg-black/40 rounded p-2 border border-white/5">
                        <CopyButton 
                            text={`s3://${bucket}/${key}`} 
                            label={`s3://${bucket}/${key}`}
                            class="text-blue-300 text-xs font-medium truncate flex-1"
                        />
                    </div>
                </div>
                <div>
                    <h3 class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Amazon Resource Name (ARN)</h3>
                    <div class="flex items-center gap-2 bg-black/40 rounded p-2 border border-white/5">
                        <CopyButton 
                            text={arn} 
                            label={arn}
                            class="text-gray-300 text-xs font-medium truncate flex-1"
                        />
                    </div>
                </div>
            </div>

            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-4">
                <div class="flex flex-col h-full justify-between">
                    <div>
                        <h3 class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Presigned URL</h3>
                        <p class="text-[10px] text-gray-400 mb-3">Generate a temporary URL that anyone can use to download this object (valid for 1 hour).</p>
                    </div>
                    
                    {#if presignedUrl}
                        <div class="flex items-center gap-2 bg-black/40 rounded p-2 border border-yellow-500/20 mb-2 overflow-hidden">
                            <CopyButton 
                                text={presignedUrl} 
                                label={presignedUrl}
                                class="text-yellow-400 text-xs font-medium truncate flex-1"
                            />
                        </div>
                    {/if}

                    <button
                        onclick={handlePresign}
                        disabled={presignedLoading}
                        class="w-full bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-xs font-bold transition flex items-center justify-center gap-2"
                    >
                        {#if presignedLoading}
                            <span class="animate-spin truncate">⟳</span>
                        {/if}
                        {presignedUrl ? 'Regenerate URL' : 'Generate Presigned URL'}
                    </button>
                </div>
            </div>
        </div>

        <!-- content Preview -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden min-h-[400px]">
            <div class="px-4 py-2 border-b border-gray-800 bg-gray-800/50 flex items-center justify-between">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Object Content Preview</span>
                {#if previewTruncated}
                    <span class="text-[10px] text-yellow-500 font-medium italic">Showing first 1MB</span>
                {/if}
            </div>
            
            <div class="flex-1 relative">
                {#if loading}
                    <div class="absolute inset-0 flex items-center justify-center bg-gray-950/50 backdrop-blur-sm z-10">
                        <div class="text-blue-400 animate-pulse font-bold tracking-widest uppercase text-xs">Loading Object...</div>
                    </div>
                {/if}

                <div class="p-0 overflow-auto max-h-[600px] h-full">
                    <pre class="m-0 p-6 text-[11px] font-mono leading-relaxed hljs whitespace-pre-wrap break-all">{@html previewHtml}</pre>
                </div>
            </div>
        </div>
    </div>
</div>
