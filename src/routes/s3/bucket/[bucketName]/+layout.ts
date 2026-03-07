export function load({ params, url }) {
    const bucketName = params.bucketName;
    const prefix = url.searchParams.get('prefix') || "";

    return {
        tabs: [
            { id: "buckets", label: "Buckets" },
            { id: `bucket/${bucketName}${prefix ? '?prefix=' + encodeURIComponent(prefix) : ''}`, label: "Objects" }
        ],
        activeTab: `bucket/${bucketName}`,
        bucketName,
        prefix
    };
}
