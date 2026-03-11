<script lang="ts">
    import {
        GetFunctionConfigurationCommand,
        InvokeCommand,
        UpdateFunctionConfigurationCommand,
        DeleteFunctionCommand,
        type FunctionConfiguration,
    } from "@aws-sdk/client-lambda";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { titleService } from "$lib/services/title.svelte";

    let fnName = $derived($page.url.searchParams.get("id") || "");

    $effect(() => {
        titleService.setResource(fnName, undefined, $page.url.pathname);
    });

    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");
    let fnDetails = $state<FunctionConfiguration | null>(null);
    let detailTab = $state<"invoke" | "configuration">("invoke");

    // Invoke state
    let invokeInput = $state("{}");
    let invokeResult = $state<any>(null);
    let invokeLoading = $state(false);

    // Config state
    let isEditingConfig = $state(false);
    let editMemory = $state(128);
    let editTimeout = $state(3);
    let editHandler = $state("");
    let configLoading = $state(false);

    // Env state
    let isEditingEnv = $state(false);
    let editEnvVars = $state<{ key: string; value: string }[]>([]);
    let envLoading = $state(false);

    $effect(() => {
        if (aws.lambda && fnName) {
            loadDetails();
        }
    });

    async function loadDetails() {
        if (!aws.lambda || !fnName) return;
        try {
            loading = true;
            const res = await aws.lambda.send(
                new GetFunctionConfigurationCommand({ FunctionName: fnName }),
            );
            fnDetails = res;
            editMemory = res.MemorySize || 128;
            editTimeout = res.Timeout || 3;
            editHandler = res.Handler || "";
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleInvoke() {
        if (!aws.lambda || !fnName) return;
        try {
            invokeLoading = true;
            invokeResult = null;
            const res = await aws.lambda.send(
                new InvokeCommand({
                    FunctionName: fnName,
                    Payload: new TextEncoder().encode(invokeInput),
                }),
            );
            const payload = res.Payload
                ? new TextDecoder().decode(res.Payload)
                : "";
            invokeResult = {
                statusCode: res.StatusCode,
                payload,
                error: res.FunctionError,
            };
        } catch (e: any) {
            invokeResult = { error: e.message || String(e) };
        } finally {
            invokeLoading = false;
        }
    }

    async function handleSaveConfig() {
        if (!aws.lambda || !fnName) return;
        try {
            configLoading = true;
            const res = await aws.lambda.send(
                new UpdateFunctionConfigurationCommand({
                    FunctionName: fnName,
                    MemorySize: editMemory,
                    Timeout: editTimeout,
                    Handler: editHandler,
                }),
            );
            fnDetails = res;
            isEditingConfig = false;
            actionMsg = "Configuration updated.";
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            configLoading = false;
        }
    }

    async function handleSaveEnv() {
        if (!aws.lambda || !fnName) return;
        try {
            envLoading = true;
            const variables: Record<string, string> = {};
            editEnvVars.forEach((v) => {
                if (v.key.trim()) variables[v.key.trim()] = v.value;
            });
            const res = await aws.lambda.send(
                new UpdateFunctionConfigurationCommand({
                    FunctionName: fnName,
                    Environment: { Variables: variables },
                }),
            );
            fnDetails = res;
            isEditingEnv = false;
            actionMsg = "Environment variables updated.";
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            envLoading = false;
        }
    }

    async function handleDelete() {
        if (!aws.lambda || !fnName || !confirm("Delete this function?")) return;
        try {
            loading = true;
            await aws.lambda.send(
                new DeleteFunctionCommand({ FunctionName: fnName }),
            );
            goto("/lambda");
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-hidden relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}
    {#if actionMsg}<div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30"
        >
            {actionMsg}
        </div>{/if}

    <div
        class="px-6 py-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center shrink-0 {error ||
        actionMsg
            ? 'mt-8'
            : ''}"
    >
        <div class="flex items-center gap-3">
            <h2 class="text-sm font-bold text-gray-200">{fnName}</h2>
        </div>
        <button
            onclick={handleDelete}
            class="text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-1.5 rounded transition border border-red-500/30"
            >Delete</button
        >
    </div>

    <div class="px-6 border-b border-gray-800 bg-gray-900 shrink-0">
        <nav class="flex gap-4">
            <button
                onclick={() => (detailTab = "invoke")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'invoke'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Invoke</button
            >
            <button
                onclick={() => (detailTab = "configuration")}
                class="py-3 text-xs font-bold uppercase transition border-b-2 {detailTab ===
                'configuration'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400'}">Configuration</button
            >
        </nav>
    </div>

    <div class="flex-1 overflow-auto p-6 min-h-0 relative">
        {#if detailTab === "invoke"}
            <div class="max-w-3xl space-y-4">
                <div class="bg-gray-900 p-5 rounded-lg border border-gray-800">
                    <label
                        class="block text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-widest"
                        >Event JSON</label
                    >
                    <textarea
                        bind:value={invokeInput}
                        class="w-full h-48 bg-black border border-gray-700 rounded p-3 text-xs font-mono text-gray-300 outline-none focus:border-blue-500"
                    ></textarea>
                    <div class="mt-4 flex justify-end">
                        <button
                            onclick={handleInvoke}
                            disabled={invokeLoading}
                            class="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded text-xs font-bold transition shadow flex items-center gap-2"
                        >
                            {#if invokeLoading}<span class="animate-spin"
                                    >⟳</span
                                >{/if} Invoke
                        </button>
                    </div>
                </div>

                {#if invokeResult}
                    <div
                        class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-sm"
                    >
                        <div
                            class="bg-gray-800/50 px-4 py-2 border-b border-gray-700 flex justify-between items-center"
                        >
                            <span
                                class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
                                >Response</span
                            >
                            <div class="flex gap-2 text-[10px] font-bold">
                                <span
                                    class={invokeResult.statusCode >= 200 &&
                                    invokeResult.statusCode < 300
                                        ? "text-green-400"
                                        : "text-red-400"}
                                    >Status: {invokeResult.statusCode}</span
                                >
                                {#if invokeResult.error}<span
                                        class="text-red-400 underline decoration-red-400/30"
                                        >Error: {invokeResult.error}</span
                                    >{/if}
                            </div>
                        </div>
                        <div class="p-4 bg-black overflow-x-auto max-h-96">
                            <pre
                                class="text-xs text-green-400 font-mono whitespace-pre-wrap">{invokeResult.payload}</pre>
                        </div>
                    </div>
                {/if}
            </div>
        {:else}
            <div class="max-w-4xl space-y-6">
                <!-- General Config -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <div
                        class="flex justify-between items-center mb-4 border-b border-gray-800 pb-2"
                    >
                        <h3
                            class="text-xs font-bold text-gray-300 uppercase tracking-widest"
                        >
                            General Configuration
                        </h3>
                        {#if !isEditingConfig}
                            <button
                                onclick={() => (isEditingConfig = true)}
                                class="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded border border-gray-700"
                                >Edit</button
                            >
                        {/if}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label
                                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                                >Memory (MB)</label
                            >
                            {#if isEditingConfig}
                                <input
                                    type="number"
                                    bind:value={editMemory}
                                    class="w-full bg-black border border-gray-700 rounded p-1.5 text-xs text-white"
                                />
                            {:else}
                                <div class="text-sm text-gray-300">
                                    {fnDetails?.MemorySize} MB
                                </div>
                            {/if}
                        </div>
                        <div>
                            <label
                                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                                >Timeout (s)</label
                            >
                            {#if isEditingConfig}
                                <input
                                    type="number"
                                    bind:value={editTimeout}
                                    class="w-full bg-black border border-gray-700 rounded p-1.5 text-xs text-white"
                                />
                            {:else}
                                <div class="text-sm text-gray-300">
                                    {fnDetails?.Timeout} s
                                </div>
                            {/if}
                        </div>
                        <div class="md:col-span-2">
                            <label
                                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                                >Handler</label
                            >
                            {#if isEditingConfig}
                                <input
                                    type="text"
                                    bind:value={editHandler}
                                    class="w-full bg-black border border-gray-700 rounded p-1.5 text-xs font-mono text-white"
                                />
                            {:else}
                                <div class="text-sm text-gray-300 font-mono">
                                    {fnDetails?.Handler}
                                </div>
                            {/if}
                        </div>
                    </div>
                    {#if isEditingConfig}
                        <div class="mt-4 flex justify-end gap-2">
                            <button
                                onclick={() => (isEditingConfig = false)}
                                class="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5"
                                >Cancel</button
                            >
                            <button
                                onclick={handleSaveConfig}
                                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow"
                                >Save</button
                            >
                        </div>
                    {/if}
                </div>

                <!-- Env Vars -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <div
                        class="flex justify-between items-center mb-4 border-b border-gray-800 pb-2"
                    >
                        <h3
                            class="text-xs font-bold text-gray-300 uppercase tracking-widest"
                        >
                            Environment Variables
                        </h3>
                        {#if !isEditingEnv}
                            <button
                                onclick={() => {
                                    editEnvVars = Object.entries(
                                        fnDetails?.Environment?.Variables || {},
                                    ).map(([key, value]) => ({ key, value }));
                                    isEditingEnv = true;
                                }}
                                class="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded border border-gray-700"
                                >Edit</button
                            >
                        {/if}
                    </div>
                    {#if isEditingEnv}
                        <div class="space-y-2">
                            {#each editEnvVars as ev, i}
                                <div class="flex gap-2">
                                    <input
                                        bind:value={ev.key}
                                        placeholder="Key"
                                        class="flex-1 bg-black border border-gray-700 rounded p-1.5 text-xs font-mono text-white"
                                    />
                                    <input
                                        bind:value={ev.value}
                                        placeholder="Value"
                                        class="flex-[2] bg-black border border-gray-700 rounded p-1.5 text-xs font-mono text-white"
                                    />
                                    <button
                                        onclick={() => editEnvVars.splice(i, 1)}
                                        class="text-gray-500 hover:text-red-400"
                                        >✕</button
                                    >
                                </div>
                            {/each}
                            <button
                                onclick={() =>
                                    editEnvVars.push({ key: "", value: "" })}
                                class="text-[10px] text-blue-400 font-bold uppercase"
                                >+ Add Variable</button
                            >
                            <div class="mt-4 flex justify-end gap-2">
                                <button
                                    onclick={() => (isEditingEnv = false)}
                                    class="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5"
                                    >Cancel</button
                                >
                                <button
                                    onclick={handleSaveEnv}
                                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-bold transition shadow"
                                    >Save</button
                                >
                            </div>
                        </div>
                    {:else}
                        <div class="space-y-1">
                            {#each Object.entries(fnDetails?.Environment?.Variables || {}) as [k, v]}
                                <div
                                    class="flex border-b border-gray-800/30 py-1 font-mono text-xs"
                                >
                                    <span
                                        class="w-1/3 text-gray-500 truncate pr-2"
                                        >{k}</span
                                    >
                                    <span class="w-2/3 text-green-400 break-all"
                                        >{v}</span
                                    >
                                </div>
                            {:else}
                                <div class="text-xs text-gray-600 italic">
                                    No environment variables.
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>
