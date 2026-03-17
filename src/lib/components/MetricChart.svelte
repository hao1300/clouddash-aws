<script lang="ts">
    interface DataPoint {
        rawTimestamp: Date;
        rawAverage: number;
    }

    let { 
        data = [], 
        width = 800, 
        height = 150, 
        padX = 40, 
        padY = 20,
        title = "",
        loading = false,
        formatValue = (v: number) => v.toLocaleString(),
        yLabel = ""
    }: {
        data: DataPoint[];
        width?: number;
        height?: number;
        padX?: number;
        padY?: number;
        title?: string;
        loading?: boolean;
        formatValue?: (v: number) => string;
        yLabel?: string;
    } = $props();

    let chartInfo = $derived.by(() => {
        if (!data || data.length < 2) return null;

        const chrono = [...data].sort((a, b) => a.rawTimestamp.getTime() - b.rawTimestamp.getTime());
        const ts = chrono.map((d) => d.rawTimestamp.getTime());
        const vals = chrono.map((d) => Number(d.rawAverage) || 0);

        const minT = Math.min(...ts);
        const maxT = Math.max(...ts);
        const minV = Math.min(0, ...vals);
        let maxV = Math.max(...vals);
        if (maxV === minV) maxV = minV + 1;

        const rangeT = maxT - minT || 1;
        const rangeV = maxV - minV || 1;

        const points = chrono.map((_, i) => {
            const x = padX + ((ts[i] - minT) / rangeT) * (width - 2 * padX);
            const y = height - padY - ((vals[i] - minV) / rangeV) * (height - 2 * padY);
            return { x, y };
        });

        const path = `M ${points.map((p) => `${p.x},${p.y}`).join(" L ")}`;

        return { path, points, minT, maxT, minV, maxV };
    });
</script>

<div class="flex flex-col gap-2">
    {#if title}
        <h4 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{title}</h4>
    {/if}
    
{#if loading}
        <div class="h-40 flex items-center justify-center text-gray-400 text-xs animate-pulse bg-gray-950/20 rounded border border-gray-800/50">
            <span class="animate-spin mr-2">⟳</span> Loading metrics...
        </div>
    {:else if !data || data.length === 0}
        <div class="h-40 flex items-center justify-center text-gray-600 text-xs italic bg-gray-950/20 rounded border border-gray-800/50">
            No data available
        </div>
    {:else if data.length < 2}
        <div class="h-40 flex items-center justify-center text-gray-600 text-xs italic bg-gray-950/20 rounded border border-gray-800/50">
            Insufficient data points for visualization
        </div>
    {:else if chartInfo}
        <div class="relative w-full bg-gray-950 rounded-lg border border-gray-800/80 p-4 shadow-inner flex flex-col gap-1">
            <div class="flex justify-between items-end px-10 text-[11px] text-gray-300 font-mono">
                <span class="bg-gray-900/50 px-1 rounded font-bold">{formatValue(chartInfo.maxV)}</span>
                <span class="text-[10px] uppercase tracking-tighter text-gray-500 font-bold">Value</span>
            </div>
            
            <div class="relative">
                <svg viewBox="0 0 {width} {height}" class="w-full h-auto max-h-[180px]">
                    <!-- Grid lines -->
                    <line x1={padX} y1={padY} x2={width-padX} y2={padY} stroke="#1F2937" stroke-width="1" stroke-dasharray="4" />
                    <line x1={padX} y1={height-padY} x2={width-padX} y2={height-padY} stroke="#374151" stroke-width="1" />
                    
                    <path d={chartInfo.path} fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    {#each chartInfo.points as p}
                        <circle cx={p.x} cy={p.y} r="2.5" fill="#60A5FA" />
                    {/each}
                </svg>
            </div>

            <div class="flex justify-between px-10 text-[11px] text-gray-300 font-mono">
                <div class="flex flex-col items-start translate-x-[-20%]">
                    <span class="font-bold">{new Date(chartInfo.minT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span class="text-[10px] text-gray-400">{new Date(chartInfo.minT).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                </div>
                <div class="flex flex-col items-end translate-x-[20%]">
                    <span class="font-bold">{new Date(chartInfo.maxT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span class="text-[10px] text-gray-400">{new Date(chartInfo.maxT).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                </div>
            </div>
        </div>
    {/if}
</div>
