const fs = require('fs');

const file = 'c:\\CS\\aws-console\\src\\routes\\+layout.svelte';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
`  let dropdownOpen = $state(false);
  let sideMenuOpen = $state(false);
  let searchQuery = $state("");`,
`  let dropdownOpen = $state(false);
  let sideMenuOpen = $state(typeof window !== "undefined" ? window.innerWidth >= 640 : true);
  let rightSidebarOpen = $state(false);
  let searchQuery = $state("");`
);

const elseMatch = content.match(/\{\:else\}/);
const lastIfMatch = content.match(/\{\/if\}\s*<\/main>/);

if (!elseMatch || !lastIfMatch) {
    throw new Error("Could not find boundaries");
}

const beforeElse = content.slice(0, elseMatch.index + 7);
const afterIf = content.slice(lastIfMatch.index);

const newContent = `    <div class="flex h-full w-full overflow-hidden">
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
        >
          <div
            class="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950 shrink-0"
          >
            <div class="flex items-center gap-2">
              <span class="text-blue-500 text-xl">☁</span>
              <span class="font-bold text-gray-100">AWS Console</span>
            </div>
            <button
              onclick={() => (sideMenuOpen = false)}
              class="p-2 rounded-full hover:bg-gray-800 text-gray-400 transition sm:hidden"
            >
              ✕
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-8 pb-10">
            <!-- Services -->
            <div class="space-y-4">
              <div class="px-1">
                <span
                  class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                  >Services</span
                >
              </div>

              <div class="space-y-4">
                <div class="px-1">
                  <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Search services..."
                    class="w-full bg-black border border-gray-800 rounded p-2.5 text-xs text-white outline-none focus:border-blue-500 transition shadow-inner"
                  />
                </div>

                <div class="grid grid-cols-1 gap-1">
                  {#each mobileServices as svc, i (svc.id)}
                    <div animate:flip={{ duration: 300 }}>
                      {#if !searchQuery && !svc.isStarred && svc.prevIsStarred}
                        <div
                          class="mt-4 mb-2 px-2 pb-1 border-b border-gray-800"
                        >
                          <span
                            class="text-[10px] font-bold text-gray-600 uppercase tracking-widest"
                            >All Services</span
                          >
                        </div>
                      {/if}

                      <div class="space-y-1">
                        <div
                          class="flex items-center justify-between w-full px-1 rounded {activeId ===
                          svc.id
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                            : 'hover:bg-gray-800 text-gray-300 border border-transparent'} transition text-left"
                        >
                          <button
                            onclick={() => {
                              switchTab(svc.id);
                              if(window.innerWidth < 640) sideMenuOpen = false;
                            }}
                            class="flex-1 px-2 py-3 text-xs font-semibold text-left flex items-center gap-2"
                          >
                            {svc.label}
                            {#if activeId === svc.id}
                              <div
                                class="w-1 h-1 rounded-full bg-blue-500"
                              ></div>
                            {/if}
                          </button>
                          <button
                            class="px-3 py-3 text-xs hover:scale-110 transition {svc.isStarred
                              ? 'text-yellow-400'
                              : 'text-gray-700 hover:text-gray-500'}"
                            onclick={(e) => toggleStar(svc.id, e)}
                          >
                            {svc.isStarred ? "★" : "☆"}
                          </button>
                        </div>

                        {#if activeId === svc.id && serviceTabs.length > 0}
                          <div
                            class="ml-4 flex flex-col border-l border-gray-800 bg-gray-900/30 rounded-r"
                          >
                            {#each serviceTabs as tab}
                              <button
                                onclick={() => {
                                  handleServiceTabChange(tab.id);
                                  if(window.innerWidth < 640) sideMenuOpen = false;
                                }}
                                class="w-full text-left px-4 py-2.5 text-[11px] transition {serviceActiveTab ===
                                tab.id
                                  ? 'text-blue-400 font-bold bg-blue-500/10'
                                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}"
                              >
                                {tab.label}
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}

                  {#if mobileServices.length === 0}
                    <div class="p-8 text-center">
                      <div class="text-gray-600 text-xs italic">
                        No services found matching "{searchQuery}"
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <!-- Account & Region Footer -->
          <div
            class="p-4 border-t border-gray-800 bg-gray-950/80 backdrop-blur-sm space-y-4 shrink-0"
          >
            <span
              class="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1 block"
              >Account & Region</span
            >
            <div class="grid grid-cols-1 gap-3">
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <span class="text-[10px] text-gray-600 px-1">Profile</span>
                  {#if authType === "profile"}
                    <select
                      bind:value={selectedProfile}
                      onchange={() => {
                        login();
                        if(window.innerWidth < 640) sideMenuOpen = false;
                      }}
                      class="w-full bg-gray-800 text-[11px] p-2 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
                    >
                      {#each visibleProfiles as p}<option value={p}>{p}</option
                        >{/each}
                    </select>
                  {:else}
                    <div
                      class="w-full bg-gray-800 text-[11px] p-2 rounded text-blue-400 font-mono border border-gray-700 truncate"
                    >
                      🔑 Custom
                    </div>
                  {/if}
                </div>

                <div class="space-y-1">
                  <span class="text-[10px] text-gray-600 px-1">Region</span>
                  <select
                    bind:value={region}
                    onchange={() => {
                      login();
                      if(window.innerWidth < 640) sideMenuOpen = false;
                    }}
                    class="w-full bg-gray-800 text-[11px] p-2 rounded text-blue-400 font-mono outline-none border border-gray-700 focus:border-blue-500"
                  >
                    {#each visibleRegions as r}<option value={r}>{r}</option
                      >{/each}
                  </select>
                </div>
              </div>

              <div class="flex gap-2">
                <button
                  onclick={() => {
                    refreshKey++;
                    if(window.innerWidth < 640) sideMenuOpen = false;
                  }}
                  class="flex-1 bg-gray-900 hover:bg-gray-800 p-2 rounded text-[11px] font-semibold border border-gray-800 transition flex items-center justify-center gap-1.5 text-white"
                  title="Refresh data"
                >
                  <span>⟳</span>
                </button>
                <button
                  onclick={() => {
                    showSettings = true;
                    settingsTab = "profiles";
                    if(window.innerWidth < 640) sideMenuOpen = false;
                  }}
                  class="flex-1 bg-gray-900 hover:bg-gray-800 p-2 rounded text-[11px] font-semibold border border-gray-800 transition flex items-center justify-center gap-1.5 text-white"
                  title="Settings"
                >
                  <span>⚙</span>
                </button>
                <button
                  onclick={() => {
                    invoke("fork_process", {
                      path: activeId,
                      region,
                      profile:
                        authType === "profile" ? selectedProfile : undefined,
                    });
                    if(window.innerWidth < 640) sideMenuOpen = false;
                  }}
                  class="flex-[2] bg-blue-600 hover:bg-blue-500 p-2 rounded text-[11px] font-bold transition flex items-center justify-center gap-1.5 text-white shadow-lg"
                  title="Fork to new window"
                >
                  <span>⧉</span> Fork
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        <!-- Unified Top Bar -->
        <header
          class="flex items-center bg-gray-900 border-b border-gray-800 shrink-0 px-3 py-2 gap-3"
        >
          <button
            onclick={() => (sideMenuOpen = !sideMenuOpen)}
            class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition"
            title="Toggle Sidebar"
          >
            <span class="text-xl">☰</span>
          </button>
          
          <BackButton />
          
          <span class="text-sm font-bold truncate flex-1 text-white"
            >{serviceTitle || "AWS Console"}</span
          >
          
          <button
            onclick={() => (rightSidebarOpen = !rightSidebarOpen)}
            class="px-3 py-1.5 rounded-full hover:bg-gray-800 transition border border-transparent hover:border-gray-700 {rightSidebarOpen ? 'text-blue-400 bg-gray-800 border-gray-700' : 'text-gray-400'}"
            title="Bookmarks"
          >
            <span class="text-sm font-semibold tracking-wider flex items-center gap-2">
              <span class={bookmarks.isBookmarked ? 'text-yellow-400' : 'text-gray-500'}>
                {bookmarks.isBookmarked ? "★" : "☆"}
              </span>
              Bookmarks
            </span>
          </button>
        </header>

        {#if error}<div
            class="bg-red-500/20 text-red-300 px-3 py-1.5 text-xs border-b border-red-500/30 shrink-0"
          >
            {error}
          </div>{/if}

        <div class="flex-1 flex overflow-hidden relative">
          <!-- Dynamic SvelteKit Content Slot -->
          <div class="flex-1 overflow-hidden relative flex flex-col min-w-0">
            <ServiceLayout
              title={serviceTitle}
              tabs={serviceTabs}
              activeTab={serviceActiveTab}
              onTabChange={handleServiceTabChange}
            >
              <div class="absolute inset-0">
                {#key refreshKey}
                  {@render children()}
                {/key}
              </div>
            </ServiceLayout>
          </div>

          {#if rightSidebarOpen}
            <!-- Bookmarks Sidebar -->
            <!-- Overlay for mobile -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity sm:hidden z-[150]"
              onclick={() => (rightSidebarOpen = false)}
            ></div>

            <div
              class="fixed sm:static inset-y-0 right-0 z-[160] sm:z-auto w-72 max-w-[85vw] bg-gray-900 shadow-2xl sm:shadow-none flex flex-col border-l border-gray-800 animate-in slide-in-from-right duration-200 shrink-0"
            >
              <div class="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950 shrink-0">
                <div class="flex items-center gap-2">
                  <span class="text-yellow-500 text-lg">★</span>
                  <span class="font-bold text-gray-100">Bookmarks</span>
                </div>
                <button
                  onclick={() => (rightSidebarOpen = false)}
                  class="p-2 rounded-full hover:bg-gray-800 text-gray-400 transition"
                >
                  ✕
                </button>
              </div>

              <div class="flex-1 overflow-y-auto p-2 space-y-1">
                {#each bookmarks.all as bkm}
                  <div class="group flex flex-col w-full bg-gray-900 border border-gray-800 rounded hover:border-gray-700 transition overflow-hidden">
                    <button
                      onclick={() => { goto(bkm.url); rightSidebarOpen = false; if(window.innerWidth < 640) sideMenuOpen=false; }}
                      class="px-3 py-2 text-left hover:bg-gray-800 transition"
                    >
                      <span class="text-xs text-blue-400 font-medium break-words leading-tight block">{bkm.label}</span>
                       <span class="text-[10px] text-gray-500 font-mono truncate block mt-0.5">{bkm.url}</span>
                    </button>
                    <div class="flex border-t border-gray-800 divide-x divide-gray-800 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-950 lg:opacity-100">
                      <button
                         onclick={(e) => { e.stopPropagation(); bookmarks.remove(bkm.id); }}
                         class="flex-1 p-1.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-900/20 uppercase tracking-wider font-semibold transition"
                      >
                         Remove
                      </button>
                    </div>
                  </div>
                {/each}
                {#if bookmarks.all.length === 0}
                  <div class="p-6 text-center">
                    <div class="text-gray-500 text-xs italic">
                      No bookmarks yet.
                    </div>
                  </div>
                {/if}
              </div>

              <div class="p-3 border-t border-gray-800 bg-gray-950/80 backdrop-blur-sm shrink-0">
                <button
                  onclick={() => {
                    let label = serviceTitle;
                    if (serviceActiveTab) label += \` - \${serviceActiveTab}\`;
                    bookmarks.toggle(label);
                  }}
                  class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-semibold border border-gray-700 transition"
                >
                  <span class={bookmarks.isBookmarked ? 'text-yellow-400' : 'text-gray-400'}>
                    {bookmarks.isBookmarked ? "★" : "☆"}
                  </span>
                  <span>
                    {bookmarks.isBookmarked ? 'Remove Current Page' : 'Bookmark Current Page'}
                  </span>
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <SettingsDialog
      bind:open={showSettings}
      bind:profileOrder
      bind:profileVisible
      bind:regionOrder
      bind:regionVisible
      bind:serviceOrder
      bind:serviceVisible
      services={services as any}
      onChange={saveState}
    />`;

content = beforeElse + "\\n" + newContent + "\\n  " + afterIf;

fs.writeFileSync(file, content);
console.log("Replaced successfully!");
