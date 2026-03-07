export function load({ url }) {
    const instanceId = url.searchParams.get("id") || "";
    return {
        tabs: [
            { id: "", label: "Instances" },
            ...(instanceId ? [{ id: "details", label: "Details" }] : []),
            { id: "amis", label: "AMIs" },
            { id: "volumes", label: "Volumes" },
            { id: "snapshots", label: "Snapshots" },
            { id: "security-groups", label: "Security Groups" },
            { id: "key-pairs", label: "Key Pairs" },
            { id: "elastic-ips", label: "Elastic IPs" },
        ]
    };
}
