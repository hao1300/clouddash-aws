const fs = require('fs');

const layoutFile = 'c:\\CS\\aws-console\\src\\routes\\+layout.svelte';
let layoutContent = fs.readFileSync(layoutFile, 'utf8');

// 1. Change sideMenuOpen initialization
layoutContent = layoutContent.replace(
  'let sideMenuOpen = $state(typeof window !== "undefined" ? window.innerWidth >= 640 : true);',
  'let sideMenuOpen = $state(false);'
);

// 2. Remove the surrounding {#if sideMenuOpen} for the left sidebar, except for the mobile overlay
layoutContent = layoutContent.replace(
  `  {:else}<div class="flex h-full w-full overflow-hidden">
      {#if sideMenuOpen}
        <!-- Overlay for mobile -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity sm:hidden z-[150]"
          onclick={() => (sideMenuOpen = false)}
        ></div>

        <!-- Left Sidebar -->
        <div
          class="fixed sm:static inset-y-0 left-0 z-[160] sm:z-auto w-72 max-w-[85vw] bg-gray-900 shadow-2xl sm:shadow-none flex flex-col border-r border-gray-800 animate-in slide-in-from-left duration-200 shrink-0"
        >`,
  `  {:else}<div class="flex h-full w-full overflow-hidden">
      {#if sideMenuOpen}
        <!-- Overlay for mobile -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity sm:hidden z-[150]"
          onclick={() => (sideMenuOpen = false)}
        ></div>
      {/if}

      <!-- Left Sidebar -->
      <div
        class="fixed sm:static inset-y-0 left-0 z-[160] sm:z-auto w-72 max-w-[85vw] bg-gray-900 shadow-2xl sm:shadow-none flex flex-col border-r border-gray-800 shrink-0 transition-transform duration-300 {sideMenuOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}"
      >`
);

// 3. Remove the closing {/if} for sideMenuOpen (it's right before <!-- Main Content Area -->)
layoutContent = layoutContent.replace(
  `            </div>
          </div>
        </div>
      {/if}

      <!-- Main Content Area -->`,
  `            </div>
          </div>
        </div>

      <!-- Main Content Area -->`
);

// 4. Add sm:hidden to the hamburger button
layoutContent = layoutContent.replace(
  `        <header
          class="flex items-center bg-gray-900 border-b border-gray-800 shrink-0 px-3 py-2 gap-3"
        >
          <button
            onclick={() => (sideMenuOpen = !sideMenuOpen)}
            class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition"
            title="Toggle Sidebar"
          >
            <span class="text-xl">☰</span>
          </button>`,
  `        <header
          class="flex items-center bg-gray-900 border-b border-gray-800 shrink-0 px-3 py-2 gap-3"
        >
          <button
            onclick={() => (sideMenuOpen = !sideMenuOpen)}
            class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition sm:hidden"
            title="Toggle Sidebar"
          >
            <span class="text-xl">☰</span>
          </button>`
);

fs.writeFileSync(layoutFile, layoutContent);
console.log("+layout.svelte replaced");

const serviceLayoutFile = 'c:\\CS\\aws-console\\src\\lib\\components\\ServiceLayout.svelte';
const serviceLayoutContent = `<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title = "",
        tabs = [],
        activeTab = $bindable(tabs.length > 0 ? tabs[0].id : ""),
        onTabChange,
        children,
    }: {
        title?: string;
        tabs?: { id: string; label: string }[];
        activeTab?: string;
        onTabChange?: (id: string) => void;
        children: Snippet;
    } = $props();
</script>

<div class="flex flex-col h-full bg-gray-950 text-white overflow-hidden relative">
    <main class="flex-1 overflow-auto relative">
        {@render children()}
    </main>
</div>
`;
fs.writeFileSync(serviceLayoutFile, serviceLayoutContent);
console.log("ServiceLayout.svelte replaced");
