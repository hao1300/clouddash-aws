<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading } from "@mdi/js";

    import {
        ListIdentitiesCommand,
        VerifyEmailIdentityCommand,
        DeleteIdentityCommand,
        SendEmailCommand,
    } from "@aws-sdk/client-ses";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";

    let identities = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let showVerifyModal = $state(false);
    let verifyEmail = $state("");
    let verifying = $state(false);

    let showTestModal = $state(false);
    let testFrom = $state("");
    let testTo = $state("");
    let testSubject = $state("SES Test Email");
    let testBody = $state(
        "This is a test email sent from the CloudDash for AWS application.",
    );
    let sending = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.ses && !__initLoaded) {
            __initLoaded = true;
            loadIdentities();
        }
    });

    async function loadIdentities() {
        if (!aws.ses) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ses.send(new ListIdentitiesCommand({}));
            identities = (res.Identities ?? []).map((id) => ({ name: id }));
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleVerify() {
        if (!aws.ses || !verifyEmail) return;
        try {
            verifying = true;
            await aws.ses.send(
                new VerifyEmailIdentityCommand({ EmailAddress: verifyEmail }),
            );
            actionMsg = `Verification email sent to ${verifyEmail}.`;
            showVerifyModal = false;
            verifyEmail = "";
            loadIdentities();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            verifying = false;
        }
    }

    async function handleDelete(name: string) {
        if (!aws.ses || !confirm(`Delete identity ${name}?`)) return;
        try {
            loading = true;
            await aws.ses.send(new DeleteIdentityCommand({ Identity: name }));
            actionMsg = `Identity ${name} deleted.`;
            loadIdentities();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleSendTest() {
        if (!aws.ses || !testFrom || !testTo) return;
        try {
            sending = true;
            await aws.ses.send(
                new SendEmailCommand({
                    Source: testFrom,
                    Destination: { ToAddresses: [testTo] },
                    Message: {
                        Subject: { Data: testSubject },
                        Body: { Text: { Data: testBody } },
                    },
                }),
            );
            actionMsg = `Test email sent from ${testFrom} to ${testTo}.`;
            showTestModal = false;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            sending = false;
        }
    }
</script>

<div class="h-full relative overflow-hidden flex flex-col">
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

    <PaginatedTable
        items={identities}
        {loading}
        onRefresh={loadIdentities}
        columns={[{ label: "Identity", key: "name" }]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showVerifyModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Verify Identity</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => {
                        testFrom = item.name;
                        showTestModal = true;
                    }}
                    class="text-[10px] bg-green-600/20 hover:bg-green-600/40 text-green-400 px-2 py-1 rounded border border-green-500/30 transition shadow"
                    >Test</button
                >
                <button
                    onclick={() => handleDelete(item.name)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Delete</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
</div>

<Modal bind:open={showVerifyModal} title="Verify New Email Identity">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Email Address</label
            >
            <input
                type="email"
                bind:value={verifyEmail}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleVerify}
                disabled={verifying}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if verifying}<span class="animate-spin"><Icon path={mdiLoading} class="animate-spin" size={14} /></span>{/if} Send Verification
                Email
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showTestModal} title="Send Test Email">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >From</label
            >
            <input
                type="text"
                bind:value={testFrom}
                readonly
                class="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-400 cursor-not-allowed"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >To</label
            >
            <input
                type="email"
                bind:value={testTo}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Subject</label
            >
            <input
                type="text"
                bind:value={testSubject}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Body</label
            >
            <textarea
                bind:value={testBody}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white h-24"
            ></textarea>
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleSendTest}
                disabled={sending}
                class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if sending}<span class="animate-spin"><Icon path={mdiLoading} size={14} class="animate-spin" /></span>{/if} Send Email
            </button>
        </div>
    </div>
</Modal>
