<script lang="ts">
    import { onMount } from "svelte";
    import {
        CloudWatchClient,
        DescribeAlarmsCommand,
    } from "@aws-sdk/client-cloudwatch";
    import { getAwsCredentials } from "./aws-creds";

    let items = $state<any[]>([]);
    let nextToken = $state<string | undefined>(undefined);
    let loading = $state(false);
    let error = $state("");

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new CloudWatchClient({
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

    let client: CloudWatchClient | null = null;

    async function load(append = false) {
        if (!client) return;
        try {
            loading = true;
            error = "";
            const resp = await client.send(
                new DescribeAlarmsCommand({
                    MaxRecords: 50,
                    NextToken: append ? nextToken : undefined,
                }),
            );
            const newItems = (resp.MetricAlarms ?? []).map((a) => ({
                name: a.AlarmName ?? "Unknown",
                state: a.StateValue ?? "UNKNOWN",
                description: a.AlarmDescription ?? null,
            }));
            items = append ? [...items, ...newItems] : newItems;
            nextToken = resp.NextToken;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="space-y-2">
    {#each items as a}
        <div
            class="bg-gray-900 p-3 rounded-lg flex items-center justify-between border-l-4 {a.state ===
            'ALARM'
                ? 'border-red-500'
                : 'border-green-500'}"
        >
            <div class="min-w-0 mr-3">
                <h3 class="font-semibold text-sm text-gray-100 truncate">
                    {a.name}
                </h3>
                <p class="text-gray-500 text-xs truncate">
                    {a.description || "No description"}
                </p>
            </div>
            <span
                class="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold {a.state ===
                'ALARM'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-green-500/20 text-green-400'}">{a.state}</span
            >
        </div>
    {/each}
    {#if !loading && items.length === 0}<div
            class="text-gray-600 text-center py-16 text-sm"
        >
            No alarms found.
        </div>{/if}
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
</div>
