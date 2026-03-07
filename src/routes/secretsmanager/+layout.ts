export function load({ url }) {
    const secretId = url.searchParams.get("id") || "";
    return {
        tabs: [
            { id: "secrets", label: "Secrets" },
            ...(secretId ? [{ id: "details", label: "Details" }] : []),
        ]
    };
}
