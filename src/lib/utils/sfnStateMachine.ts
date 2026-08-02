interface StateMachineSummary {
    name?: string;
    stateMachineArn?: string;
}

interface StateMachinePage {
    stateMachines?: readonly StateMachineSummary[];
    nextToken?: string;
}

export function getStateMachineName(identifier: string): string {
    const arnMarker = ":stateMachine:";
    const markerIndex = identifier.indexOf(arnMarker);
    if (markerIndex === -1) return identifier;

    return identifier
        .slice(markerIndex + arnMarker.length)
        .split(":")[0];
}

export function getStateMachineDetailsHref(identifier: string): string {
    return `/stepfunctions/details?name=${encodeURIComponent(
        getStateMachineName(identifier),
    )}`;
}

export async function resolveStateMachineArnByName(
    name: string,
    listPage: (nextToken?: string) => Promise<StateMachinePage>,
): Promise<string> {
    let nextToken: string | undefined;

    do {
        const page = await listPage(nextToken);
        const match = page.stateMachines?.find(
            (stateMachine) => stateMachine.name === name,
        );
        if (match?.stateMachineArn) return match.stateMachineArn;
        nextToken = page.nextToken;
    } while (nextToken);

    throw new Error(
        `State machine "${name}" was not found in the current account or region.`,
    );
}
