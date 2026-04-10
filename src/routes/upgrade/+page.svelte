<script lang="ts">
  import { titleService } from "$lib/services/title.svelte";
  import { settings, POLAR_CHECKOUT_URL } from "$lib/services/settings.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";

  $effect(() => {
    titleService.setResource("Upgrade to Pro", undefined, "/upgrade");
  });

  let checkoutLoading = $state(false);
  let licenseKeyInput = $state("");

  async function startCheckout() {
    checkoutLoading = true;
    try {
      await openUrl(POLAR_CHECKOUT_URL);
    } catch (e) {
      console.error("Failed to open pricing page", e);
    } finally {
      checkoutLoading = false;
    }
  }

  async function activateKey() {
    if (!licenseKeyInput.trim()) return;
    await settings.validateLicense(licenseKeyInput.trim());
  }
</script>

<div
  class="h-full flex flex-col items-center justify-start md:justify-center p-8 bg-gray-950 text-white overflow-y-auto"
>
  <div class="max-w-2xl w-full text-center space-y-8 py-12">
    <div>
      <div
        class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-xl shadow-yellow-500/20 mb-6"
      >
        <span class="text-4xl">👑</span>
      </div>
      <h1
        class="text-4xl md:text-5xl font-black tracking-tight mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent"
      >
        Unlock the full power of CloudDash
      </h1>
      <p class="text-lg text-gray-400 max-w-xl mx-auto">
        Upgrade to Pro to unlock all other services and get priority support
        from our team.
      </p>
    </div>

    <div
      class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-xl mx-auto"
    >
      <div
        class="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm hover:border-blue-500/50 transition duration-300"
      >
        <div
          class="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center text-xl mb-4"
        >
          🚀
        </div>
        <h3 class="font-bold text-gray-200 mb-2">Unlock Services</h3>
        <p class="text-sm text-gray-400">
          Unlock all other premium AWS services including SQS, EC2, Lambda, and
          more.
        </p>
      </div>

      <div
        class="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm hover:border-blue-500/50 transition duration-300"
      >
        <div
          class="w-10 h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center text-xl mb-4"
        >
          🛡️
        </div>
        <h3 class="font-bold text-gray-200 mb-2">Priority Support</h3>
        <p class="text-sm text-gray-400">
          Get direct, high-priority support from the CloudDash development team.
        </p>
      </div>
    </div>

    <div class="pt-8">
      {#if settings.isPro}
        <div
          class="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green-500/10 text-green-400 border border-green-500/20"
        >
          <span class="text-xl">✅</span>
          <span class="font-bold">You are already a Pro user!</span>
        </div>
      {:else}
        <div class="max-w-md mx-auto space-y-6">
          <button
            onclick={startCheckout}
            disabled={checkoutLoading}
            class="group relative inline-block w-full"
          >
            <div
              class="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-70 group-hover:opacity-100 transition duration-200"
            ></div>
            <div
              class="relative w-full bg-black border border-gray-800 text-white font-bold py-4 px-12 rounded-lg transition overflow-hidden"
            >
              <span
                class="relative z-10 flex items-center justify-center gap-2 text-lg"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-blue-400"
                  ><polygon
                    points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                  ></polygon></svg
                >
                {checkoutLoading ? "Opening..." : "Purchase Pro License"}
              </span>
              <div
                class="absolute inset-0 h-full w-full opacity-10 bg-gradient-to-r from-blue-500 to-indigo-500"
              ></div>
            </div>
          </button>

          <div class="relative flex items-center py-2">
            <div class="flex-grow border-t border-gray-800"></div>
            <span
              class="flex-shrink-0 mx-4 text-xs font-semibold text-gray-500 uppercase tracking-widest"
              >Or Activate License</span
            >
            <div class="flex-grow border-t border-gray-800"></div>
          </div>

          <div
            class="bg-gray-900 border border-gray-800 rounded-xl p-6 text-left shadow-lg"
          >
            <label class="block text-sm font-medium text-gray-400 mb-3"
              >Have a license key?</label
            >
            <div class="flex flex-col gap-3">
              <input
                type="text"
                bind:value={licenseKeyInput}
                placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                disabled={settings.licenseValidating}
                onkeydown={(e) => {
                  if (e.key === "Enter") activateKey();
                }}
                class="w-full bg-black border {settings.licenseError
                  ? 'border-red-500/50'
                  : 'border-gray-800'} rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none transition font-mono tracking-wider placeholder-gray-700"
              />
              {#if settings.licenseError}
                <p
                  class="text-red-400 text-xs flex items-center gap-1.5 animate-pulse"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    ><circle cx="12" cy="12" r="10"></circle><line
                      x1="15"
                      y1="9"
                      x2="9"
                      y2="15"
                    ></line><line x1="9" y1="9" x2="15" y2="15"></line></svg
                  >
                  {settings.licenseError}
                </p>
              {/if}
              <button
                onclick={activateKey}
                disabled={settings.licenseValidating || !licenseKeyInput.trim()}
                class="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2"
              >
                {#if settings.licenseValidating}
                  <svg
                    class="animate-spin w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    ><circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="3"
                      class="opacity-25"
                    ></circle><path
                      d="M4 12a8 8 0 018-8"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      class="opacity-75"
                    ></path></svg
                  >
                  Validating...
                {:else}
                  Activate Device
                {/if}
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
