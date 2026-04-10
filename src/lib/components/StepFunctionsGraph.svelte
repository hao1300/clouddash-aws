<script lang="ts">
    import { SvelteFlow, Controls, Background, BackgroundVariant, type Edge, type Node } from '@xyflow/svelte';
    import StepNode from './StepNode.svelte';
    import { parseASL, layoutElements, type NodeData } from '../utils/aslParser';
    import { parseHistoryEvents, type StateExecutionDetails } from '../utils/sfnHistoryParser';
    import '@xyflow/svelte/dist/style.css';

    let {
        definition = '{}',
        historyEvents = [],
        onNodeSelect = (stateName: string, details: StateExecutionDetails | null, rawDef: any) => {}
    } = $props<{
        definition: string;
        historyEvents: any[];
        onNodeSelect: (stateName: string, details: StateExecutionDetails | null, rawDef: any) => void;
    }>();

    const nodeTypes = {
        stepNode: StepNode
    };

    let nodes = $state<Node[]>([]);
    let edges = $state<Edge[]>([]);

    $effect(() => {
        const parsed = parseASL(definition);
        const laidOut = layoutElements(parsed.nodes, parsed.edges);
        
        const detailsMap = parseHistoryEvents(historyEvents || []);

        const updatedNodes = laidOut.nodes.map(n => {
            const stateName = n.data.label;
            const det = detailsMap[stateName];
            if (det) {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        status: det.status,
                    }
                };
            }
            return n;
        });

        nodes = updatedNodes;
        edges = laidOut.edges;
    });

    function handleNodeClick(eventOrObj: any, maybeNode?: Node) {
        let event, node;
        if (maybeNode) {
            event = eventOrObj;
            node = maybeNode;
        } else {
            event = eventOrObj.event;
            node = eventOrObj.node;
        }

        if (!node) return;

        const stateName = node.data.label as string;
        const rawDef = node.data.raw;
        const detailsMap = parseHistoryEvents(historyEvents || []);
        onNodeSelect(stateName, detailsMap[stateName] || null, rawDef);
    }
</script>

<div class="h-full w-full bg-black rounded-lg overflow-hidden border border-gray-800">
    <SvelteFlow
        {nodes}
        {edges}
        {nodeTypes}
        fitView
        onnodeclick={handleNodeClick}
        on:nodeclick={(e) => handleNodeClick(e.detail)}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        minZoom={0.1}
    >
        <Controls />
        <Background variant={BackgroundVariant.Dots} bgColor="#000" patternColor="#333" />
    </SvelteFlow>
</div>
