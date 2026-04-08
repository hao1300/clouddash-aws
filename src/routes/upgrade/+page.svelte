<script lang="ts">
  import { titleService } from "$lib/services/title.svelte";
  import { settings } from "$lib/services/settings.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";

  $effect(() => {
    titleService.setResource("Upgrade to Pro", undefined, "/upgrade");
  });

  let checkoutLoading = $state(false);

  async function startCheckout() {
    checkoutLoading = true;
    try {
      await openUrl("https://clouddash.dev/pricing");
    } catch (e) {
      console.error("Failed to open pricing page", e);
    } finally {
      checkoutLoading = false;
    }
  }
</script>

<div class="h-full flex flex-col items-center justify-center p-8 bg-gray-950 text-white overflow-y-auto">
  <div class="max-w-2xl w-full text-center space-y-8 py-12">
    <div>
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-xl shadow-yellow-500/20 mb-6">
        <span class="text-4xl">👑</span>
      </div>
      <h1 class="text-4xl md:text-5xl font-black tracking-tight mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
        Unlock the full power of CloudDash
      </h1>
      <p class="text-lg text-gray-400 max-w-xl mx-auto">
        Upgrade to Pro to unlock all other services and get priority support from our team.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-xl mx-auto">
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm hover:border-blue-500/50 transition duration-300">
        <div class="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center text-xl mb-4">
          🚀
        </div>
        <h3 class="font-bold text-gray-200 mb-2">Unlock Services</h3>
        <p class="text-sm text-gray-400">Unlock all other premium AWS services including SQS, EC2, Lambda, and more.</p>
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm hover:border-blue-500/50 transition duration-300">
        <div class="w-10 h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center text-xl mb-4">
          🛡️
        </div>
        <h3 class="font-bold text-gray-200 mb-2">Priority Support</h3>
        <p class="text-sm text-gray-400">Get direct, high-priority support from the CloudDash development team.</p>
      </div>
    </div>

    <div class="pt-8">
      {#if settings.isPro}
        <div class="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
          <span class="text-xl">✅</span>
          <span class="font-bold">You are already a Pro user!</span>
        </div>
      {:else}
        <button
          onclick={startCheckout}
          disabled={checkoutLoading}
          class="group relative inline-block"
        >
          <div class="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-70 group-hover:opacity-100 transition duration-200"></div>
          <div class="relative bg-black border border-gray-800 text-white font-bold py-4 px-12 rounded-lg transition overflow-hidden">
            <span class="relative z-10 flex items-center gap-2 text-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              {checkoutLoading ? 'Opening...' : 'Subscribe to Pro ($36/year)'}
            </span>
            <div class="absolute inset-0 h-full w-full opacity-10 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          </div>
        </button>
        <p class="mt-6 text-xs text-gray-500">
          Clicking the button will take you to our secure checkout page on the web. <br />
          Once you complete your purchase, you'll receive a license key via email to activate in the app's Settings menu.
        </p>
      {/if}
    </div>
  </div>
</div>
