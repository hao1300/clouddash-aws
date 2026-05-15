<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { mdiLoading, mdiRefresh } from "@mdi/js";
    import Chart from "chart.js/auto";
    import { untrack } from "svelte";

    import {
        ListIdentitiesCommand,
        VerifyEmailIdentityCommand,
        DeleteIdentityCommand,
        SendEmailCommand,
        GetSendQuotaCommand,
        GetSendStatisticsCommand,
        GetAccountSendingEnabledCommand,
    } from "@aws-sdk/client-ses";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";
    import { aws } from "$lib/services/aws.svelte";
    import { confirmDialog } from "$lib/services/confirm.svelte";

    let identities = $state<any[]>([]);
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    let statsLoading = $state(false);
    let quota = $state<{
        Max24HourSend?: number;
        MaxSendRate?: number;
        SentLast24Hours?: number;
    } | null>(null);
    let sendingEnabled = $state<boolean | null>(null);
    let stats24h = $state<{
        attempts: number;
        bounces: number;
        complaints: number;
        rejects: number;
    } | null>(null);
    let dailySeries = $state<
        { day: string; attempts: number; bounces: number; complaints: number }[]
    >([]);

    let bounceRate = $derived(
        stats24h && stats24h.attempts > 0
            ? (stats24h.bounces / stats24h.attempts) * 100
            : 0,
    );
    let complaintRate = $derived(
        stats24h && stats24h.attempts > 0
            ? (stats24h.complaints / stats24h.attempts) * 100
            : 0,
    );

    // AWS SES reputation thresholds: bounce <5% healthy, >10% danger.
    // Complaint <0.1% healthy, >0.5% danger.
    function bounceStatus(rate: number): "healthy" | "warning" | "danger" {
        if (rate >= 10) return "danger";
        if (rate >= 5) return "warning";
        return "healthy";
    }
    function complaintStatus(rate: number): "healthy" | "warning" | "danger" {
        if (rate >= 0.5) return "danger";
        if (rate >= 0.1) return "warning";
        return "healthy";
    }

    const statusColor = {
        healthy: "text-green-400",
        warning: "text-yellow-400",
        danger: "text-red-400",
    } as const;

    function fmtNum(n: number | undefined | null): string {
        if (n === undefined || n === null) return "-";
        return n.toLocaleString();
    }

    let dailyView = $state<"chart" | "table">("chart");
    let dailyCanvas = $state<HTMLCanvasElement>();
    let dailyChart: Chart | null = null;

    $effect(() => {
        const series = dailySeries;
        const view = dailyView;
        if (view !== "chart" || !dailyCanvas || series.length === 0) {
            if (dailyChart) {
                dailyChart.destroy();
                dailyChart = null;
            }
            return;
        }
        untrack(() => {
            const chrono = [...series].sort((a, b) =>
                a.day.localeCompare(b.day),
            );
            const labels = chrono.map((d) => d.day);
            const attempts = chrono.map((d) => d.attempts);
            const bounces = chrono.map((d) => d.bounces);
            const complaints = chrono.map((d) => d.complaints);

            if (dailyChart) {
                dailyChart.data.labels = labels;
                dailyChart.data.datasets[0].data = attempts;
                dailyChart.data.datasets[1].data = bounces;
                dailyChart.data.datasets[2].data = complaints;
                dailyChart.update();
                return;
            }

            Chart.defaults.color = "#9CA3AF";
            Chart.defaults.font.family =
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

            dailyChart = new Chart(dailyCanvas as HTMLCanvasElement, {
                type: "bar",
                data: {
                    labels,
                    datasets: [
                        {
                            label: "Attempts",
                            data: attempts,
                            backgroundColor: "rgba(59, 130, 246, 0.7)",
                            borderColor: "#3B82F6",
                            borderWidth: 1,
                        },
                        {
                            label: "Bounces",
                            data: bounces,
                            backgroundColor: "rgba(239, 68, 68, 0.7)",
                            borderColor: "#EF4444",
                            borderWidth: 1,
                        },
                        {
                            label: "Complaints",
                            data: complaints,
                            backgroundColor: "rgba(234, 179, 8, 0.7)",
                            borderColor: "#EAB308",
                            borderWidth: 1,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            position: "top",
                            labels: {
                                color: "#9CA3AF",
                                font: { size: 10 },
                                boxWidth: 12,
                                boxHeight: 12,
                            },
                        },
                        tooltip: {
                            backgroundColor: "rgba(17, 24, 39, 0.9)",
                            titleColor: "#F3F4F6",
                            bodyColor: "#D1D5DB",
                            borderColor: "#374151",
                            borderWidth: 1,
                        },
                    },
                    scales: {
                        x: {
                            grid: { color: "#1F2937", display: false },
                            ticks: { color: "#6B7280", font: { size: 10 } },
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: "#1F2937", drawTicks: false },
                            border: { dash: [4, 4] },
                            ticks: {
                                color: "#9CA3AF",
                                font: { size: 10 },
                                callback: (v) =>
                                    typeof v === "number"
                                        ? v.toLocaleString()
                                        : String(v),
                            },
                        },
                    },
                },
            });
        });
    });

    let showVerifyModal = $state(false);
    let verifyEmail = $state("");
    let verifying = $state(false);

    let showTestModal = $state(false);
    let testFrom = $state("");
    let testTo = $state("");
    let testSubject = $state("SES Test Email");
    let testBody = $state(
        "This is a test email sent from the CloudDash for AWS application.",
    );
    let sending = $state(false);

    let __initLoaded = false;
    $effect(() => {
        if (aws.ses && !__initLoaded) {
            __initLoaded = true;
            loadIdentities();
            loadStats();
        }
    });

    async function loadIdentities() {
        if (!aws.ses) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ses.send(new ListIdentitiesCommand({}));
            identities = (res.Identities ?? []).map((id) => ({ name: id }));
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function loadStats() {
        if (!aws.ses) return;
        try {
            statsLoading = true;
            const ses = aws.ses;

            // Each call is best-effort; one failing shouldn't blank the others.
            const [quotaRes, statsRes, enabledRes] = await Promise.allSettled([
                ses.send(new GetSendQuotaCommand({})),
                ses.send(new GetSendStatisticsCommand({})),
                ses.send(new GetAccountSendingEnabledCommand({})),
            ]);

            if (quotaRes.status === "fulfilled") {
                quota = {
                    Max24HourSend: quotaRes.value.Max24HourSend,
                    MaxSendRate: quotaRes.value.MaxSendRate,
                    SentLast24Hours: quotaRes.value.SentLast24Hours,
                };
            } else {
                quota = null;
            }

            if (enabledRes.status === "fulfilled") {
                sendingEnabled = enabledRes.value.Enabled ?? null;
            } else {
                sendingEnabled = null;
            }

            if (statsRes.status === "fulfilled") {
                const points = statsRes.value.SendDataPoints ?? [];
                const cutoff = Date.now() - 24 * 60 * 60 * 1000;
                const last24h = points.filter(
                    (p) => (p.Timestamp?.getTime() ?? 0) >= cutoff,
                );
                stats24h = {
                    attempts: last24h.reduce(
                        (s, p) => s + (p.DeliveryAttempts ?? 0),
                        0,
                    ),
                    bounces: last24h.reduce(
                        (s, p) => s + (p.Bounces ?? 0),
                        0,
                    ),
                    complaints: last24h.reduce(
                        (s, p) => s + (p.Complaints ?? 0),
                        0,
                    ),
                    rejects: last24h.reduce(
                        (s, p) => s + (p.Rejects ?? 0),
                        0,
                    ),
                };

                // Bucket the last 14 days for the per-day breakdown.
                const buckets = new Map<
                    string,
                    {
                        day: string;
                        attempts: number;
                        bounces: number;
                        complaints: number;
                    }
                >();
                for (const p of points) {
                    if (!p.Timestamp) continue;
                    const d = new Date(p.Timestamp);
                    const key = d.toISOString().slice(0, 10);
                    const cur =
                        buckets.get(key) ?? {
                            day: key,
                            attempts: 0,
                            bounces: 0,
                            complaints: 0,
                        };
                    cur.attempts += p.DeliveryAttempts ?? 0;
                    cur.bounces += p.Bounces ?? 0;
                    cur.complaints += p.Complaints ?? 0;
                    buckets.set(key, cur);
                }
                dailySeries = Array.from(buckets.values()).sort((a, b) =>
                    b.day.localeCompare(a.day),
                );
            } else {
                stats24h = null;
                dailySeries = [];
            }
        } finally {
            statsLoading = false;
        }
    }

    function refreshAll() {
        loadIdentities();
        loadStats();
    }

    async function handleVerify() {
        if (!aws.ses || !verifyEmail) return;
        try {
            verifying = true;
            await aws.ses.send(
                new VerifyEmailIdentityCommand({ EmailAddress: verifyEmail }),
            );
            actionMsg = `Verification email sent to ${verifyEmail}.`;
            showVerifyModal = false;
            verifyEmail = "";
            loadIdentities();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            verifying = false;
        }
    }

    async function handleDelete(name: string) {
        if (!aws.ses) return;
        if (!(await confirmDialog({ message: `Delete identity ${name}?`, confirmText: "Delete", destructive: true }))) return;
        try {
            loading = true;
            await aws.ses.send(new DeleteIdentityCommand({ Identity: name }));
            actionMsg = `Identity ${name} deleted.`;
            loadIdentities();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleSendTest() {
        if (!aws.ses || !testFrom || !testTo) return;
        try {
            sending = true;
            await aws.ses.send(
                new SendEmailCommand({
                    Source: testFrom,
                    Destination: { ToAddresses: [testTo] },
                    Message: {
                        Subject: { Data: testSubject },
                        Body: { Text: { Data: testBody } },
                    },
                }),
            );
            actionMsg = `Test email sent from ${testFrom} to ${testTo}.`;
            showTestModal = false;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            sending = false;
        }
    }
</script>

<div class="h-full relative overflow-auto flex flex-col">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}
    {#if actionMsg}<div
            class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30"
        >
            {actionMsg}
        </div>{/if}

    <!-- Sending stats -->
    <div class="p-4 shrink-0 space-y-4">
        <div class="flex items-center justify-between">
            <h2
                class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
            >
                Sending Overview
            </h2>
            <button
                onclick={refreshAll}
                class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition"
                title="Refresh stats"
            >
                <Icon
                    path={statsLoading ? mdiLoading : mdiRefresh}
                    size={14}
                    class={statsLoading ? "animate-spin" : ""}
                />
            </button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <!-- 24h quota usage -->
            <div
                class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
            >
                <div
                    class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                >
                    Sent (Last 24h)
                </div>
                <div class="text-base font-bold text-gray-100">
                    {fmtNum(quota?.SentLast24Hours)}
                    <span class="text-xs text-gray-500 font-normal">
                        / {fmtNum(quota?.Max24HourSend)}
                    </span>
                </div>
                {#if quota?.Max24HourSend && quota.Max24HourSend > 0}
                    {@const pct = Math.min(
                        100,
                        ((quota.SentLast24Hours ?? 0) / quota.Max24HourSend) *
                            100,
                    )}
                    <div
                        class="mt-2 h-1.5 w-full bg-gray-800 rounded-full overflow-hidden"
                    >
                        <div
                            class="h-full {pct >= 90
                                ? 'bg-red-500'
                                : pct >= 70
                                  ? 'bg-yellow-500'
                                  : 'bg-blue-500'}"
                            style="width: {pct}%"
                        ></div>
                    </div>
                    <div class="text-[10px] text-gray-500 mt-1">
                        {pct.toFixed(1)}% of daily quota
                    </div>
                {/if}
            </div>

            <!-- Remaining today -->
            <div
                class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
            >
                <div
                    class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                >
                    Remaining Today
                </div>
                <div class="text-base font-bold text-gray-100">
                    {#if quota?.Max24HourSend !== undefined && quota.SentLast24Hours !== undefined}
                        {fmtNum(
                            Math.max(
                                0,
                                quota.Max24HourSend - quota.SentLast24Hours,
                            ),
                        )}
                    {:else}
                        -
                    {/if}
                </div>
                <div class="text-[10px] text-gray-500 mt-2">
                    Rolling 24-hour window
                </div>
            </div>

            <!-- Max send rate -->
            <div
                class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
            >
                <div
                    class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                >
                    Max Send Rate
                </div>
                <div class="text-base font-bold text-gray-100">
                    {quota?.MaxSendRate !== undefined
                        ? `${quota.MaxSendRate} /s`
                        : "-"}
                </div>
                <div class="text-[10px] text-gray-500 mt-2">
                    Per-second sending limit
                </div>
            </div>

            <!-- Sending enabled -->
            <div
                class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
            >
                <div
                    class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                >
                    Account Sending
                </div>
                <div
                    class="text-base font-bold {sendingEnabled === true
                        ? 'text-green-400'
                        : sendingEnabled === false
                          ? 'text-red-400'
                          : 'text-gray-400'}"
                >
                    {sendingEnabled === true
                        ? "Enabled"
                        : sendingEnabled === false
                          ? "Paused"
                          : "-"}
                </div>
                <div class="text-[10px] text-gray-500 mt-2">
                    Account-level send status
                </div>
            </div>
        </div>

        <!-- Reputation / 24h delivery health -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div
                class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
            >
                <div
                    class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                >
                    Delivery Attempts (24h)
                </div>
                <div class="text-base font-bold text-gray-100">
                    {fmtNum(stats24h?.attempts)}
                </div>
                <div class="text-[10px] text-gray-500 mt-2">
                    {stats24h?.rejects
                        ? `${fmtNum(stats24h.rejects)} rejected`
                        : "No rejections"}
                </div>
            </div>

            <div
                class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
            >
                <div
                    class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                >
                    Bounce Rate (24h)
                </div>
                <div
                    class="text-base font-bold {stats24h
                        ? statusColor[bounceStatus(bounceRate)]
                        : 'text-gray-400'}"
                >
                    {stats24h ? `${bounceRate.toFixed(2)}%` : "-"}
                </div>
                <div class="text-[10px] text-gray-500 mt-2">
                    {fmtNum(stats24h?.bounces)} bounces &middot; AWS threshold 5%
                </div>
            </div>

            <div
                class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
            >
                <div
                    class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                >
                    Complaint Rate (24h)
                </div>
                <div
                    class="text-base font-bold {stats24h
                        ? statusColor[complaintStatus(complaintRate)]
                        : 'text-gray-400'}"
                >
                    {stats24h ? `${complaintRate.toFixed(3)}%` : "-"}
                </div>
                <div class="text-[10px] text-gray-500 mt-2">
                    {fmtNum(stats24h?.complaints)} complaints &middot; AWS threshold 0.1%
                </div>
            </div>

            <div
                class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
            >
                <div
                    class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                >
                    Reputation Health
                </div>
                {#if stats24h && stats24h.attempts > 0}
                    {@const b = bounceStatus(bounceRate)}
                    {@const c = complaintStatus(complaintRate)}
                    {@const worst =
                        b === "danger" || c === "danger"
                            ? "danger"
                            : b === "warning" || c === "warning"
                              ? "warning"
                              : "healthy"}
                    <div class="text-base font-bold {statusColor[worst]}">
                        {worst === "danger"
                            ? "At Risk"
                            : worst === "warning"
                              ? "Watch"
                              : "Healthy"}
                    </div>
                    <div class="text-[10px] text-gray-500 mt-2">
                        Derived from 24h bounce + complaint rates
                    </div>
                {:else}
                    <div class="text-base font-bold text-gray-400">-</div>
                    <div class="text-[10px] text-gray-500 mt-2">
                        No deliveries in the last 24 hours
                    </div>
                {/if}
            </div>
        </div>

        <!-- Per-day breakdown (14 days from SES stats) -->
        {#if dailySeries.length > 0}
            <div
                class="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden"
            >
                <div
                    class="px-4 py-2 border-b border-gray-800 flex items-center justify-between gap-3"
                >
                    <span
                        class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                    >
                        Daily Sends (Last 14 Days)
                    </span>
                    <div
                        class="inline-flex items-center bg-gray-950 border border-gray-800 rounded-full p-0.5"
                    >
                        <button
                            onclick={() => (dailyView = "chart")}
                            class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition {dailyView ===
                            'chart'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-gray-200'}"
                        >
                            Chart
                        </button>
                        <button
                            onclick={() => (dailyView = "table")}
                            class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition {dailyView ===
                            'table'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-gray-200'}"
                        >
                            Table
                        </button>
                    </div>
                </div>
                {#if dailyView === "chart"}
                    <div class="p-4">
                        <div
                            class="relative w-full h-64 bg-gray-950 rounded-lg border border-gray-800/80 p-2 shadow-inner"
                        >
                            <canvas
                                bind:this={dailyCanvas}
                                class="w-full h-full"
                            ></canvas>
                        </div>
                    </div>
                {:else}
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs">
                            <thead
                                class="bg-gray-950/50 text-[10px] text-gray-500 uppercase tracking-wider"
                            >
                                <tr>
                                    <th class="text-left px-4 py-2 font-semibold"
                                        >Day</th
                                    >
                                    <th class="text-right px-4 py-2 font-semibold"
                                        >Attempts</th
                                    >
                                    <th class="text-right px-4 py-2 font-semibold"
                                        >Bounces</th
                                    >
                                    <th class="text-right px-4 py-2 font-semibold"
                                        >Complaints</th
                                    >
                                    <th class="text-right px-4 py-2 font-semibold"
                                        >Bounce %</th
                                    >
                                </tr>
                            </thead>
                            <tbody>
                                {#each dailySeries as row}
                                    {@const br =
                                        row.attempts > 0
                                            ? (row.bounces / row.attempts) * 100
                                            : 0}
                                    <tr
                                        class="border-t border-gray-800/50 hover:bg-gray-900/40"
                                    >
                                        <td
                                            class="px-4 py-1.5 font-mono text-gray-300"
                                            >{row.day}</td
                                        >
                                        <td
                                            class="px-4 py-1.5 text-right text-gray-200 font-mono"
                                            >{fmtNum(row.attempts)}</td
                                        >
                                        <td
                                            class="px-4 py-1.5 text-right text-gray-200 font-mono"
                                            >{fmtNum(row.bounces)}</td
                                        >
                                        <td
                                            class="px-4 py-1.5 text-right text-gray-200 font-mono"
                                            >{fmtNum(row.complaints)}</td
                                        >
                                        <td
                                            class="px-4 py-1.5 text-right font-mono {statusColor[
                                                bounceStatus(br)
                                            ]}"
                                            >{br.toFixed(2)}%</td
                                        >
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <div class="border-t border-gray-800"></div>

    <div class="flex-1 min-h-[400px]">
    <PaginatedTable
        items={identities}
        {loading}
        onRefresh={loadIdentities}
        columns={[{ label: "Identity", key: "name" }]}
    >
        {#snippet headerActionsSnippet()}
            <button
                onclick={() => (showVerifyModal = true)}
                class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow"
                >Verify Identity</button
            >
        {/snippet}
        {#snippet actionsSnippet(item)}
            <div class="flex gap-2 justify-end">
                <button
                    onclick={() => {
                        testFrom = item.name;
                        showTestModal = true;
                    }}
                    class="text-[10px] bg-green-600/20 hover:bg-green-600/40 text-green-400 px-2 py-1 rounded border border-green-500/30 transition shadow"
                    >Test</button
                >
                <button
                    onclick={() => handleDelete(item.name)}
                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                    >Delete</button
                >
            </div>
        {/snippet}
    </PaginatedTable>
    </div>
</div>

<Modal bind:open={showVerifyModal} title="Verify New Email Identity">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Email Address</label
            >
            <input
                type="email"
                bind:value={verifyEmail}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleVerify}
                disabled={verifying}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if verifying}<span class="animate-spin"><Icon path={mdiLoading} class="animate-spin" size={14} /></span>{/if} Send Verification
                Email
            </button>
        </div>
    </div>
</Modal>

<Modal bind:open={showTestModal} title="Send Test Email">
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >From</label
            >
            <input
                type="text"
                bind:value={testFrom}
                readonly
                class="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-400 cursor-not-allowed"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >To</label
            >
            <input
                type="email"
                bind:value={testTo}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Subject</label
            >
            <input
                type="text"
                bind:value={testSubject}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white"
            />
        </div>
        <div>
            <label
                class="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                >Body</label
            >
            <textarea
                bind:value={testBody}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white h-24"
            ></textarea>
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleSendTest}
                disabled={sending}
                class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2"
            >
                {#if sending}<span class="animate-spin"><Icon path={mdiLoading} size={14} class="animate-spin" /></span>{/if} Send Email
            </button>
        </div>
    </div>
</Modal>
