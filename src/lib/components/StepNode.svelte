<script lang="ts">
    import { Handle, Position, type NodeProps } from '@xyflow/svelte';
    import type { NodeData } from '../utils/aslParser';

    let { data, isConnectable }: NodeProps<NodeData> = $props();
    
    let statusClass = $derived.by(() => {
        switch (data.status) {
            case 'SUCCEEDED': return 'border-green-500 bg-green-500/10 text-green-400';
            case 'FAILED': return 'border-red-500 bg-red-500/10 text-red-400';
            case 'RUNNING': return 'border-blue-500 bg-blue-500/10 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]';
            case 'CAUGHT': return 'border-orange-500 bg-orange-500/10 text-orange-400';
            default: return 'border-gray-700 bg-gray-900 text-gray-400 opacity-60';
        }
    });

    let icon = $derived.by(() => {
        switch (data.status) {
            case 'SUCCEEDED': return '✅';
            case 'FAILED': return '❌';
            case 'RUNNING': return '🔄';
            case 'CAUGHT': return '⚠️';
            default: return '⚪';
        }
    });
</script>

<div class="relative min-w-[160px] max-w-[250px] rounded-lg border-2 p-3 shadow-md transition-all duration-200 cursor-pointer hover:shadow-lg hover:brightness-110 active:scale-95 {statusClass}">
    <Handle type="target" position={Position.Top} {isConnectable} class="w-3 h-3 bg-gray-500 border-none" />
    
    <div class="flex items-center gap-3">
        <span class="text-sm {data.status === 'RUNNING' ? 'animate-spin' : ''}">{icon}</span>
        <div class="flex flex-col overflow-hidden">
            <span class="text-[13px] font-bold truncate" title={data.label}>{data.label}</span>
            <span class="text-[10px] opacity-80 uppercase tracking-wider">{data.type}</span>
        </div>
    </div>
    
    <Handle type="source" position={Position.Bottom} {isConnectable} class="w-3 h-3 bg-gray-500 border-none" />
</div>
