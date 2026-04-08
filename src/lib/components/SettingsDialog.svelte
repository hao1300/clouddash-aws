<script lang="ts">
    import Modal from "./Modal.svelte";
    import ReorderableList from "./ReorderableList.svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { open as openDialog } from "@tauri-apps/plugin-dialog";
    import { settings } from "$lib/services/settings.svelte";
    import { toastService } from "$lib/services/toast.svelte";
    import { pickFolder } from "tauri-plugin-scoped-storage-api";
    import QRCode from "qrcode";
    import * as fflate from "fflate";
    import { onMount, onDestroy } from "svelte";

    let showQrScanner = $state(false);
    let qrScannerId = 'license-qr-reader';
    let html5QrScanner: any = null;
    let licenseKeyInput = $state("");

    $effect(() => {
        if (settingsTab === "pro") {
            licenseKeyInput = settings.licenseKey;
        }
    });

    async function startQrScanner() {
        showQrScanner = true;
        // Wait for the DOM element to render
        await new Promise(r => setTimeout(r, 100));
        try {
            const { Html5Qrcode } = await import("html5-qrcode");
            html5QrScanner = new Html5Qrcode(qrScannerId);
            await html5QrScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 220, height: 220 } },
                async (decodedText: string) => {
                    // Stop scanner
                    await stopQrScanner();
                    // Auto-populate and validate
                    licenseKeyInput = decodedText.trim();
                    await activateLicense();
                },
                () => {} // Ignore scan errors
            );
        } catch (e) {
            console.error("QR scanner error", e);
            toastService.error("Failed to start camera. Please paste your key instead.");
            showQrScanner = false;
        }
    }

    async function stopQrScanner() {
        if (html5QrScanner) {
            try {
                await html5QrScanner.stop();
                html5QrScanner.clear();
            } catch { /* ignore */ }
            html5QrScanner = null;
        }
        showQrScanner = false;
    }

    async function activateLicense() {
        if (!licenseKeyInput.trim()) return;
        settings.licenseKey = licenseKeyInput.trim();
        const valid = await settings.validateLicense();
        if (valid) {
            toastService.success("Pro license activated!");
        }
    }

    let os = $state("windows");

    onMount(async () => {
        try {
            os = await invoke("get_os");
            if (!settings.downloadFolder) {
                settings.downloadFolder = await invoke("get_default_download_directory");
            }
        } catch (e) {
            console.error("Failed to initialize settings for platform", e);
        }
    });

    export interface ServiceDef {
        id: string;
        label: string;
        defaultEnabled?: boolean;
    }

    let {
        open = $bindable(false),
        profileOrder = $bindable([]),
        profileVisible = $bindable(new Set()),
        regionOrder = $bindable([]),
        regionVisible = $bindable(new Set()),
        serviceOrder = $bindable([]),
        serviceVisible = $bindable(new Set()),
        services = [],
        onChange,
    }: {
        open: boolean;
        profileOrder: string[];
        profileVisible: Set<string>;
        regionOrder: string[];
        regionVisible: Set<string>;
        serviceOrder: string[];
        serviceVisible: Set<string>;
        services: ServiceDef[];
        onChange: () => void;
    } = $props();

    let settingsTab = $state<"general" | "profiles" | "regions" | "services" | "qrcode" | "pro">(
        "general",
    );

    let qrCodeDataUrl = $state("");
    let qrError = $state("");
    let loadingQr = $state(false);

    let qrCarouselIndex = $state(0);
    let includeQrSourceProfile = $state(false);
    let allCreds = $state<any[]>([]);
    let qrProfiles = $derived(allCreds.filter((c: any) => profileVisible.has(c.profile)));

    $effect(() => {
        if (settingsTab === "qrcode" && allCreds.length === 0 && !loadingQr && !qrError) {
            loadingQr = true;
            qrError = "";
            invoke("get_all_profiles")
                .then((creds: any) => {
                    creds.sort((a: any, b: any) => {
                        let idxA = profileOrder.indexOf(a.profile);
                        let idxB = profileOrder.indexOf(b.profile);
                        if (idxA === -1) idxA = 99999;
                        if (idxB === -1) idxB = 99999;
                        if (idxA !== idxB) return idxA - idxB;
                        return a.profile.localeCompare(b.profile);
                    });
                    allCreds = creds;
                })
                .catch((err: any) => {
                    qrError = typeof err === "string" ? err : err.message || "Failed to load profiles";
                })
                .finally(() => {
                    loadingQr = false;
                });
        }
    });

    $effect(() => {
        if (settingsTab === "qrcode" && allCreds.length > 0) {
            if (qrProfiles.length === 0) {
                qrCodeDataUrl = "";
                return;
            }
            if (qrCarouselIndex >= qrProfiles.length) {
                qrCarouselIndex = Math.max(0, qrProfiles.length - 1);
            }
            const activeProfile = qrProfiles[qrCarouselIndex];
            if (!activeProfile) return;

            const toExport = [activeProfile];
            if (includeQrSourceProfile && activeProfile.role_arn && activeProfile.source_profile) {
                const sourceProfile = allCreds.find((c: any) => c.profile === activeProfile.source_profile);
                if (sourceProfile) {
                    toExport.push(sourceProfile);
                }
            }

            const jsonStr = JSON.stringify(toExport);
            const buf = fflate.strToU8(jsonStr);
            const compressed = fflate.deflateSync(buf);
            const binString = Array.from(compressed, (byte) => String.fromCharCode(byte)).join("");
            const b64 = btoa(binString);
            const finalPayload = "zlib:" + b64;
            
            QRCode.toDataURL(finalPayload, {
                width: 300,
                margin: 2,
                scale: 4,
            }).then((url: any) => {
                if (url) qrCodeDataUrl = typeof url === "string" ? url : "";
            }).catch((err: any) => {
                qrError = typeof err === "string" ? err : err.message || "Failed to generate QR code";
            });
        }
    });

    function toggleInSet(s: Set<string>, id: string, minSize = 1): Set<string> {
        const next = new Set(s);
        if (next.has(id)) {
            if (next.size > minSize) next.delete(id);
        } else next.add(id);
        return next;
    }

    function toggleProfile(id: string) {
        profileVisible = toggleInSet(profileVisible, id, 1);
        onChange();
    }

    function toggleRegion(id: string) {
        regionVisible = toggleInSet(regionVisible, id, 1);
        onChange();
    }

    function toggleService(id: string) {
        serviceVisible = toggleInSet(serviceVisible, id, 1);
        onChange();
    }

    function handleProfileReorder(newOrder: string[]) {
        profileOrder = newOrder;
        onChange();
    }

    function handleRegionReorder(newOrder: string[]) {
        regionOrder = newOrder;
        onChange();
    }

    function handleServiceReorder(newOrder: string[]) {
        serviceOrder = newOrder;
        onChange();
    }

    async function browseDownloadFolder() {
        if (os === "android" || os === "ios") {
            try {
                const folder = await pickFolder();
                if (folder) {
                    settings.downloadFolder = folder.uri;
                    settings.downloadFolderId = folder.id;
                    settings.downloadFolderName = folder.name;
                    settings.save();
                    onChange();
                }
            } catch (e) {
                console.error("Scoped storage picker failed", e);
                toastService.error("Scoped storage picker failed.");
            }
            return;
        }

        try {
            const selected = await openDialog({
                directory: true,
                multiple: false,
            });
            if (selected && typeof selected === "string") {
                settings.downloadFolder = selected;
                settings.save();
                onChange();
            }
        } catch (e) {
            console.error("Browse dialog failed", e);
            toastService.error("Failed to open browse dialog");
        }
    }
</script>

<Modal bind:open title="Settings" maxWidth="max-w-3xl">
    <div class="flex {os === 'android' || os === 'ios' ? 'flex-col' : 'flex-row'} -m-5 h-[420px] md:h-[600px]">
        <!-- Tabs -->
        <div
            class="{os === 'android' || os === 'ios' ? 'w-full flex-row border-b' : 'w-32 flex-col border-r'} bg-gray-950 border-gray-800 flex py-2 shrink-0 overflow-x-auto"
        >
            {#each [["general", "General"], ["profiles", "Profiles"], ["regions", "Regions"], ["qrcode", "Export Keys"], ["pro", "Pro License"]] as const as [key, label]}
                <button
                    onclick={() => (settingsTab = key)}
                    class="px-4 py-2.5 text-xs font-semibold transition whitespace-nowrap 
                        {os === 'android' || os === 'ios' ? 'text-center flex-1 border-b-2' : 'text-left border-r-2'}
                        {settingsTab === key
                            ? 'bg-gray-800 text-blue-400 border-blue-500'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900 border-transparent'}"
                >
                    {label}
                </button>
            {/each}
        </div>

        <!-- Right content -->
        <div class="flex-1 p-4 overflow-auto">
            {#if settingsTab === "general"}
                <div class="space-y-6">
                    <div>
                        <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                            Downloads
                        </h3>
                        <div class="space-y-2">
                            <label class="block text-xs text-gray-400">Download Folder</label>
                            <div class="flex gap-2">
                                <input
                                    type="text"
                                    value={settings.downloadFolderId ? settings.downloadFolderName : settings.downloadFolder}
                                    oninput={(e) => {
                                        settings.downloadFolder = e.currentTarget.value;
                                        settings.downloadFolderId = "";
                                        settings.downloadFolderName = "";
                                    }}
                                    placeholder="Default Downloads folder"
                                    onchange={() => settings.save()}
                                    class="flex-1 bg-black border border-gray-800 rounded px-3 py-2 text-xs text-gray-200 focus:border-blue-500 outline-none transition"
                                />
                                <button
                                    onclick={browseDownloadFolder}
                                    class="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded text-xs font-bold transition shadow-sm border border-gray-700"
                                >
                                    Browse...
                                </button>
                            </div>
                            <p class="text-[10px] text-gray-500 italic">
                                If empty, files will be downloaded to your system's default Downloads folder.
                            </p>
                        </div>
                    </div>
                    <div>
                        <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                            File Handling
                        </h3>
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-400">If file exists...</span>
                                <div class="flex bg-black rounded p-0.5 border border-gray-800">
                                    <button 
                                        onclick={() => { settings.downloadConflictMode = "rename"; settings.save(); }}
                                        class="px-3 py-1 text-[10px] font-bold rounded transition {settings.downloadConflictMode === 'rename' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}"
                                    >Rename</button>
                                    <button 
                                        onclick={() => { settings.downloadConflictMode = "overwrite"; settings.save(); }}
                                        class="px-3 py-1 text-[10px] font-bold rounded transition {settings.downloadConflictMode === 'overwrite' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}"
                                    >Overwrite</button>
                                </div>
                            </div>
                            <p class="text-xs text-gray-500 italic">
                                "Rename" will append a number if the file already exists (e.g., file (1).zip).
                            </p>
                        </div>
                    </div>
                </div>
            {:else if settingsTab === "profiles"}
                <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    Profiles — drag to reorder
                </h3>
                <ReorderableList
                    items={profileOrder}
                    onReorder={handleProfileReorder}
                >
                    {#snippet children(id)}
                        <span class="flex-1 text-sm font-mono text-gray-200"
                            >{id}</span
                        >
                        <button
                            onclick={() => toggleProfile(id)}
                            aria-label="Toggle {id}"
                            class="w-9 h-5 rounded-full relative transition-colors {profileVisible.has(
                                id,
                            )
                                ? 'bg-blue-600'
                                : 'bg-gray-700'}"
                        >
                            <span
                                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {profileVisible.has(
                                    id,
                                )
                                    ? 'left-[18px]'
                                    : 'left-0.5'}"
                            ></span>
                        </button>
                    {/snippet}
                </ReorderableList>
            {:else if settingsTab === "regions"}
                <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    Regions — drag to reorder
                </h3>
                <ReorderableList
                    items={regionOrder}
                    onReorder={handleRegionReorder}
                >
                    {#snippet children(id)}
                        <span class="flex-1 text-sm font-mono text-gray-200"
                            >{id}</span
                        >
                        <button
                            onclick={() => toggleRegion(id)}
                            aria-label="Toggle {id}"
                            class="w-9 h-5 rounded-full relative transition-colors {regionVisible.has(
                                id,
                            )
                                ? 'bg-blue-600'
                                : 'bg-gray-700'}"
                        >
                            <span
                                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {regionVisible.has(
                                    id,
                                )
                                    ? 'left-[18px]'
                                    : 'left-0.5'}"
                            ></span>
                        </button>
                    {/snippet}
                </ReorderableList>
            {:else if settingsTab === "services"}
                <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    Services — drag to reorder
                </h3>
                <ReorderableList
                    items={serviceOrder}
                    onReorder={handleServiceReorder}
                >
                    {#snippet children(id)}
                        {@const svc = services.find((s) => s.id === id)}
                        {#if svc}
                            <span class="flex-1 text-sm text-gray-200"
                                >{svc.label}</span
                            >
                            <button
                                onclick={() => toggleService(id)}
                                aria-label="Toggle {svc.label}"
                                class="w-9 h-5 rounded-full relative transition-colors {serviceVisible.has(
                                    id,
                                )
                                    ? 'bg-blue-600'
                                    : 'bg-gray-700'}"
                            >
                                <span
                                    class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all {serviceVisible.has(
                                        id,
                                    )
                                        ? 'left-[18px]'
                                        : 'left-0.5'}"
                                ></span>
                            </button>
                        {/if}
                    {/snippet}
                </ReorderableList>
            {:else if settingsTab === "qrcode"}
                <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    Export Credentials
                </h3>
                <div class="flex flex-col items-center justify-center p-4">
                    <div
                        class="text-sm text-gray-400 text-center mb-6 leading-relaxed max-w-sm"
                    >
                        Scan this QR code from your mobile client's login page
                        to securely transfer your current active AWS
                        credentials.
                    </div>

                    {#if loadingQr && allCreds.length === 0}
                        <div class="text-blue-400 font-mono text-sm">
                            Loading profiles...
                        </div>
                    {:else if qrProfiles.length === 0}
                        <div class="text-gray-500 text-sm">
                            No profiles selected to export.
                        </div>
                    {:else if qrError}
                        <div
                            class="bg-red-500/20 text-red-300 p-3 rounded text-sm text-center max-w-sm border border-red-500/30"
                        >
                            {qrError}
                        </div>
                    {:else if qrCodeDataUrl}
                        <div class="flex items-center gap-6">
                            <button
                                onclick={() => qrCarouselIndex = (qrCarouselIndex - 1 + qrProfiles.length) % qrProfiles.length}
                                class="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                                disabled={qrProfiles.length <= 1}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>

                            <div class="flex flex-col items-center">
                                <div class="text-sm font-semibold text-gray-200 mb-3 bg-gray-800 px-3 py-1 rounded-full border border-gray-700">
                                    {qrProfiles[qrCarouselIndex]?.profile}
                                </div>
                                <div
                                    class="bg-white p-4 rounded-xl shadow-lg border border-gray-700"
                                >
                                    <img
                                        src={qrCodeDataUrl}
                                        alt="Credentials QR Code"
                                        class="w-[200px] h-[200px] select-none pointer-events-none"
                                    />
                                </div>
                                {#if qrProfiles[qrCarouselIndex]?.role_arn && qrProfiles[qrCarouselIndex]?.source_profile}
                                    <label class="mt-4 flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition group">
                                        <div class="relative flex items-center">
                                            <input type="checkbox" bind:checked={includeQrSourceProfile} class="peer sr-only" />
                                            <div class="w-4 h-4 rounded border border-gray-600 bg-gray-800 peer-checked:bg-blue-600 peer-checked:border-blue-500 transition-colors"></div>
                                            <svg class="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 top-0.5 left-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                        <span>Include source <span class="text-blue-400 font-mono text-xs">{qrProfiles[qrCarouselIndex].source_profile}</span></span>
                                    </label>
                                {/if}
                            </div>

                            <button
                                onclick={() => qrCarouselIndex = (qrCarouselIndex + 1) % qrProfiles.length}
                                class="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition disabled:opacity-50"
                                disabled={qrProfiles.length <= 1}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>
                        <div class="mt-4 text-xs text-gray-500 font-medium">
                            {qrCarouselIndex + 1} of {qrProfiles.length}
                        </div>
                    {/if}
                </div>
            {:else if settingsTab === "pro"}
                <div class="space-y-6">
                    <div>
                        <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-3">
                            License Activation
                        </h3>
                        <div class="space-y-4">
                            <!-- Status Badge -->
                            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-800 flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center {settings.isPro ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}">
                                        {#if settings.isPro}
                                            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        {:else}
                                            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                                        {/if}
                                    </div>
                                    <div>
                                        <div class="text-xs font-bold text-gray-100 uppercase tracking-tight">
                                            {settings.isPro ? 'Pro Version Active' : 'Free Version'}
                                        </div>
                                        <div class="text-[10px] text-gray-500">
                                            {#if settings.isPro}
                                                {settings.licenseEmail ? `Licensed to ${settings.licenseEmail}` : 'Thank you for supporting CloudDash!'}
                                            {:else}
                                                Read-only access to limited services.
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                                {#if !settings.isPro}
                                    <a
                                        href="https://clouddash.dev/pricing"
                                        target="_blank"
                                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-[11px] font-bold transition shadow-lg shadow-blue-600/20"
                                    >
                                        Upgrade now
                                    </a>
                                {/if}
                            </div>

                            <!-- License Key Input -->
                            <div class="space-y-2">
                                <label class="block text-[11px] font-medium text-gray-400" for="license-key">License Key</label>
                                <div class="flex gap-2">
                                    <input
                                        id="license-key"
                                        type="text"
                                        bind:value={licenseKeyInput}
                                        placeholder="CD-XXXX-XXXX-XXXX-XXXX"
                                        disabled={settings.licenseValidating}
                                        class="flex-1 bg-black border rounded px-3 py-2.5 text-xs text-white focus:border-blue-500 outline-none transition font-mono
                                            {settings.isPro ? 'border-green-500/30' : settings.licenseError ? 'border-red-500/50' : 'border-gray-800'}"
                                    />
                                    <button
                                        onclick={activateLicense}
                                        disabled={settings.licenseValidating || !licenseKeyInput.trim()}
                                        class="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded text-[11px] font-bold transition shadow-sm flex items-center gap-1.5"
                                    >
                                        {#if settings.licenseValidating}
                                            <svg class="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75"></path></svg>
                                            Validating
                                        {:else}
                                            Activate
                                        {/if}
                                    </button>
                                    {#if settings.licenseKey}
                                        <button
                                            onclick={() => { settings.clearLicense(); licenseKeyInput = ''; }}
                                            class="bg-gray-800/50 hover:bg-red-500/20 text-gray-400 hover:text-red-400 px-3 py-2 rounded text-xs transition border border-gray-700"
                                            title="Clear License Key"
                                        >
                                            ✕
                                        </button>
                                    {/if}
                                </div>

                                <!-- Validation Feedback -->
                                {#if settings.licenseError}
                                    <div class="flex items-center gap-1.5 text-[11px] text-red-400 mt-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                        {settings.licenseError}
                                    </div>
                                {:else if settings.isPro}
                                    <div class="flex items-center gap-1.5 text-[11px] text-green-400 mt-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        License validated successfully
                                    </div>
                                {/if}

                                <p class="text-[10px] text-gray-500 italic mt-1 leading-relaxed">
                                    CloudDash Pro unlocks all AWS services (EC2, Lambda, IAM, etc.) and enables write operations like creating, deleting, and editing resources.
                                </p>
                            </div>

                            <!-- QR Scanner -->
                            <div class="border-t border-gray-800/50 pt-4">
                                {#if showQrScanner}
                                    <div class="flex flex-col items-center gap-3">
                                        <div id={qrScannerId} class="w-full max-w-[280px] rounded-lg overflow-hidden border border-gray-700"></div>
                                        <button
                                            onclick={stopQrScanner}
                                            class="text-gray-400 hover:text-white text-xs font-medium transition"
                                        >
                                            Cancel Scan
                                        </button>
                                    </div>
                                {:else}
                                    <button
                                        onclick={startQrScanner}
                                        class="w-full flex items-center justify-center gap-2 bg-gray-800/50 hover:bg-gray-800 text-gray-300 hover:text-white py-3 rounded-lg text-xs font-semibold transition border border-gray-700 border-dashed"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                                            <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                                            <rect x="7" y="7" width="10" height="10" rx="1"></rect>
                                        </svg>
                                        Scan QR Code from Email
                                    </button>
                                {/if}
                            </div>
                        </div>
                    </div>

                    <div class="pt-4 border-t border-gray-800/50">
                        <div class="flex items-center gap-2 text-xs text-blue-400 font-medium">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            <span>Need help? Contact support at <a href="mailto:support@clouddash.dev" class="underline underline-offset-4 hover:text-blue-300 transition">support@clouddash.dev</a></span>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</Modal>
