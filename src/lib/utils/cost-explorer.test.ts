import { describe, expect, it } from "vitest";
import type { ResultByTime } from "@aws-sdk/client-cost-explorer";
import {
    addCostDays,
    buildCostBreakdown,
    collapseToTopSeries,
    formatCostAmount,
    formatPeriodLabel,
    mergeCostPages,
    percentOfTotal,
    resolveCostRange,
    toCostDate,
} from "./cost-explorer";

const NOW = new Date("2026-03-12T09:30:00Z");

describe("resolveCostRange", () => {
    it("ends ranges that include today on tomorrow, so today is covered", () => {
        expect(resolveCostRange("7d", NOW)).toEqual({
            start: "2026-03-06",
            end: "2026-03-13",
        });
        expect(resolveCostRange("30d", NOW)).toEqual({
            start: "2026-02-11",
            end: "2026-03-13",
        });
    });

    it("anchors month ranges to the first of the month", () => {
        expect(resolveCostRange("mtd", NOW)).toEqual({
            start: "2026-03-01",
            end: "2026-03-13",
        });
        expect(resolveCostRange("lastmonth", NOW)).toEqual({
            start: "2026-02-01",
            end: "2026-03-01",
        });
        expect(resolveCostRange("3m", NOW)).toEqual({
            start: "2026-01-01",
            end: "2026-03-13",
        });
        expect(resolveCostRange("12m", NOW)).toEqual({
            start: "2025-04-01",
            end: "2026-03-13",
        });
    });

    it("rolls into the next month on the last day of a month", () => {
        expect(resolveCostRange("mtd", new Date("2026-01-31T23:00:00Z"))).toEqual({
            start: "2026-01-01",
            end: "2026-02-01",
        });
    });

    it("falls back to the last 30 days for unknown presets", () => {
        expect(resolveCostRange("custom", NOW)).toEqual({
            start: "2026-02-11",
            end: "2026-03-13",
        });
    });
});

describe("date helpers", () => {
    it("shifts days across month boundaries in UTC", () => {
        expect(addCostDays("2026-03-01", -1)).toBe("2026-02-28");
        expect(addCostDays("2024-02-28", 1)).toBe("2024-02-29");
        expect(toCostDate(NOW)).toBe("2026-03-12");
    });

    it("labels buckets by granularity", () => {
        expect(formatPeriodLabel("2026-03-04", "DAILY", "en-US")).toBe("Mar 4");
        expect(formatPeriodLabel("2026-03-01", "MONTHLY", "en-US")).toBe(
            "Mar 2026",
        );
    });
});

describe("buildCostBreakdown", () => {
    const grouped: ResultByTime[] = [
        {
            TimePeriod: { Start: "2026-03-01", End: "2026-03-02" },
            Total: {},
            Groups: [
                {
                    Keys: ["Amazon Simple Storage Service"],
                    Metrics: { UnblendedCost: { Amount: "3.5", Unit: "USD" } },
                },
                {
                    Keys: ["AWS Lambda"],
                    Metrics: { UnblendedCost: { Amount: "1.25", Unit: "USD" } },
                },
            ],
            Estimated: false,
        },
        {
            TimePeriod: { Start: "2026-03-02", End: "2026-03-03" },
            Total: {},
            Groups: [
                {
                    Keys: ["AWS Lambda"],
                    Metrics: { UnblendedCost: { Amount: "4", Unit: "USD" } },
                },
            ],
            Estimated: true,
        },
    ];

    it("pivots groups into series aligned with every period", () => {
        const breakdown = buildCostBreakdown(
            grouped,
            "UnblendedCost",
            "DAILY",
            "en-US",
        );

        expect(breakdown.periods).toEqual([
            {
                start: "2026-03-01",
                end: "2026-03-02",
                label: "Mar 1",
                estimated: false,
            },
            {
                start: "2026-03-02",
                end: "2026-03-03",
                label: "Mar 2",
                estimated: true,
            },
        ]);
        expect(breakdown.series).toEqual([
            { key: "AWS Lambda", total: 5.25, values: [1.25, 4] },
            {
                key: "Amazon Simple Storage Service",
                total: 3.5,
                values: [3.5, 0],
            },
        ]);
        expect(breakdown.periodTotals).toEqual([4.75, 4]);
        expect(breakdown.total).toBe(8.75);
        expect(breakdown.unit).toBe("USD");
    });

    it("uses the period total when the query is not grouped", () => {
        const breakdown = buildCostBreakdown(
            [
                {
                    TimePeriod: { Start: "2026-03-01", End: "2026-04-01" },
                    Total: { AmortizedCost: { Amount: "12.5", Unit: "USD" } },
                    Groups: [],
                },
            ],
            "AmortizedCost",
            "MONTHLY",
            "en-US",
        );

        expect(breakdown.series).toEqual([
            { key: "Total", total: 12.5, values: [12.5] },
        ]);
        expect(breakdown.total).toBe(12.5);
    });

    it("names empty group keys and ignores unparseable amounts", () => {
        const breakdown = buildCostBreakdown(
            [
                {
                    TimePeriod: { Start: "2026-03-01", End: "2026-03-02" },
                    Groups: [
                        {
                            Keys: [""],
                            Metrics: { UnblendedCost: { Amount: "2", Unit: "USD" } },
                        },
                        {
                            Keys: ["AWS Lambda"],
                            Metrics: { UnblendedCost: { Amount: "", Unit: "USD" } },
                        },
                    ],
                },
            ],
            "UnblendedCost",
            "DAILY",
            "en-US",
        );

        expect(breakdown.series.map((s) => s.key)).toEqual([
            "No value",
            "AWS Lambda",
        ]);
        expect(breakdown.total).toBe(2);
    });

    it("skips the N/A unit reported for usage quantities", () => {
        const breakdown = buildCostBreakdown(
            [
                {
                    TimePeriod: { Start: "2026-03-01", End: "2026-03-02" },
                    Total: { UsageQuantity: { Amount: "10", Unit: "N/A" } },
                },
            ],
            "UsageQuantity",
            "DAILY",
            "en-US",
        );

        expect(breakdown.unit).toBe("");
    });
});

describe("mergeCostPages", () => {
    const firstPage: ResultByTime[] = [
        {
            TimePeriod: { Start: "2026-03-01", End: "2026-03-02" },
            Groups: [
                {
                    Keys: ["AWS Lambda"],
                    Metrics: { UnblendedCost: { Amount: "1", Unit: "USD" } },
                },
            ],
        },
    ];

    it("appends groups of an already-seen period instead of duplicating it", () => {
        const merged = mergeCostPages(firstPage, [
            {
                TimePeriod: { Start: "2026-03-01", End: "2026-03-02" },
                Groups: [
                    {
                        Keys: ["Amazon S3"],
                        Metrics: { UnblendedCost: { Amount: "2", Unit: "USD" } },
                    },
                ],
            },
            {
                TimePeriod: { Start: "2026-03-02", End: "2026-03-03" },
                Groups: [],
            },
        ]);

        expect(merged).toHaveLength(2);
        expect(merged[0].Groups?.map((g) => g.Keys?.[0])).toEqual([
            "AWS Lambda",
            "Amazon S3",
        ]);
        expect(firstPage[0].Groups).toHaveLength(1);
    });

    it("returns the collected pages when there is nothing to add", () => {
        expect(mergeCostPages(firstPage, undefined)).toBe(firstPage);
        expect(mergeCostPages(firstPage, [])).toBe(firstPage);
    });
});

describe("collapseToTopSeries", () => {
    const series = [
        { key: "a", total: 10, values: [6, 4] },
        { key: "b", total: 6, values: [2, 4] },
        { key: "c", total: 3, values: [3, 0] },
        { key: "d", total: 1, values: [0, 1] },
    ];

    it("folds the tail into a single Other row", () => {
        expect(collapseToTopSeries(series, 2)).toEqual([
            { key: "a", total: 10, values: [6, 4] },
            { key: "b", total: 6, values: [2, 4] },
            { key: "Other", total: 4, values: [3, 1] },
        ]);
    });

    it("returns the input untouched when it already fits", () => {
        expect(collapseToTopSeries(series, 4)).toBe(series);
    });
});

describe("formatCostAmount", () => {
    it("formats currency units as money", () => {
        expect(formatCostAmount(12.3456, "USD", "en-US")).toBe("$12.35");
        expect(formatCostAmount(4820.5, "USD", "en-US")).toBe("$4,821");
    });

    it("appends non-currency units and drops N/A", () => {
        expect(formatCostAmount(1.5, "GB-Mo", "en-US")).toBe("1.5 GB-Mo");
        expect(formatCostAmount(1.5, "N/A", "en-US")).toBe("1.5");
        expect(formatCostAmount(Number.NaN, "USD", "en-US")).toBe("$0.00");
    });
});

describe("percentOfTotal", () => {
    it("guards against a zero total", () => {
        expect(percentOfTotal(5, 20)).toBe(25);
        expect(percentOfTotal(5, 0)).toBe(0);
    });
});
