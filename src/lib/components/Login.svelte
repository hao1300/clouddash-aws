<script lang="ts">
    import { Html5QrcodeScanner } from "html5-qrcode";
    import { invoke } from "@tauri-apps/api/core";

    let {
        os = "",
        authType = $bindable("profile"),
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
        authType: "profile" | "manual" | "qr";
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
        onSwitchAuthType: (type: "profile" | "manual" | "qr") => void;
        onProfilesSaved?: () => void;
    } = $props();

    let scanner: Html5QrcodeScanner | null = null;
    let scannerNode: HTMLElement | null = $state(null);

    $effect(() => {
        if (authType === "qr" && scannerNode && !scanner) {
            scanner = new Html5QrcodeScanner(
                "qr-reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
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

    function onScanSuccess(decodedText: string, decodedResult: any) {
        try {
            const data = JSON.parse(decodedText);
            if (Array.isArray(data)) {
                Promise.all(
                    data.map(async (p: any) => {
                        if (Object.keys(p).length > 1) {
                            try {
                                await invoke("save_profile", {
                                    name: p.profile || "default",
                                    properties: p,
                                });
                            } catch (e) {
                                console.error(e);
                            }
                        }
                    })
                ).then(() => {
                    const first = data.find((p: any) => Object.keys(p).length > 1) || {};
                    if (first.profile) selectedProfile = first.profile;
                    if (onProfilesSaved) onProfilesSaved();
                    onSwitchAuthType("profile");
                    if (scanner) {
                        scanner.clear().catch(console.error);
                        scanner = null;
                    }
                });
            } else if (data.aws_access_key_id || data.access_key_id) {
                accessKeyId = data.aws_access_key_id || data.access_key_id;
                secretAccessKey = data.aws_secret_access_key || data.secret_access_key;
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
            return (
                !accessKeyId.trim() ||
                !secretAccessKey.trim() ||
                !saveProfileName.trim()
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
        (visibleProfiles.length === 0 || visibleProfiles[0] === "default")
    );
</script>

<div class="flex items-center justify-center flex-1 p-4">
    <div
        class="w-full max-w-sm bg-gray-900 p-6 rounded-xl shadow-2xl border border-gray-800"
    >
        <h1 class="text-xl font-bold mb-4 text-blue-400">CloudDash for AWS</h1>
        {#if error}
            <div class="bg-red-500/20 text-red-300 p-2 rounded mb-3 text-xs">
                {error}
            </div>
        {/if}
        <div class="space-y-3">
            <div>
                <div
                    class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                >
                    Login Method
                </div>
                <div class="flex gap-2" role="group" aria-label="Login Method">
                    {#if !isMobileAndEmpty}
                        <button
                            onclick={() => onSwitchAuthType("profile")}
                            class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                            'profile'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
                            >Profile</button
                        >
                    {/if}
                    <button
                        onclick={() => onSwitchAuthType("manual")}
                        class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                        'manual'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
                        >API Keys</button
                    >
                    <button
                        onclick={() => onSwitchAuthType("qr")}
                        class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                        'qr'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
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
                        placeholder="AKIAIOSFODNN7EXAMPLE"
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
                        placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
                <div class="mt-2">
                    <label
                        for="profileNameInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Profile Name</label
                    >
                    <input
                        id="profileNameInput"
                        type="text"
                        bind:value={saveProfileName}
                        placeholder="e.g. prod-admin"
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
                        placeholder="IQoJb3JpZ2luX2VjEBs..."
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono resize-none"
                    ></textarea>
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
