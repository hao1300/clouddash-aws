<script lang="ts">
    import {
        GetPolicyCommand,
        GetPolicyVersionCommand,
        CreatePolicyVersionCommand,
        type Policy,
        type PolicyVersion
    } from "@aws-sdk/client-iam";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import JsonEditor from "$lib/components/JsonEditor.svelte";

    let policyArn = $derived(decodeURIComponent($page.params.id || ""));

    $effect(() => {
        const policyName = policyArn.split('/').pop() || policyArn;
        titleService.setResource(policyName, undefined, $page.url.pathname);
    });

    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let policyDetails = $state<Policy | null>(null);
    let policyVersion = $state<PolicyVersion | null>(null);
    let detailTab = $state<"overview" | "json">("overview");

    let policyJsonStr = $state("");
    let savingPolicy = $state(false);

    $effect(() => {
        if (aws.iam && policyArn) {
            loadDetails();
        }
    });

    async function loadDetails() {
        if (!aws.iam || !policyArn) return;
        try {
            loading = true;
            const res = await aws.iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
            policyDetails = res.Policy || null;

            if (policyDetails?.DefaultVersionId) {
                const verRes = await aws.iam.send(new GetPolicyVersionCommand({
                    PolicyArn: policyArn,
                    VersionId: policyDetails.DefaultVersionId
                }));
                policyVersion = verRes.PolicyVersion || null;

                if (policyVersion?.Document) {
                    try {
                        const decoded = decodeURIComponent(policyVersion.Document);
                        policyJsonStr = JSON.stringify(JSON.parse(decoded), null, 4);
                    } catch(e) {
                        policyJsonStr = decodeURIComponent(policyVersion.Document);
                    }
                }
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function savePolicyDocument() {
        if (!aws.iam || !policyArn) return;
        try {
            savingPolicy = true;
            error = "";
            actionMsg = "";
            
            // Validate JSON
            try { JSON.parse(policyJsonStr); } catch (e: any) { throw new Error("Invalid JSON: " + e.message); }
            
            await aws.iam.send(new CreatePolicyVersionCommand({
                PolicyArn: policyArn,
                PolicyDocument: policyJsonStr,
                SetAsDefault: true
            }));
            
            actionMsg = "New policy version created and set as default.";
            loadDetails();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            savingPolicy = false;
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}
    {#if actionMsg}<div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30"
        >
            {actionMsg}
        </div>{/if}

    <div class="px-6 border-b border-gray-800 bg-gray-900 shrink-0 {error || actionMsg ? 'mt-8' : ''} flex justify-between items-center">
        <nav class="flex gap-4">
            <button
                onclick={() => (detailTab = "overview")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'overview'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Overview</button
            >
            <button
                onclick={() => (detailTab = "json")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'json'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Policy Document JSON</button
            >
        </nav>
    </div>

    <div class="flex-1 overflow-auto p-6 min-h-0 relative">
        {#if detailTab === "overview"}
            <div class="max-w-4xl space-y-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <div class="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
                        <h3 class="text-xs font-bold text-gray-300 uppercase tracking-widest">Policy Overview</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Policy Name</label>
                            <div class="text-sm text-gray-300">{policyDetails?.PolicyName || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Policy ID</label>
                            <div class="text-sm text-gray-300">{policyDetails?.PolicyId || 'N/A'}</div>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">ARN</label>
                            <div class="text-sm text-gray-300 font-mono truncate">{policyDetails?.Arn || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Default Version</label>
                            <div class="text-sm text-blue-400">{policyDetails?.DefaultVersionId || 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Attachment Count</label>
                            <div class="text-sm text-gray-300">{policyDetails?.AttachmentCount ?? 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Creation Date</label>
                            <div class="text-sm text-gray-300">{policyDetails?.CreateDate ? new Date(policyDetails.CreateDate).toLocaleString() : 'N/A'}</div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Update Date</label>
                            <div class="text-sm text-gray-300">{policyDetails?.UpdateDate ? new Date(policyDetails.UpdateDate).toLocaleString() : 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>
        {:else if detailTab === "json"}
            <div class="flex flex-col h-full max-w-4xl space-y-4">
                <div class="flex justify-between items-center text-gray-400 text-xs">
                    <span>
                        Currently editing: <strong class="text-blue-400">{policyDetails?.DefaultVersionId || ''}</strong>
                    </span>
                    <button
                        onclick={savePolicyDocument}
                        disabled={savingPolicy}
                        class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded font-bold transition shadow disabled:opacity-50"
                    >
                        {savingPolicy ? "Saving..." : "Save Policy"}
                    </button>
                </div>
                <div class="flex-1 min-h-0 bg-gray-900 border border-gray-800 rounded overflow-hidden">
                    <JsonEditor bind:value={policyJsonStr} />
                </div>
            </div>
        {/if}
    </div>
</div>
