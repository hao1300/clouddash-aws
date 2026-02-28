<script lang="ts">
    import { onMount } from "svelte";
    import {
        SQSClient,
        ListQueuesCommand,
        GetQueueAttributesCommand,
    } from "@aws-sdk/client-sqs";
    import { getAwsCredentials } from "./aws-creds";

    let items = $state<any[]>([]);
    let nextToken = $state<string | undefined>(undefined);
    let loading = $state(false);
    let error = $state("");
    let client: SQSClient | null = null;

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new SQSClient({
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
                new ListQueuesCommand({
                    MaxResults: 50,
                    NextToken: append ? nextToken : undefined,
                }),
            );
            const newItems: any[] = [];
            for (const url of resp.QueueUrls ?? []) {
                const name = url.split("/").pop() ?? url;
                let msgsAvail = "N/A",
                    msgsFlight = "N/A";
                try {
                    const attrs = await client.send(
                        new GetQueueAttributesCommand({
                            QueueUrl: url,
                            AttributeNames: [
                                "ApproximateNumberOfMessages",
                                "ApproximateNumberOfMessagesNotVisible",
                            ],
                        }),
                    );
                    msgsAvail =
                        attrs.Attributes?.ApproximateNumberOfMessages ?? "N/A";
                    msgsFlight =
                        attrs.Attributes
                            ?.ApproximateNumberOfMessagesNotVisible ?? "N/A";
                } catch {
                    /* skip */
                }
                newItems.push({
                    name,
                    url,
                    messages_available: msgsAvail,
                    messages_in_flight: msgsFlight,
                });
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
    class="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800"
>
    {#each items as q}
        <div
            class="p-3 flex items-center justify-between hover:bg-gray-800/50 transition"
        >
            <div class="min-w-0 mr-3">
                <span class="text-sm font-semibold text-gray-200 truncate block"
                    >{q.name}</span
                >
                <span class="text-xs text-gray-600 truncate block">{q.url}</span
                >
            </div>
            <div class="flex gap-3 shrink-0">
                <div class="text-center">
                    <div class="text-xs text-gray-500">Avail</div>
                    <div class="text-sm font-bold text-blue-400">
                        {q.messages_available}
                    </div>
                </div>
                <div class="text-center">
                    <div class="text-xs text-gray-500">Flight</div>
                    <div class="text-sm font-bold text-yellow-400">
                        {q.messages_in_flight}
                    </div>
                </div>
            </div>
        </div>
    {/each}
    {#if !loading && items.length === 0}<div
            class="p-8 text-center text-gray-600 text-sm"
        >
            No SQS queues found.
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
