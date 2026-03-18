<script lang="ts">
    import { onMount, untrack } from "svelte";
    import Chart from "chart.js/auto";

    interface DataPoint {
        rawTimestamp: Date;
        rawAverage: number;
    }

    let {
        data = [],
        title = "",
        loading = false,
        formatValue = (v: number) => v.toLocaleString(),
        yLabel = "",
    }: {
        data: DataPoint[];
        title?: string;
        loading?: boolean;
        formatValue?: (v: number) => string;
        yLabel?: string;
    } = $props();

    let canvasRef = $state<HTMLCanvasElement>();
    let chartInstance: Chart | null = null;

    $effect(() => {
        if (!canvasRef) return;

        // We only want to rebuild the chart when data changes
        const currentData = data;
        const currentTitle = title;
        const currentYLabel = yLabel;

        if (!currentData || currentData.length === 0) {
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            return;
        }

        untrack(() => {
            const chrono = [...currentData].sort(
                (a, b) => a.rawTimestamp.getTime() - b.rawTimestamp.getTime(),
            );

            const labels = chrono.map((d) => d.rawTimestamp);
            const values = chrono.map((d) => Number(d.rawAverage) || 0);

            if (chartInstance) {
                chartInstance.data.labels = labels;
                chartInstance.data.datasets[0].data = values;
                chartInstance.data.datasets[0].label = currentTitle;
                const yScale = chartInstance.options.scales?.y as any;
                if (yScale && yScale.title) {
                    yScale.title.text = currentYLabel;
                }
                chartInstance.update();
            } else {
                Chart.defaults.color = "#9CA3AF";
                Chart.defaults.font.family =
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

                chartInstance = new Chart(canvasRef as HTMLCanvasElement, {
                    type: "line",
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: currentTitle,
                                data: values,
                                borderColor: "#3B82F6",
                                backgroundColor: "rgba(59, 130, 246, 0.1)",
                                borderWidth: 2,
                                pointBackgroundColor: "#60A5FA",
                                pointBorderColor: "#1E3A8A",
                                pointRadius: 3,
                                pointHoverRadius: 5,
                                fill: true,
                                tension: 0.1,
                            },
                        ],
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
                                display: false,
                            },
                            tooltip: {
                                backgroundColor: "rgba(17, 24, 39, 0.9)",
                                titleColor: "#F3F4F6",
                                bodyColor: "#D1D5DB",
                                borderColor: "#374151",
                                borderWidth: 1,
                                callbacks: {
                                    title: function (context) {
                                        const dateLabel =
                                            labels[context[0].dataIndex];
                                        if (!dateLabel) return "";
                                        return new Date(
                                            dateLabel,
                                        ).toLocaleString([], {
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        });
                                    },
                                    label: function (context) {
                                        let label = context.dataset.label || "";
                                        if (label) {
                                            label += ": ";
                                        }
                                        if (context.parsed.y !== null) {
                                            label += formatValue(
                                                context.parsed.y,
                                            );
                                        }
                                        return label;
                                    },
                                },
                            },
                        },
                        scales: {
                            x: {
                                grid: {
                                    color: "#374151",
                                    display: false,
                                },
                                ticks: {
                                    color: "#6B7280",
                                    font: {
                                        size: 10,
                                    },
                                    callback: function (value, index) {
                                        const d = labels[index] as Date;
                                        if (!d) return "";
                                        return d.toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        });
                                    },
                                },
                            },
                            y: {
                                title: {
                                    display: !!currentYLabel,
                                    text: currentYLabel,
                                    color: "#6B7280",
                                    font: {
                                        size: 10,
                                        weight: "bold",
                                    },
                                },
                                grid: {
                                    color: "#1F2937",
                                    drawTicks: false,
                                },
                                border: {
                                    dash: [4, 4],
                                },
                                ticks: {
                                    color: "#9CA3AF",
                                    font: {
                                        size: 10,
                                    },
                                    callback: function (value) {
                                        return formatValue(value as number);
                                    },
                                },
                            },
                        },
                    },
                });
            }
        });
    });
</script>

<div class="flex flex-col gap-2">
    {#if title}
        <h4
            class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
        >
            {title}
        </h4>
    {/if}

    {#if loading}
        <div
            class="h-40 flex items-center justify-center text-gray-400 text-xs animate-pulse bg-gray-950/20 rounded border border-gray-800/50"
        >
            <span class="animate-spin mr-2">⟳</span> Loading metrics...
        </div>
    {:else if !data || data.length === 0}
        <div
            class="h-40 flex items-center justify-center text-gray-600 text-xs italic bg-gray-950/20 rounded border border-gray-800/50"
        >
            No data available
        </div>
    {:else if data.length < 2}
        <div
            class="h-40 flex items-center justify-center text-gray-600 text-xs italic bg-gray-950/20 rounded border border-gray-800/50"
        >
            Insufficient data points for visualization
        </div>
    {:else}
        <div
            class="relative w-full h-40 bg-gray-950 rounded-lg border border-gray-800/80 p-2 shadow-inner"
        >
            <canvas bind:this={canvasRef} class="w-full h-full"></canvas>
        </div>
    {/if}
</div>
