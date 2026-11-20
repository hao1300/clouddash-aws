<script lang="ts">
    import Modal from "$lib/components/Modal.svelte";
    import { untrack } from "svelte";
    import { pro } from "$lib/services/pro.svelte";

    let { open = $bindable(false) }: { open?: boolean } = $props();
    let busy = $state(false);
    let message = $state("");
    let price = $state<string | null>(null);
    let microsoftPrice = $state<string | null>(null);
    const button = "px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50";

    $effect(() => {
        if (open) untrack(() => void run(() => pro.load()));
    });

    async function run(action: () => Promise<unknown>) {
        if (busy) return;
        busy = true;
        message = "";
        try {
            await action();
            if (pro.entitlement?.state !== "pro") {
                price = await pro.getPlayPrice().catch(() => null);
                microsoftPrice = await pro.getMicrosoftPrice().catch(() => null);
            }
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        } finally {
            busy = false;
        }
    }
</script>

<Modal bind:open title="CloudDash Pro">
    <div class="space-y-4 text-sm text-gray-200">
        <p>Export AWS Cost Explorer data to CSV. Try Pro free for 30 days, then buy it once to keep using it on devices signed in to the same CloudDash account.</p>
        <p>The trial ends automatically. The free tier includes all existing CloudDash features.</p>
        {#if pro.entitlement?.state === "pro"}
            <p class="text-green-400">Pro is active on this account.</p>
        {:else if pro.entitlement?.state === "trial" && pro.entitlement.trialEndsAt}
            <p>Trial ends {new Date(pro.entitlement.trialEndsAt * 1000).toLocaleDateString()}.</p>
        {:else if pro.entitlement?.state === "expired"}
            <p>Your Pro trial has ended.</p>
        {/if}
        <div class="flex flex-wrap gap-2">
            {#if !pro.signedIn}
                {#if pro.pendingSignIn}
                    <button class={button} disabled={busy} onclick={() => run(() => pro.finishSignIn())}>Finish sign-in</button>
                    <button class={button} disabled={busy} onclick={() => run(() => pro.beginSignIn())}>Open sign-in again</button>
                {:else}
                    <button class={button} disabled={busy} onclick={() => run(() => pro.beginSignIn())}>Sign in with Google</button>
                {/if}
            {:else}
                {#if pro.entitlement?.state === "free"}
                    <button class={button} disabled={busy} onclick={() => run(() => pro.startTrial())}>Start free trial</button>
                {/if}
                {#if pro.entitlement?.state !== "pro"}
                    {#if price}
                        <button class={button} disabled={busy} onclick={() => run(() => pro.playPurchase("purchase"))}>Buy Pro for {price}</button>
                    {:else if microsoftPrice}
                        <button class={button} disabled={busy} onclick={() => run(() => pro.microsoftPurchase("purchase"))}>Buy Pro for {microsoftPrice}</button>
                    {/if}
                    {#if pro.os === "android" && pro.entitlement?.playProductId}
                        <button class={button} disabled={busy} onclick={() => run(() => pro.playPurchase("restore"))}>Restore Google Play purchase</button>
                    {/if}
                {/if}
                {#if pro.canRestoreMicrosoft}
                    <button class={button} disabled={busy} onclick={() => run(() => pro.microsoftPurchase("restore"))}>Restore Microsoft Store purchase</button>
                {/if}
                <button class={button} disabled={busy} onclick={() => run(() => pro.refresh())}>Refresh Pro status</button>
                <button class={button} disabled={busy} onclick={() => run(() => pro.signOut())}>Sign out</button>
                <button class="px-2 py-2 text-gray-400 hover:text-gray-200 underline" disabled={busy} onclick={() => run(() => pro.deleteAccount())}>Delete CloudDash account</button>
            {/if}
        </div>
        {#if message}<p role="status" class="text-amber-300">{message}</p>{/if}
    </div>
</Modal>
