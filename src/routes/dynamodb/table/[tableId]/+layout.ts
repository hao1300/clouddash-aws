export function load({ params, url }) {
    const tableId = params.tableId;
    let activeTab = `table/${tableId}`;
    if (url.pathname.endsWith('/explore')) {
        activeTab = `table/${tableId}/explore`;
    }

    return {
        tabs: [
            { id: "tables", label: "Tables" },
            { id: `table/${tableId}`, label: "Details" },
            { id: `table/${tableId}/explore`, label: "Explore Items" }
        ],
        activeTab,
        tableId
    };
}
