export function sortItemsByKey<T>(
    items: readonly T[],
    key: string,
    ascending: boolean,
): T[] {
    const result = [...items];

    result.sort((a, b) => {
        const valueA = (a as Record<string, unknown>)[key];
        const valueB = (b as Record<string, unknown>)[key];

        let comparison = 0;
        if (typeof valueA === "number" && typeof valueB === "number") {
            comparison = valueA - valueB;
        } else {
            comparison = String(valueA ?? "").localeCompare(
                String(valueB ?? ""),
            );
        }

        return ascending ? comparison : -comparison;
    });

    return result;
}
