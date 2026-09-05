<script lang="ts">
    import { untrack, onDestroy } from "svelte";
    import Chart from "chart.js/auto";
    import Icon from "$lib/components/Icon.svelte";
    import { mdiRefresh } from "@mdi/js";

    let {
        labels = [],
        series = [],
        loading = false,
        formatValue = (v: number) => v.toLocaleString(),
        otherLabel = "Other",
    }: {
        labels: string[];
        series: { key: string; values: number[] }[];
        loading?: boolean;
        formatValue?: (value: number) => string;
        otherLabel?: string;
    } = $props();

    // Distinguishable on the dark background; "Other" always stays gray.
    const PALETTE = [
        "#3B82F6",
        "#22C55E",
        "#F97316",
        "#A855F7",
        "#EAB308",
        "#14B8A6",
        "#EC4899",
        "#0EA5E9",
        "#EF4444",
        "#84CC16",
    ];
    const OTHER_COLOR = "#6B7280";

    let canvasRef = $state<HTMLCanvasElement>();
    let chartInstance: Chart | null = null;

    function destroyChart() {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
    }

    onDestroy(destroyChart);

    $effect(() => {
        // Capture the reactive inputs before doing the Chart.js work untracked.
        // Chart.js defines non-enumerable properties on the arrays it is given,
        // which a $state proxy rejects (state_descriptors_fixed), so hand it
        // plain copies rather than the reactive originals.
        const currentLabels = [...labels];
        const currentSeries = series.map((item) => ({
            key: item.key,
            values: [...item.values],
        }));
        const currentFormat = formatValue;
        const currentOtherLabel = otherLabel;

        if (!canvasRef || currentSeries.length === 0) {
            untrack(destroyChart);
            return;
        }

        untrack(() => {
            // The dataset count changes with the grouping dimension, so rebuild
            // rather than patching the existing chart.
            destroyChart();

            Chart.defaults.color = "#9CA3AF";
            Chart.defaults.font.family =
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

            chartInstance = new Chart(canvasRef as HTMLCanvasElement, {
                type: "bar",
                data: {
                    labels: currentLabels,
                    datasets: currentSeries.map((item, index) => {
                        const color =
                            item.key === currentOtherLabel
                                ? OTHER_COLOR
                                : PALETTE[index % PALETTE.length];
                        return {
                            label: item.key,
                            data: item.values,
                            backgroundColor: color,
                            hoverBackgroundColor: color,
                            borderWidth: 0,
                            borderRadius: 2,
                        };
                    }),
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: "index",
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            display: currentSeries.length > 1,
                            position: "bottom",
                            labels: {
                                boxWidth: 10,
                                boxHeight: 10,
                                padding: 10,
                                font: { size: 10 },
                            },
                        },
                        tooltip: {
                            backgroundColor: "rgba(17, 24, 39, 0.9)",
                            titleColor: "#F3F4F6",
                            bodyColor: "#D1D5DB",
                            footerColor: "#F3F4F6",
                            borderColor: "#374151",
                            borderWidth: 1,
                            // A stacked day can hold a dozen groups; only the
                            // ones that actually cost something are useful.
                            filter: (item) => Number(item.parsed.y) !== 0,
                            itemSort: (a, b) =>
                                Number(b.parsed.y) - Number(a.parsed.y),
                            callbacks: {
                                label: (context) => {
                                    const label = context.dataset.label || "";
                                    return `${label}: ${currentFormat(Number(context.parsed.y))}`;
                                },
                                footer: (items) => {
                                    if (items.length < 2) return "";
                                    const total = items.reduce(
                                        (sum, item) => sum + Number(item.parsed.y),
                                        0,
                                    );
                                    return `Total: ${currentFormat(total)}`;
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            stacked: true,
                            grid: { display: false },
                            ticks: {
                                color: "#6B7280",
                                font: { size: 10 },
                                autoSkipPadding: 12,
                                maxRotation: 0,
                            },
                        },
                        y: {
                            stacked: true,
                            grid: { color: "#1F2937", drawTicks: false },
                            border: { dash: [4, 4] },
                            ticks: {
                                color: "#9CA3AF",
                                font: { size: 10 },
                                callback: (value) =>
                                    currentFormat(Number(value)),
                            },
                        },
                    },
                },
            });
        });
    });
</script>

{#if loading}
    <div
        class="h-72 flex items-center justify-center text-gray-400 text-xs animate-pulse bg-gray-950/20 rounded border border-gray-800/50"
    >
        <Icon path={mdiRefresh} size={14} class="animate-spin mr-2" /> Loading cost
        data...
    </div>
{:else if series.length === 0}
    <div
        class="h-72 flex items-center justify-center text-gray-600 text-xs italic bg-gray-950/20 rounded border border-gray-800/50"
    >
        No cost data for this period
    </div>
{:else}
    <div
        class="relative w-full h-72 bg-gray-950 rounded-lg border border-gray-800/80 p-2 shadow-inner"
    >
        <canvas bind:this={canvasRef} class="w-full h-full"></canvas>
    </div>
{/if}
