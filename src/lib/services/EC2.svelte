<script lang="ts">
    import { onMount } from "svelte";
    import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
    import { getAwsCredentials } from "./aws-creds";

    let items = $state<any[]>([]);
    let nextToken = $state<string | undefined>(undefined);
    let loading = $state(false);
    let error = $state("");
    let client: EC2Client | null = null;

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new EC2Client({
                region: creds.region || "us-east-1",
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
                new DescribeInstancesCommand({
                    MaxResults: 50,
                    NextToken: append ? nextToken : undefined,
                }),
            );
            const newItems: any[] = [];
            for (const res of resp.Reservations ?? []) {
                for (const inst of res.Instances ?? []) {
                    newItems.push({
                        id: inst.InstanceId ?? "Unknown",
                        state: inst.State?.Name ?? "UNKNOWN",
                        instance_type: inst.InstanceType ?? "Unknown",
                    });
                }
            }
            items = append ? [...items, ...newItems] : newItems;
            nextToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div
    class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
>
    {#each items as i}
        <div class="bg-gray-900 p-3 rounded-lg border border-gray-800">
            <div class="flex justify-between items-center mb-2">
                <span
                    class="font-mono text-xs text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded truncate"
                    >{i.id}</span
                >
                <span
                    class="w-2 h-2 rounded-full shrink-0 ml-2 {i.state?.toLowerCase() ===
                    'running'
                        ? 'bg-green-500'
                        : 'bg-yellow-500'}"
                ></span>
            </div>
            <div class="flex justify-between text-xs">
                <span class="text-gray-500">Type</span><span
                    class="text-gray-300">{i.instance_type}</span
                >
            </div>
            <div class="flex justify-between text-xs mt-1">
                <span class="text-gray-500">State</span><span
                    class="text-gray-300 uppercase">{i.state}</span
                >
            </div>
        </div>
    {/each}
    {#if !loading && items.length === 0}<div
            class="col-span-full text-gray-600 text-center py-16 text-sm"
        >
            No EC2 instances found.
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
{#if nextToken && !loading}<button
        onclick={() => load(true)}
        class="w-full mt-2 py-2 text-xs font-semibold text-blue-400 bg-gray-900 rounded border border-gray-800 hover:bg-gray-800 transition"
        >Load More</button
    >{/if}
