export function load({ url }) {
    const stackName = url.searchParams.get("stack") || "";
    return {
        tabs: [
            { id: "", label: "Stacks" },
            ...(stackName ? [{ id: "details", label: "Details" }] : []),
            { id: "exports", label: "Exports" },
            { id: "stack-sets", label: "StackSets" },
        ]
    };
}
