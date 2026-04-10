<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

    let {
        onSuccess,
        onError = () => {},
    }: {
        onSuccess: (text: string) => void;
        onError?: (error: any) => void;
    } = $props();

    let scanner: Html5Qrcode | null = null;
    let scannerElement: HTMLElement;
    let isStarted = $state(false);
    let errorMsg = $state("");

    onMount(async () => {
        scanner = new Html5Qrcode("qr-reader", {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            verbose: false,
        });

        try {
            await scanner.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                },
                (decodedText) => {
                    onSuccess(decodedText);
                },
                (errorMessage) => {
                    // Constant failures are normal while searching for QR
                    onError(errorMessage);
                }
            );
            isStarted = true;
        } catch (err: any) {
            console.error("Failed to start scanner:", err);
            errorMsg = "Could not access camera. Please ensure permissions are granted.";
            if (err.toString().includes("Permission")) {
                errorMsg = "Camera permission denied. Please allow camera access in your browser/app settings.";
            }
        }
    });

    onDestroy(async () => {
        if (scanner && isStarted) {
            try {
                await scanner.stop();
            } catch (err) {
                console.error("Failed to stop scanner:", err);
            }
        }
    });
</script>

<div class="relative w-full aspect-square overflow-hidden rounded-lg bg-black border border-gray-800 shadow-inner group">
    <div id="qr-reader" class="w-full h-full" bind:this={scannerElement}></div>
    
    {#if !isStarted && !errorMsg}
        <div class="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
            <div class="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3"></div>
            <span class="text-xs text-gray-400 font-medium">Initializing Camera...</span>
        </div>
    {/if}

    {#if errorMsg}
        <div class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gray-900">
            <svg class="w-12 h-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span class="text-sm text-red-400 font-medium">{errorMsg}</span>
        </div>
    {/if}

    {#if isStarted}
        <!-- Decorative Scan Overlay -->
        <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div class="relative w-[250px] h-[250px]">
                <!-- Corners -->
                <div class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                <div class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                <div class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                <div class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
                
                <!-- Scanning Line -->
                <div class="absolute top-0 left-0 w-full h-0.5 bg-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-scan"></div>
            </div>
        </div>
        <div class="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
            <span class="text-[10px] text-white/50 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm uppercase tracking-widest font-bold">Align QR Code within frame</span>
        </div>
    {/if}
</div>

<style>
    :global(#qr-reader video) {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
    }

    @keyframes scan {
        0%, 100% { top: 10%; }
        50% { top: 90%; }
    }

    .animate-scan {
        animation: scan 2s ease-in-out infinite;
    }
</style>
