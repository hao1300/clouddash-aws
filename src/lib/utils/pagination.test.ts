import { describe, it, expect } from "vitest";
import { formatBytes, pushToken } from "./pagination";

describe("formatBytes", () => {
    it("formats whole units", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(1024)).toBe("1 KB");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(1024 ** 3)).toBe("1 GB");
    });

    // Regression: this is also used as a Chart.js axis-tick formatter, which
    // passes fractional values. Math.floor(log(0.2)/log(1024)) is -1, which
    // indexed off the front of the unit array and produced "204.8 undefined".
    it("does not index past the start of the unit array for fractional values", () => {
        for (const v of [0.2, 0.4, 0.6, 0.99]) {
            const out = formatBytes(v);
            expect(out).not.toContain("undefined");
            expect(out).toMatch(/ B$/);
        }
    });

    it("clamps absurdly large values to the last known unit", () => {
        const out = formatBytes(1024 ** 12);
        expect(out).not.toContain("undefined");
        expect(out).toMatch(/ YB$/);
    });
});

describe("pushToken", () => {
    it("ignores an undefined token", () => {
        const h: string[] = [];
        pushToken(h, undefined);
        expect(h).toEqual([]);
    });

    it("appends a new token", () => {
        const h: string[] = [];
        pushToken(h, "a");
        pushToken(h, "b");
        expect(h).toEqual(["a", "b"]);
    });

    it("does not append the same token twice in a row", () => {
        const h: string[] = ["a"];
        pushToken(h, "a");
        expect(h).toEqual(["a"]);
    });
});
