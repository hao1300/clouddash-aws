import type { ResultByTime } from "@aws-sdk/client-cost-explorer";

export type CostGranularity = "DAILY" | "MONTHLY";

/** A single bucket returned by Cost Explorer (`End` is exclusive). */
export interface CostPeriod {
    start: string;
    end: string;
    label: string;
    estimated: boolean;
}

/** One line of the breakdown: a group (or the account total when ungrouped). */
export interface CostSeries {
    key: string;
    total: number;
    /** Amount per period, aligned with `CostBreakdown.periods`. */
    values: number[];
}

export interface CostBreakdown {
    periods: CostPeriod[];
    series: CostSeries[];
    /** Total across all series, per period. */
    periodTotals: number[];
    total: number;
    /** `USD` for cost metrics, or the usage unit for `UsageQuantity`. */
    unit: string;
}

export interface CostDateRange {
    /** Inclusive `YYYY-MM-DD` start, as Cost Explorer expects it. */
    start: string;
    /** Exclusive `YYYY-MM-DD` end, as Cost Explorer expects it. */
    end: string;
}

export interface CostRangePreset {
    id: string;
    label: string;
    granularity: CostGranularity;
}

/**
 * Ranges offered in the toolbar. Cost Explorer bills per request, so these are
 * kept coarse rather than free-scrolling.
 */
export const COST_RANGE_PRESETS: CostRangePreset[] = [
    { id: "7d", label: "Last 7 Days", granularity: "DAILY" },
    { id: "14d", label: "Last 14 Days", granularity: "DAILY" },
    { id: "30d", label: "Last 30 Days", granularity: "DAILY" },
    { id: "mtd", label: "This Month", granularity: "DAILY" },
    { id: "lastmonth", label: "Last Month", granularity: "DAILY" },
    { id: "3m", label: "Last 3 Months", granularity: "MONTHLY" },
    { id: "6m", label: "Last 6 Months", granularity: "MONTHLY" },
    { id: "12m", label: "Last 12 Months", granularity: "MONTHLY" },
    { id: "custom", label: "Custom Range", granularity: "DAILY" },
];

/** Formats a date as the `YYYY-MM-DD` string Cost Explorer expects (UTC). */
export function toCostDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Parses a `YYYY-MM-DD` Cost Explorer date into a UTC-midnight Date. */
export function fromCostDate(value: string): Date {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

export function addCostDays(value: string, days: number): string {
    const date = fromCostDate(value);
    date.setUTCDate(date.getUTCDate() + days);
    return toCostDate(date);
}

function startOfMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
    );
}

/**
 * Turns a preset into a Cost Explorer time period. The exclusive end is set to
 * tomorrow for ranges that include today, so today's partial costs show up.
 */
export function resolveCostRange(presetId: string, now: Date): CostDateRange {
    const today = toCostDate(now);
    const tomorrow = addCostDays(today, 1);
    const monthStart = toCostDate(startOfMonth(now));

    switch (presetId) {
        case "7d":
            return { start: addCostDays(tomorrow, -7), end: tomorrow };
        case "14d":
            return { start: addCostDays(tomorrow, -14), end: tomorrow };
        case "30d":
            return { start: addCostDays(tomorrow, -30), end: tomorrow };
        case "mtd":
            return { start: monthStart, end: tomorrow };
        case "lastmonth":
            return {
                start: toCostDate(addMonths(startOfMonth(now), -1)),
                end: monthStart,
            };
        case "3m":
            return {
                start: toCostDate(addMonths(startOfMonth(now), -2)),
                end: tomorrow,
            };
        case "6m":
            return {
                start: toCostDate(addMonths(startOfMonth(now), -5)),
                end: tomorrow,
            };
        case "12m":
            return {
                start: toCostDate(addMonths(startOfMonth(now), -11)),
                end: tomorrow,
            };
        default:
            return { start: addCostDays(tomorrow, -30), end: tomorrow };
    }
}

/**
 * Folds an extra `GetCostAndUsage` page into the pages already collected.
 * Pagination splits the groups of a time period across pages, so pages have to
 * be merged per period instead of concatenated.
 */
export function mergeCostPages(
    collected: ResultByTime[],
    page: ResultByTime[] | undefined,
): ResultByTime[] {
    if (!page?.length) return collected;

    const merged = [...collected];
    for (const result of page) {
        const index = merged.findIndex(
            (existing) => existing.TimePeriod?.Start === result.TimePeriod?.Start,
        );
        if (index < 0) {
            merged.push(result);
            continue;
        }
        merged[index] = {
            ...merged[index],
            Groups: [...(merged[index].Groups || []), ...(result.Groups || [])],
        };
    }
    return merged;
}

/** Label for a bucket: `Mar 4` for daily data, `Mar 2026` for monthly. */
export function formatPeriodLabel(
    start: string,
    granularity: CostGranularity,
    locales: string | string[] = [],
): string {
    const date = fromCostDate(start);
    if (granularity === "MONTHLY") {
        return date.toLocaleDateString(locales, {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
        });
    }
    return date.toLocaleDateString(locales, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    });
}

function parseAmount(amount: string | undefined): number {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pivots `GetCostAndUsage` results (period -> groups) into series (group ->
 * periods) so they can be charted and tabulated, sorted by spend descending.
 */
export function buildCostBreakdown(
    results: ResultByTime[],
    metric: string,
    granularity: CostGranularity,
    locales: string | string[] = [],
): CostBreakdown {
    const periods: CostPeriod[] = [];
    const periodTotals: number[] = [];
    const seriesByKey = new Map<string, CostSeries>();
    let unit = "";

    results.forEach((result, index) => {
        const start = result.TimePeriod?.Start || "";
        periods.push({
            start,
            end: result.TimePeriod?.End || "",
            label: start ? formatPeriodLabel(start, granularity, locales) : "",
            estimated: !!result.Estimated,
        });
        periodTotals.push(0);

        const entries: [string, number, string][] = [];
        if (result.Groups?.length) {
            for (const group of result.Groups) {
                const value = group.Metrics?.[metric];
                const key = (group.Keys || [])
                    .map((k) => k || "No value")
                    .join(" / ");
                entries.push([
                    key || "No value",
                    parseAmount(value?.Amount),
                    value?.Unit || "",
                ]);
            }
        } else {
            const value = result.Total?.[metric];
            if (value) {
                entries.push(["Total", parseAmount(value.Amount), value.Unit || ""]);
            }
        }

        for (const [key, amount, entryUnit] of entries) {
            if (!unit && entryUnit && entryUnit !== "N/A") unit = entryUnit;

            let series = seriesByKey.get(key);
            if (!series) {
                series = { key, total: 0, values: new Array(results.length).fill(0) };
                seriesByKey.set(key, series);
            }
            series.values[index] += amount;
            series.total += amount;
            periodTotals[index] += amount;
        }
    });

    const series = [...seriesByKey.values()].sort((a, b) => b.total - a.total);

    return {
        periods,
        series,
        periodTotals,
        total: periodTotals.reduce((sum, value) => sum + value, 0),
        unit,
    };
}

/**
 * Keeps the biggest `limit` series and folds the rest into a single `Other`
 * row, so a chart with hundreds of usage types stays readable.
 */
export function collapseToTopSeries(
    series: CostSeries[],
    limit: number,
    otherLabel = "Other",
): CostSeries[] {
    if (series.length <= limit) return series;

    const top = series.slice(0, limit);
    const rest = series.slice(limit);
    const periodCount = series[0]?.values.length ?? 0;
    const other: CostSeries = {
        key: otherLabel,
        total: 0,
        values: new Array(periodCount).fill(0),
    };

    for (const item of rest) {
        other.total += item.total;
        item.values.forEach((value, index) => {
            other.values[index] += value;
        });
    }

    return [...top, other];
}

/**
 * Formats a metric amount. Cost metrics come back with a currency code, while
 * `UsageQuantity` uses units like `GB-Mo` that `Intl` cannot format.
 */
export function formatCostAmount(
    amount: number,
    unit: string,
    locales: string | string[] = [],
): string {
    const safeAmount = Number.isFinite(amount) ? amount : 0;

    if (/^[A-Z]{3}$/.test(unit)) {
        try {
            return safeAmount.toLocaleString(locales, {
                style: "currency",
                currency: unit,
                maximumFractionDigits: Math.abs(safeAmount) >= 1000 ? 0 : 2,
            });
        } catch {
            // Fall through to the plain-number rendering below.
        }
    }

    const formatted = safeAmount.toLocaleString(locales, {
        maximumFractionDigits: Math.abs(safeAmount) >= 1000 ? 0 : 2,
    });
    return unit && unit !== "N/A" ? `${formatted} ${unit}` : formatted;
}

/** Share of the total, guarding against the empty/zero-spend range. */
export function percentOfTotal(amount: number, total: number): number {
    if (!total) return 0;
    return (amount / total) * 100;
}
