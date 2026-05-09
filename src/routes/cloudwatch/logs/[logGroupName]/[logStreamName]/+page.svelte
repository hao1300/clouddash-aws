<script lang="ts">
    import { page } from "$app/stores";
    import LogStreamViewer from "$lib/components/LogStreamViewer.svelte";
    import { titleService } from "$lib/services/title.svelte";
    import { untrack } from "svelte";

    let logGroupName = $derived($page.params.logGroupName || "");
    let logStreamName = $derived($page.params.logStreamName || "");

    // Call title service once when component mounts
    $effect(() => {
        if (logGroupName && logStreamName) {
            untrack(() => {
                const path = $page.url.pathname;
                titleService.setResource(
                    logGroupName,
                    `/cloudwatch/logs/${encodeURIComponent(logGroupName)}`,
                    path,
                );
                titleService.addResource(logStreamName, undefined, path);
            });
        }
    });

    let initialTimeMs = $derived(() => {
        const timeParam = $page.url.searchParams.get("time");
        if (timeParam) {
            return parseInt(timeParam);
        }
        return undefined;
    });
</script>

<LogStreamViewer
    {logGroupName}
    {logStreamName}
    initialTimeMs={initialTimeMs()}
/>
