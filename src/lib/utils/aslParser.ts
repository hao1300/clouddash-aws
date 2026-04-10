import dagre from 'dagre';

export interface NodeData {
    label: string;
    type: string;
    status: 'SUCCEEDED' | 'FAILED' | 'RUNNING' | 'PENDING' | 'CAUGHT';
    [key: string]: any;
}

export function parseASL(definition: string) {
    let asl;
    try {
        asl = JSON.parse(definition);
    } catch {
        return { nodes: [], edges: [] };
    }

    const nodes: any[] = [];
    const edges: any[] = [];

    // Helper to traverse
    function traverse(states: any, parentId?: string) {
        if (!states) return;
        
        for (const [stateName, stateDef] of Object.entries(states)) {
            const nodeId = parentId ? `${parentId}.${stateName}` : stateName;
            
            nodes.push({
                id: nodeId,
                type: 'stepNode',
                data: {
                    label: stateName,
                    type: (stateDef as any).Type,
                    status: 'PENDING',
                    raw: stateDef
                },
                position: { x: 0, y: 0 }
            });

            // Handle Next
            if ((stateDef as any).Next) {
                const targetId = parentId ? `${parentId}.${(stateDef as any).Next}` : (stateDef as any).Next;
                edges.push({
                    id: `e-${nodeId}-${targetId}`,
                    source: nodeId,
                    target: targetId,
                    type: 'smoothstep'
                });
            }

            // Handle Choices
            if ((stateDef as any).Type === 'Choice' && (stateDef as any).Choices) {
                for (const choice of (stateDef as any).Choices) {
                    if (choice.Next) {
                        const targetId = parentId ? `${parentId}.${choice.Next}` : choice.Next;
                        edges.push({
                            id: `e-${nodeId}-${targetId}`,
                            source: nodeId,
                            target: targetId,
                            type: 'smoothstep',
                            label: 'Choice'
                        });
                    }
                }
            }

            if ((stateDef as any).Type === 'Choice' && (stateDef as any).Default) {
                const targetId = parentId ? `${parentId}.${(stateDef as any).Default}` : (stateDef as any).Default;
                edges.push({
                    id: `e-${nodeId}-${targetId}-default`,
                    source: nodeId,
                    target: targetId,
                    type: 'smoothstep',
                    label: 'Default'
                });
            }

            if ((stateDef as any).Catch) {
                for (const catchBlock of (stateDef as any).Catch) {
                    if (catchBlock.Next) {
                        const targetId = parentId ? `${parentId}.${catchBlock.Next}` : catchBlock.Next;
                        edges.push({
                            id: `e-${nodeId}-${targetId}-catch`,
                            source: nodeId,
                            target: targetId,
                            type: 'smoothstep',
                            label: 'Catch',
                            animated: true,
                            style: { stroke: '#ef4444' }
                        });
                    }
                }
            }

            if ((stateDef as any).Type === 'Parallel' && (stateDef as any).Branches) {
                (stateDef as any).Branches.forEach((branch: any, idx: number) => {
                    const branchName = `${stateName}.branch_${idx}`;
                    traverse(branch.States, branchName);
                    if (branch.StartAt) {
                        const targetId = `${branchName}.${branch.StartAt}`;
                        edges.push({
                            id: `e-${nodeId}-${targetId}`,
                            source: nodeId,
                            target: targetId,
                            type: 'smoothstep'
                        });
                    }
                });
            }

            if ((stateDef as any).Type === 'Map' && (stateDef as any).Iterator) {
                const mapName = `${stateName}.map`;
                traverse((stateDef as any).Iterator.States, mapName);
                if ((stateDef as any).Iterator.StartAt) {
                    const targetId = `${mapName}.${(stateDef as any).Iterator.StartAt}`;
                    edges.push({
                        id: `e-${nodeId}-${targetId}`,
                        source: nodeId,
                        target: targetId,
                        type: 'smoothstep'
                    });
                }
            }
            
            if ((stateDef as any).Type === 'Map' && (stateDef as any).ItemProcessor) {
                const mapName = `${stateName}.map`;
                traverse((stateDef as any).ItemProcessor.States, mapName);
                if ((stateDef as any).ItemProcessor.StartAt) {
                    const targetId = `${mapName}.${(stateDef as any).ItemProcessor.StartAt}`;
                    edges.push({
                        id: `e-${nodeId}-${targetId}`,
                        source: nodeId,
                        target: targetId,
                        type: 'smoothstep'
                    });
                }
            }
        }
    }

    if (asl.States) {
        traverse(asl.States);
    }
    
    return { nodes, edges };
}

export function layoutElements(nodes: any[], edges: any[], direction = 'TB') {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Width and height of standard step node
    const nodeWidth = 200;
    const nodeHeight = 50;

    dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 50 });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = direction === 'TB' ? 'top' : 'left';
        node.sourcePosition = direction === 'TB' ? 'bottom' : 'right';

        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };
    });

    return { nodes, edges };
}
