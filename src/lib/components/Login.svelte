<script lang="ts">
    let {
        authType = $bindable("profile"),
        selectedProfile = $bindable(""),
        accessKeyId = $bindable(""),
        secretAccessKey = $bindable(""),
        sessionToken = $bindable(""),
        saveProfileChecked = $bindable(false),
        saveProfileName = $bindable(""),
        ssoProfileName = $bindable(""),
        ssoStartUrl = $bindable(""),
        ssoRegion = $bindable(""),
        ssoAccountId = $bindable(""),
        ssoRoleName = $bindable(""),
        region = $bindable("us-east-1"),
        visibleProfiles = [],
        visibleRegions = [],
        loading = false,
        error = "",
        onLogin,
        onSwitchAuthType,
    }: {
        authType: "profile" | "manual" | "sso";
        selectedProfile: string;
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken: string;
        saveProfileChecked: boolean;
        saveProfileName: string;
        ssoProfileName: string;
        ssoStartUrl: string;
        ssoRegion: string;
        ssoAccountId: string;
        ssoRoleName: string;
        region: string;
        visibleProfiles: string[];
        visibleRegions: string[];
        loading: boolean;
        error: string;
        onLogin: () => void;
        onSwitchAuthType: (type: "profile" | "manual" | "sso") => void;
    } = $props();
</script>

<div class="flex items-center justify-center flex-1 p-4">
    <div
        class="w-full max-w-sm bg-gray-900 p-6 rounded-xl shadow-2xl border border-gray-800"
    >
        <h1 class="text-xl font-bold mb-4 text-blue-400">AWS Console</h1>
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
                    <button
                        onclick={() => onSwitchAuthType("profile")}
                        class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                        'profile'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
                        >Profile</button
                    >
                    <button
                        onclick={() => onSwitchAuthType("manual")}
                        class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                        'manual'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
                        >API Keys</button
                    >
                    <button
                        onclick={() => onSwitchAuthType("sso")}
                        class="flex-1 py-1.5 rounded text-xs font-semibold transition {authType ===
                        'sso'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'}"
                        >AWS SSO</button
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
                <div>
                    <label
                        class="flex items-center gap-2 cursor-pointer mt-2 mb-1"
                    >
                        <input
                            type="checkbox"
                            bind:checked={saveProfileChecked}
                            class="accent-blue-500 rounded bg-gray-900 border-gray-700"
                        />
                        <span class="text-xs text-gray-300"
                            >Save as Profile in ~/.aws</span
                        >
                    </label>
                    {#if saveProfileChecked}
                        <input
                            type="text"
                            bind:value={saveProfileName}
                            placeholder="Profile name (e.g. prod-admin)"
                            class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                        />
                    {/if}
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
            {:else if authType === "sso"}
                <div
                    class="bg-blue-500/10 border border-blue-500/20 p-3 rounded text-xs text-blue-300 mb-4 leading-relaxed"
                >
                    <strong>SSO Web Login:</strong> This will create an AWS SSO
                    profile in your <code>~/.aws/config</code> and execute
                    <code>aws sso login</code>, which securely opens your web
                    browser to authenticate.
                </div>
                <div>
                    <label
                        for="ssoProfileInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Profile Name</label
                    >
                    <input
                        id="ssoProfileInput"
                        type="text"
                        bind:value={ssoProfileName}
                        placeholder="my-sso-admin"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
                <div>
                    <label
                        for="ssoUrlInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Start URL</label
                    >
                    <input
                        id="ssoUrlInput"
                        type="text"
                        bind:value={ssoStartUrl}
                        placeholder="https://d-12345.awsapps.com/start"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
                <div class="flex flex-col sm:flex-row gap-2">
                    <div class="flex-1">
                        <label
                            for="ssoRegInput"
                            class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                            >SSO Region</label
                        >
                        <input
                            id="ssoRegInput"
                            type="text"
                            bind:value={ssoRegion}
                            placeholder="us-east-1"
                            class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                        />
                    </div>
                    <div class="flex-1">
                        <label
                            for="ssoAccInput"
                            class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                            >Account ID</label
                        >
                        <input
                            id="ssoAccInput"
                            type="text"
                            bind:value={ssoAccountId}
                            placeholder="123456789012"
                            class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                        />
                    </div>
                </div>
                <div>
                    <label
                        for="ssoRoleInput"
                        class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                        >Role Name</label
                    >
                    <input
                        id="ssoRoleInput"
                        type="text"
                        bind:value={ssoRoleName}
                        placeholder="AdministratorAccess"
                        class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500 placeholder-gray-600 font-mono"
                    />
                </div>
            {/if}
            <div>
                <label
                    for="regionSelect"
                    class="block text-xs text-gray-500 mb-1 uppercase tracking-wider"
                    >Region</label
                >
                <select
                    id="regionSelect"
                    bind:value={region}
                    class="w-full bg-gray-800 p-2 rounded text-sm text-white outline-none border border-gray-700 focus:border-blue-500"
                >
                    {#each visibleRegions as r}<option value={r}>{r}</option
                        >{/each}
                </select>
            </div>
            <button
                onclick={onLogin}
                class="w-full bg-blue-600 hover:bg-blue-500 p-2.5 rounded font-bold text-sm shadow-lg transition"
            >
                {loading ? "Connecting..." : "Connect"}
            </button>
        </div>
    </div>
</div>
