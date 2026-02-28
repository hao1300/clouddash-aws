<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudFrontClient,
        ListDistributionsCommand,
    } from "@aws-sdk/client-cloudfront";
    import { getAwsCredentials } from "./aws-creds";

    let items = $state<any[]>([]);
    let nextMarker = $state<string | undefined>(undefined);
    let hasMore = $state(false);
    let loading = $state(false);
    let error = $state("");
    let client: CloudFrontClient | null = null;

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new CloudFrontClient({
                region: "us-east-1", // CloudFront is global
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            });
            await load();
        } catch (e) {
            error = String(e);
        }
    });

    async function load(append = false) {
        if (!client) return;
        try {
            loading = true;
            error = "";
            const resp = await client.send(
                new ListDistributionsCommand({
                    MaxItems: 50,
                    Marker: append ? nextMarker : undefined,
                }),
            );
            const list = resp.DistributionList;
            const newItems = (list?.Items ?? []).map((d) => ({
                id: d.Id ?? "",
                domain: d.DomainName ?? "",
                status: d.Status ?? "",
                enabled: d.Enabled ?? false,
            }));
            items = append ? [...items, ...newItems] : newItems;
            hasMore = list?.IsTruncated ?? false;
            nextMarker = list?.NextMarker;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {#each items as d}
        <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
            <div class="flex justify-between items-center mb-2">
                <span
                    class="font-mono text-xs text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded truncate"
                    >{d.id}</span
                >
                <span
                    class="w-2 h-2 rounded-full shrink-0 ml-2 {d.enabled
                        ? 'bg-green-500'
                        : 'bg-red-500'}"
                ></span>
            </div>
            <div class="flex justify-between text-xs">
                <span class="text-gray-500">Domain</span><span
                    class="text-gray-300 truncate ml-2">{d.domain}</span
                >
            </div>
            <div class="flex justify-between text-xs mt-1">
                <span class="text-gray-500">Status</span><span
                    class="text-gray-300">{d.status}</span
                >
            </div>
            <div class="flex justify-between text-xs mt-1">
                <span class="text-gray-500">Enabled</span><span
                    class={d.enabled ? "text-green-400" : "text-red-400"}
                    >{d.enabled ? "Yes" : "No"}</span
                >
            </div>
        </div>
    {/each}
    {#if !loading && items.length === 0}<div
            class="col-span-full text-gray-600 text-center py-16 text-sm"
        >
            No CloudFront distributions found.
        </div>{/if}
</div>
{#if loading}<div class="flex justify-center py-4">
        <div
            class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
        ></div>
    </div>{/if}
{#if error}<div class="bg-red-500/20 text-red-300 p-2 rounded text-xs mt-2">
        {error}
    </div>{/if}
{#if hasMore && !loading}<button
        onclick={() => load(true)}
        class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
        >Load More</button
    >{/if}
