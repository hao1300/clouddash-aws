export function load({ params, url }) {
    const queueName = params.queueName;
    const queueUrl = url.searchParams.get('url') || ""; // Still might need URL for API calls, or derive it.

    let activeTab = `queue/${queueName}`;
    if (url.pathname.endsWith('/config')) {
        activeTab = `queue/${queueName}/config`;
    }

    return {
        tabs: [
            { id: "queues", label: "Queues" },
            { id: `queue/${queueName}${queueUrl ? '?url=' + encodeURIComponent(queueUrl) : ''}`, label: "Messages" },
            { id: `queue/${queueName}/config${queueUrl ? '?url=' + encodeURIComponent(queueUrl) : ''}`, label: "Configure" }
        ],
        activeTab,
        queueName,
        queueUrl
    };
}
