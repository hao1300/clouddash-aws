import { describe, expect, it } from "vitest";
import { sortItemsByKey } from "./table-sort";

describe("sortItemsByKey", () => {
    it("sorts numeric values in descending order", () => {
        const items = [
            { name: "one", count: 1 },
            { name: "ten", count: 10 },
            { name: "nine", count: 9 },
        ];

        expect(sortItemsByKey(items, "count", false).map((item) => item.name))
            .toEqual(["ten", "nine", "one"]);
    });

    it("does not mutate the source array", () => {
        const items = [{ count: 1 }, { count: 2 }];

        sortItemsByKey(items, "count", false);

        expect(items).toEqual([{ count: 1 }, { count: 2 }]);
    });
});
