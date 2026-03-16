<script lang="ts">
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";

    let bucket = $derived($page.params.bucketName || "");

    $effect(() => {
        titleService.setResources([
            { name: "Buckets", href: "/s3", path: "/s3" },
            { name: bucket, path: $page.url.pathname }
        ]);
    });
</script>

<div class="h-full p-4 bg-gray-950 text-gray-300">
    <div class="max-w-4xl mx-auto space-y-6">
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-sm">
            <h1 class="text-xl font-bold mb-4">Bucket Details: {bucket}</h1>
            <p class="text-gray-500 mb-6">This is a placeholder for S3 bucket configuration and properties.</p>
            
            <div class="grid grid-cols-2 gap-6 text-sm">
                <div>
                    <div class="text-gray-500 font-medium mb-1">Region</div>
                    <div class="text-gray-200">us-east-1</div>
                </div>
                <div>
                    <div class="text-gray-500 font-medium mb-1">Creation Date</div>
                    <div class="text-gray-200">Recent</div>
                </div>
                <div>
                    <div class="text-gray-500 font-medium mb-1">Versioning</div>
                    <div class="text-gray-200">Disabled</div>
                </div>
                <div>
                    <div class="text-gray-500 font-medium mb-1">Static Website Hosting</div>
                    <div class="text-gray-200">Disabled</div>
                </div>
            </div>
        </div>
    </div>
</div>
