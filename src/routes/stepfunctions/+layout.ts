export function load({ url }) {
    const smArn = url.searchParams.get("arn") || "";
    const execArn = url.searchParams.get("exec") || "";
    return {
        tabs: [
            { id: "", label: "State Machines" },
            ...(smArn ? [{ id: "details", label: "Details" }] : []),
            ...(execArn ? [{ id: "execution", label: "Execution" }] : []),
        ]
    };
}
