export function load({ url }) {
    const secretId = url.searchParams.get("id") || "";
    return {
        tabs: [
            { id: "", label: "Secrets" },
            ...(secretId ? [{ id: "details", label: "Details" }] : []),
        ]
    };
}
