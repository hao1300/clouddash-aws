<script lang="ts">
    import QRScanner from "./QRScanner.svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import * as fflate from "fflate";
    import Modal from "./Modal.svelte";
    import Select from "./Select.svelte";
    import Icon from "./Icon.svelte";
    import { mdiClose } from "@mdi/js";
    import { mobileState } from "$lib/services/mobile";

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
        mfaSerial = $bindable(""),
        saveProfileName = $bindable(""),
        region = $bindable("us-east-1"),
        visibleProfiles = [],
        visibleRegions = [],
        isAddingProfile = false,
        loading = false,
        error = $bindable(""),
        onCancel,
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
        mfaSerial: string;
        saveProfileName: string;
        region: string;
        visibleProfiles: string[];
        visibleRegions: string[];
        isAddingProfile?: boolean;
        loading: boolean;
        error: string;
        onCancel?: () => void;
        onLogin: () => void;
        onSwitchAuthType: (
            type: "profile" | "manual" | "assume" | "qr",
        ) => void;
        onProfilesSaved?: () => void;
    } = $props();

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

    let _scanning = false;
    let _cameraActive = $state(false);

    // Reset camera state when switching tabs
    $effect(() => {
        authType; // track dependency
        _cameraActive = false;
    });

    // Handle Android back button intercept state
    $effect(() => {
        if (os === "android") {
            mobileState.preventGlobalBack = _cameraActive;
        }
    });

    $effect(() => {
        let unlisten: UnlistenFn | null = null;
        if (_cameraActive) {
            listen("tauri://back-button", () => {
                _cameraActive = false;
                cancel().catch(console.error);
            }).then(u => unlisten = u);
        }
        return () => {
            if (unlisten) unlisten();
        };
    });

    $effect(() => {
        if (authType === "qr" && _cameraActive) {
            // Camera active and QR selected
        } else if (authType !== "qr" && _scanning) {
            _scanning = false;
        }

        return () => {
            if (_scanning) {
                _scanning = false;
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
            _cameraActive = false;

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

        let mfaInvalid = !!(mfaSerial && !/^(arn:aws[-a-z]*:iam::\d{12}:mfa\/[\w+=,.@-]+|[A-Za-z0-9]+)$/.test(mfaSerial));

        if (authType === "profile") {
            return !selectedProfile || selectedProfile.trim() === "";
        }

        if (authType === "manual") {
            if (!saveProfileName.trim()) return true;
            if (mfaInvalid) return true;
            return !accessKeyId.trim() || !secretAccessKey.trim();
        }

        if (authType === "assume") {
            if (!saveProfileName.trim()) return true;
            if (mfaInvalid) return true;
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
        class="relative w-full max-w-sm bg-gray-900 p-6 rounded-xl shadow-2xl border border-gray-800"
    >
        {#if isAddingProfile && onCancel}
            <button onclick={onCancel} class="absolute top-4 right-4 p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-gray-800 transition">
                <Icon path={mdiClose} size={20} />
            </button>
        {/if}
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
                    {#if !isMobileAndEmpty && !isAddingProfile}
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
                    <Select
                        id="profileSelect"
                        bind:value={selectedProfile}
                        options={visibleProfiles}
                    />
                </div>
            {:else if authType === "manual"}
                <div
                    class="bg-blue-500/10 border border-blue-500/20 p-3 rounded text-xs text-blue-300 mb-4 leading-relaxed"
                >
                    <strong>API Keys:</strong> To get your Access Key ID and Secret Access Key, follow the <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html" target="_blank" class="underline hover:text-blue-200" rel="noopener noreferrer">official AWS guide</a>.
                </div>

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

                <div class="mt-2 mb-2 border-t border-gray-800 pt-3">
                    <label
                        for="mfaInputManual"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >MFA Serial ARN <span class="text-[10px] opacity-70"
                            >(Optional)</span
                        ></label
                    >
                    <input
                        id="mfaInputManual"
                        type="text"
                        bind:value={mfaSerial}
                        placeholder="arn:aws:iam::123456789012:mfa/user"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                    {#if mfaSerial && !/^(arn:aws[-a-z]*:iam::\d{12}:mfa\/[\w+=,.@-]+|[A-Za-z0-9]+)$/.test(mfaSerial)}
                        <span class="text-[10px] text-red-400 mt-1 block">Expected ARN format or hardware serial</span>
                    {/if}
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
                <div
                    class="bg-blue-500/10 border border-blue-500/20 p-3 rounded text-xs text-blue-300 mb-4 leading-relaxed"
                >
                    <strong>Assume Role:</strong> You need an IAM Role with a Trust Policy that allows your Source Profile to switch to it. See <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_permissions-to-switch.html" target="_blank" class="underline hover:text-blue-200" rel="noopener noreferrer">AWS documentation</a>.
                </div>

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
                    <Select
                        id="sourceProfileInput"
                        bind:value={sourceProfile}
                        options={visibleProfiles}
                    />
                </div>
                <div class="mt-2 mb-2 border-t border-gray-800 pt-3">
                    <label
                        for="mfaInputAssume"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >MFA Serial ARN <span class="text-[10px] opacity-70"
                            >(Optional)</span
                        ></label
                    >
                    <input
                        id="mfaInputAssume"
                        type="text"
                        bind:value={mfaSerial}
                        placeholder="arn:aws:iam::123456789012:mfa/user"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                    {#if mfaSerial && !/^(arn:aws[-a-z]*:iam::\d{12}:mfa\/[\w+=,.@-]+|[A-Za-z0-9]+)$/.test(mfaSerial)}
                        <span class="text-[10px] text-red-400 mt-1 block">Expected ARN format or hardware serial</span>
                    {/if}
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
                <div class="space-y-4">
                    {#if !_cameraActive}
                        <div class="flex flex-col gap-3 py-4">
                            <button
                                onclick={() => (_cameraActive = true)}
                                class="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded font-bold text-sm shadow-lg transition flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                                Launch QR Scanner
                            </button>
                        </div>
                    {:else}
                        <div class="flex flex-col items-center py-2">
                            <QRScanner 
                                onSuccess={(text) => onScanSuccess(text, null)}
                                onError={onScanFailure}
                            />
                            
                            <button
                                onclick={() => {
                                    _cameraActive = false;
                                }}
                                class="mt-6 text-red-400 hover:text-red-300 text-xs font-bold uppercase tracking-widest transition flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                Stop Scanner
                            </button>
                        </div>
                    {/if}
                </div>
            {/if}
            {#if authType !== 'qr'}
                <button
                    onclick={onLogin}
                    disabled={isConnectDisabled}
                    class="w-full {isConnectDisabled
                        ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'} p-2.5 rounded font-bold text-sm shadow-lg transition"
                >
                    {loading ? "Connecting..." : "Connect"}
                </button>
            {/if}

            <div class="mt-4 pt-4 border-t border-gray-800 text-center">
                <a href="https://portal.aws.amazon.com/gp/aws/developer/registration/index.html" target="_blank" class="text-[10px] text-gray-500 hover:text-blue-400 underline transition uppercase tracking-widest font-bold" rel="noopener noreferrer">
                    Don't have an AWS account? Create one here
                </a>
            </div>
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


