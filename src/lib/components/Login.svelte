<script lang="ts">
    import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
    import { invoke } from "@tauri-apps/api/core";
    import * as fflate from "fflate";
    import Modal from "./Modal.svelte";

    let {
        os = "",
        authType = $bindable("profile"),
        accountId = $bindable(""),
        roleName = $bindable(""),
        sourceProfile = $bindable("default"),
        selectedProfile = $bindable(""),
        accessKeyId = $bindable(""),
        secretAccessKey = $bindable(""),
        sessionToken = $bindable(""),
        saveProfileName = $bindable(""),
        region = $bindable("us-east-1"),
        visibleProfiles = [],
        visibleRegions = [],
        loading = false,
        error = "",
        onLogin,
        onSwitchAuthType,
        onProfilesSaved,
    }: {
        os?: string;
        authType: "profile" | "manual" | "assume" | "qr";
        accountId?: string;
        roleName?: string;
        sourceProfile?: string;
        selectedProfile: string;
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken: string;
        saveProfileName: string;
        region: string;
        visibleProfiles: string[];
        visibleRegions: string[];
        loading: boolean;
        error: string;
        onLogin: () => void;
        onSwitchAuthType: (
            type: "profile" | "manual" | "assume" | "qr",
        ) => void;
        onProfilesSaved?: () => void;
    } = $props();

    let scanner: Html5QrcodeScanner | null = null;
    let scannerNode: HTMLElement | null = $state(null);

    let importQueue = $state<any[]>([]);
    let conflictQueue = $state<{ newProfile: any; existingProfile: any }[]>([]);
    let showConflictModal = $state(false);
    let activeConflict = $derived(
        conflictQueue.length > 0 ? conflictQueue[0] : null,
    );
    let importSummary = $state("");
    let importSummaryTimeout: any = null;

    function areProfilesEqual(p1: any, p2: any) {
        const keysToCompare = [
            "aws_access_key_id",
            "aws_secret_access_key",
            "aws_session_token",
            "region",
            "role_arn",
            "source_profile",
            "credential_process",
        ];
        for (const k of keysToCompare) {
            if (p1[k] !== p2[k]) return false;
        }
        return true;
    }

    $effect(() => {
        if (authType === "qr" && scannerNode && !scanner) {
            scanner = new Html5QrcodeScanner(
                "qr-reader",
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                },
                /* verbose= */ false,
            );
            scanner.render(onScanSuccess, onScanFailure);
        } else if (authType !== "qr" && scanner) {
            scanner.clear().catch(console.error);
            scanner = null;
        }

        return () => {
            if (scanner) {
                scanner.clear().catch(console.error);
                scanner = null;
            }
        };
    });

    async function processImportQueue() {
        if (importQueue.length > 0) {
            await Promise.all(
                importQueue.map(async (p: any) => {
                    try {
                        await invoke("save_profile", {
                            name: p.profile || "default",
                            properties: p,
                        });
                    } catch (e) {
                        console.error(e);
                    }
                }),
            );

            const first = importQueue[0] || {};
            if (first.profile) selectedProfile = first.profile;
            if (onProfilesSaved) onProfilesSaved();
        }

        importQueue = [];

        if (scanner) {
            scanner.clear().catch(console.error);
            scanner = null;
        }

        onSwitchAuthType("profile");

        if (importSummaryTimeout) clearTimeout(importSummaryTimeout);
        importSummaryTimeout = setTimeout(() => (importSummary = ""), 5000);
    }

    function resolveConflict(keepNew: boolean) {
        if (!activeConflict) return;

        if (keepNew) {
            importQueue.push(activeConflict.newProfile);
        }

        conflictQueue = conflictQueue.slice(1);

        if (conflictQueue.length === 0) {
            showConflictModal = false;
            processImportQueue();
        }
    }

    async function onScanSuccess(decodedText: string, decodedResult: any) {
        try {
            // Pause scanning while processing
            if (scanner) scanner.pause(true);

            let jsonText = decodedText;
            if (decodedText.startsWith("zlib:")) {
                const b64 = decodedText.slice(5);
                const binary = atob(b64);
                const compressed = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    compressed[i] = binary.charCodeAt(i);
                }
                const decompressed = fflate.inflateSync(compressed);
                jsonText = fflate.strFromU8(decompressed);
            }
            const data = JSON.parse(jsonText);

            if (Array.isArray(data)) {
                let existingProfiles: any[] = [];
                try {
                    existingProfiles = await invoke("get_all_profiles");
                } catch (e) {
                    console.error("Failed to fetch existing profiles", e);
                }

                let identicalCount = 0;
                let newCount = 0;

                for (const p of data) {
                    if (Object.keys(p).length <= 1) continue;

                    const pName = p.profile || "default";
                    const existingP = existingProfiles.find(
                        (ep) => ep.profile === pName,
                    );

                    if (existingP) {
                        if (areProfilesEqual(p, existingP)) {
                            identicalCount++;
                        } else {
                            conflictQueue.push({
                                newProfile: p,
                                existingProfile: existingP,
                            });
                        }
                    } else {
                        importQueue.push(p);
                        newCount++;
                    }
                }

                let summaryParts = [];
                if (identicalCount > 0)
                    summaryParts.push(
                        `${identicalCount} profile(s) already imported`,
                    );
                if (newCount > 0)
                    summaryParts.push(`${newCount} new profile(s) ready`);
                importSummary = summaryParts.join(", ");

                if (conflictQueue.length > 0) {
                    showConflictModal = true;
                } else {
                    await processImportQueue();
                }
            } else if (data.aws_access_key_id || data.access_key_id) {
                accessKeyId = data.aws_access_key_id || data.access_key_id;
                secretAccessKey =
                    data.aws_secret_access_key || data.secret_access_key;
                const token = data.aws_session_token || data.session_token;
                if (token) sessionToken = token;
                const reg = data.region;
                if (reg) region = reg;

                onSwitchAuthType("manual");
                if (scanner) {
                    scanner.clear().catch(console.error);
                    scanner = null;
                }
            }
        } catch (e) {
            console.error("Failed to parse QR code", e);
        }
    }

    function onScanFailure(error: any) {
        // ignore scan failures
    }

    let isConnectDisabled = $derived.by(() => {
        if (loading) return true;

        if (authType === "profile") {
            return !selectedProfile || selectedProfile.trim() === "";
        }

        if (authType === "manual") {
            if (!saveProfileName.trim()) return true;
            return !accessKeyId.trim() || !secretAccessKey.trim();
        }

        if (authType === "assume") {
            if (!saveProfileName.trim()) return true;
            return (
                !accountId?.trim() ||
                !roleName?.trim() ||
                !sourceProfile?.trim()
            );
        }

        if (authType === "qr") {
            return true; // Must scan to switch authType
        }

        return false;
    });

    let isMobileAndEmpty = $derived(
        (os === "android" || os === "ios") &&
            visibleProfiles.length <= 1 &&
            (visibleProfiles.length === 0 || visibleProfiles[0] === "default"),
    );
</script>

<div class="flex items-center justify-center flex-1 p-4">
    <div
        class="w-full max-w-sm bg-gray-900 p-6 rounded-xl shadow-2xl border border-gray-800"
    >
        <h1 class="text-xl font-bold mb-4 text-blue-400">CloudDash for AWS</h1>
        {#if importSummary}
            <div
                class="bg-green-500/20 border border-green-500/30 text-green-400 p-2.5 rounded mb-4 text-sm font-medium transition-opacity"
            >
                {importSummary}
            </div>
        {/if}
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 rounded mb-3 text-xs">
                {error}
            </div>
        {/if}
        <div class="space-y-3">
            <div>
                <div
                    class="flex border-b border-gray-800 mb-4"
                    role="tablist"
                    aria-label="Login Method"
                >
                    {#if !isMobileAndEmpty}
                        <button
                            onclick={() => onSwitchAuthType("profile")}
                            class="flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors border-b-2 {authType ===
                            'profile'
                                ? 'text-blue-400 border-blue-500'
                                : 'text-gray-500 border-transparent hover:text-gray-300'}"
                            >Profile</button
                        >
                    {/if}
                    <button
                        onclick={() => onSwitchAuthType("manual")}
                        class="flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors border-b-2 {authType ===
                        'manual'
                            ? 'text-blue-400 border-blue-500'
                            : 'text-gray-500 border-transparent hover:text-gray-300'}"
                        >API Keys</button
                    >
                    <button
                        onclick={() => onSwitchAuthType("assume")}
                        class="flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors border-b-2 {authType ===
                        'assume'
                            ? 'text-blue-400 border-blue-500'
                            : 'text-gray-500 border-transparent hover:text-gray-300'}"
                        >Assume Role</button
                    >
                    <button
                        onclick={() => onSwitchAuthType("qr")}
                        class="flex-1 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors border-b-2 {authType ===
                        'qr'
                            ? 'text-blue-400 border-blue-500'
                            : 'text-gray-500 border-transparent hover:text-gray-300'}"
                        >QR Code</button
                    >
                </div>
            </div>

            {#if authType === "profile"}
                <div>
                    <label
                        for="profileSelect"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Profile</label
                    >
                    <select
                        id="profileSelect"
                        bind:value={selectedProfile}
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500"
                    >
                        {#each visibleProfiles as p}<option value={p}
                                >{p}</option
                            >{/each}
                    </select>
                </div>
            {:else if authType === "manual"}
                <div>
                    <label
                        for="akInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Access Key ID</label
                    >
                    <input
                        id="akInput"
                        type="text"
                        bind:value={accessKeyId}
                        placeholder="AKIAIOS..."
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
                <div>
                    <label
                        for="skInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Secret Access Key</label
                    >
                    <input
                        id="skInput"
                        type="password"
                        bind:value={secretAccessKey}
                        placeholder="wJalrXUtnFEMI/K7MDENG..."
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
                <div class="mt-2">
                    <label
                        for="stInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Session Token <span class="text-[10px] opacity-70"
                            >(Optional)</span
                        ></label
                    >
                    <textarea
                        id="stInput"
                        bind:value={sessionToken}
                        rows="2"
                        placeholder="IQoJb3..."
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono resize-none"
                    ></textarea>
                </div>
                <div class="mt-4 border-t border-gray-800 pt-3">
                    <label
                        for="profileNameInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Save As Profile Name</label
                    >
                    <input
                        id="profileNameInput"
                        type="text"
                        bind:value={saveProfileName}
                        placeholder="e.g. prod-admin"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
            {:else if authType === "assume"}
                <div>
                    <label
                        for="accountIdInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Account ID</label
                    >
                    <input
                        id="accountIdInput"
                        type="text"
                        bind:value={accountId}
                        placeholder="123456789012"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
                <div class="mt-2">
                    <label
                        for="roleNameInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Role Name</label
                    >
                    <input
                        id="roleNameInput"
                        type="text"
                        bind:value={roleName}
                        placeholder="OrganizationAccountAccessRole"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
                <div class="mt-2">
                    <label
                        for="sourceProfileInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Source Profile</label
                    >
                    <select
                        id="sourceProfileInput"
                        bind:value={sourceProfile}
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500"
                    >
                        {#each visibleProfiles as p}<option value={p}
                                >{p}</option
                            >{/each}
                    </select>
                </div>
                <div class="mt-4 border-t border-gray-800 pt-3">
                    <label
                        for="profileNameInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Save As Profile Name</label
                    >
                    <input
                        id="profileNameInput"
                        type="text"
                        bind:value={saveProfileName}
                        placeholder="e.g. prod-admin"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
            {:else if authType === "qr"}
                <div
                    class="bg-blue-500/10 border border-blue-500/20 p-3 rounded text-xs text-blue-300 mb-4 leading-relaxed"
                >
                    <strong>QR Scan:</strong> Scan the credentials QR code from your
                    other device to securely transfer them here.
                </div>
                <div
                    id="qr-reader"
                    bind:this={scannerNode}
                    class="w-full bg-white text-black min-h-[300px] rounded overflow-hidden"
                ></div>
            {/if}
            <button
                onclick={onLogin}
                disabled={isConnectDisabled}
                class="w-full {isConnectDisabled
                    ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'} p-2.5 rounded font-bold text-sm shadow-lg transition"
            >
                {loading ? "Connecting..." : "Connect"}
            </button>
        </div>
    </div>
</div>

<Modal bind:open={showConflictModal} title="Profile Conflict">
    {#if activeConflict}
        <div class="text-sm text-gray-300 mb-4 whitespace-normal">
            The profile <strong
                class="text-white bg-gray-800 px-1 py-0.5 rounded"
                >{activeConflict.newProfile.profile}</strong
            > already exists but with different credentials or configuration. What
            would you like to keep?
        </div>

        <div class="grid grid-cols-2 gap-4 mb-6">
            <div
                class="bg-gray-800 p-3 rounded border border-gray-700 overflow-hidden"
            >
                <div
                    class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-700 pb-1"
                >
                    Existing Profile
                </div>
                <div class="text-xs font-mono text-gray-300 space-y-1">
                    {#if activeConflict.existingProfile.aws_access_key_id}
                        <div class="flex flex-col">
                            <span class="text-gray-500">Access Key:</span><span
                                class="truncate"
                                >{activeConflict.existingProfile
                                    .aws_access_key_id}</span
                            >
                        </div>
                    {/if}
                    {#if activeConflict.existingProfile.role_arn}
                        <div class="flex flex-col mt-1">
                            <span class="text-gray-500">Role ARN:</span><span
                                class="truncate text-[10px] break-all whitespace-normal"
                                >{activeConflict.existingProfile.role_arn}</span
                            >
                        </div>
                    {/if}
                    {#if activeConflict.existingProfile.region}
                        <div class="flex flex-col mt-1">
                            <span class="text-gray-500">Region:</span><span
                                >{activeConflict.existingProfile.region}</span
                            >
                        </div>
                    {/if}
                </div>
            </div>

            <div
                class="bg-blue-900/20 p-3 rounded border border-blue-500/30 overflow-hidden"
            >
                <div
                    class="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2 border-b border-blue-500/30 pb-1"
                >
                    Scanned Profile
                </div>
                <div class="text-xs font-mono text-gray-300 space-y-1">
                    {#if activeConflict.newProfile.aws_access_key_id}
                        <div class="flex flex-col">
                            <span class="text-gray-500">Access Key:</span><span
                                class="truncate"
                                >{activeConflict.newProfile
                                    .aws_access_key_id}</span
                            >
                        </div>
                    {/if}
                    {#if activeConflict.newProfile.role_arn}
                        <div class="flex flex-col mt-1">
                            <span class="text-gray-500">Role ARN:</span><span
                                class="truncate text-[10px] break-all whitespace-normal"
                                >{activeConflict.newProfile.role_arn}</span
                            >
                        </div>
                    {/if}
                    {#if activeConflict.newProfile.region}
                        <div class="flex flex-col mt-1">
                            <span class="text-gray-500">Region:</span><span
                                >{activeConflict.newProfile.region}</span
                            >
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <div class="flex gap-3 mt-4">
            <button
                onclick={() => resolveConflict(false)}
                class="flex-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-white font-semibold transition text-sm text-center shadow-sm"
            >
                Keep Existing
            </button>
            <button
                onclick={() => resolveConflict(true)}
                class="flex-1 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition text-sm text-center shadow-sm"
            >
                Replace with Scanned
            </button>
        </div>
        {#if conflictQueue.length > 1}
            <div class="text-center text-xs text-gray-500 mt-3 font-medium">
                {conflictQueue.length - 1} more conflict(s) remaining
            </div>
        {/if}
    {/if}
</Modal>

<style>
    /* Make HTML5 QR Code scanner UI larger and better looking */
    :global(#qr-reader button) {
        background-color: #2563eb !important; /* blue-600 */
        color: white !important;
        font-weight: bold !important;
        padding: 0.75rem 1.5rem !important;
        border-radius: 0.5rem !important;
        border: none !important;
        font-size: 1rem !important;
        margin-bottom: 1rem !important;
        cursor: pointer;
        transition: opacity 0.2s;
        box-shadow:
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    :global(#qr-reader button:hover) {
        opacity: 0.9;
    }
    :global(#qr-reader select) {
        background-color: #1f2937 !important; /* gray-800 */
        color: white !important;
        font-size: 1rem !important;
        padding: 0.75rem 1rem !important;
        border-radius: 0.25rem !important;
        border: 1px solid #374151 !important; /* gray-700 */
        width: 100% !important;
        margin-bottom: 1rem !important;
        outline: none;
    }
    :global(#qr-reader span) {
        color: #d1d5db !important; /* gray-300 */
    }
    :global(#qr-reader #html5-qrcode-anchor-scan-type-change) {
        display: none !important;
    }
</style>
