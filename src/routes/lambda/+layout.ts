export function load({ url }) {
    const fnName = url.searchParams.get("name") || "";
    return {
        tabs: [
            { id: "functions", label: "Functions" },
            ...(fnName ? [{ id: "details", label: "Details" }] : []),
        ]
    };
}
