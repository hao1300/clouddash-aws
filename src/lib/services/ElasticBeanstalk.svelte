<script lang="ts">
    import { onMount } from "svelte";
    import {
        ElasticBeanstalkClient,
        DescribeEnvironmentsCommand,
        DescribeApplicationsCommand,
        DescribeApplicationVersionsCommand,
        DescribeEventsCommand,
        type ApplicationDescription,
        type ApplicationVersionDescription,
        type EnvironmentDescription,
        type EventDescription,
    } from "@aws-sdk/client-elastic-beanstalk";
    import { getAwsCredentials } from "./aws-creds";
    import ServiceLayout from "$lib/components/ServiceLayout.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";

    let client: ElasticBeanstalkClient | null = null;
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // --- Service Layout State ---
    const tabs = [
        { id: "environments", label: "Environments" },
        { id: "applications", label: "Applications" },
        { id: "application-versions", label: "Application Versions" }
    ];
    let activeTab = $state("environments");



    // --- Resources State ---
    let selectedEnvironment = $state<EnvironmentDescription | null>(null);
    let selectedEnvironmentTab = $state("events");

    let environmentsLoaded = $state(false);

    let environmentEvents = $state<EventDescription[]>([]);
    let environmentDetailsLoading = $state(false);

    let applications = $state<ApplicationDescription[]>([]);
    let applicationsLoading = $state(false);
    let applicationsLoaded = $state(false);

    let applicationVersions = $state<ApplicationVersionDescription[]>([]);
    let appVersionsLoading = $state(false);
    let appVersionsLoaded = $state(false);
    let appVersionTokenMap = $state<string[]>([]);
    let appVersionCurrentToken = $state<string | undefined>(undefined);

    $effect(() => {
        if (!client) return;
        if (activeTab === "environments" && !environmentsLoaded) loadEnvironments();
        else if (activeTab === "applications" && !applicationsLoaded) loadApplications();
        else if (activeTab === "application-versions" && !appVersionsLoaded) loadApplicationVersions();
    });

    $effect(() => {
        if (!client || !selectedEnvironment) return;
        loadEnvironmentDetails(selectedEnvironment.EnvironmentName!, selectedEnvironmentTab);
    });

    async function loadEnvironmentDetails(environmentName: string, tab: string) {
        if (!client) return;
        environmentDetailsLoading = true;
        error = "";
        try {
            if (tab === "events") {
                const res = await client.send(
                    new DescribeEventsCommand({ EnvironmentName: environmentName, MaxRecords: 50 })
                );
                environmentEvents = res.Events || [];
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            environmentDetailsLoading = false;
        }
    }

    // --- Pagination Shared Helpers ---
    function pushToken(history: string[], currentNextToken?: string) {
        if (!currentNextToken) return;
        if (history[history.length - 1] !== currentNextToken)
            history.push(currentNextToken);
    }
    function popToken(history: string[]) {
        history.pop();
        return history.length > 0 ? history[history.length - 1] : undefined;
    }

    // --- Environments ---
    let environments = $state<EnvironmentDescription[]>([]);
    let tokenMap = $state<string[]>([]);
    let currentToken = $state<string | undefined>(undefined);

    onMount(async () => {
        try {
            const creds = await getAwsCredentials();
            client = new ElasticBeanstalkClient({
                region: creds.region || "us-east-1",
                credentials: {
                    accessKeyId: creds.access_key_id,
                    secretAccessKey: creds.secret_access_key,
                    ...(creds.session_token
                        ? { sessionToken: creds.session_token }
                        : {}),
                },
            });
            // loadEnvironments will be called by $effect
        } catch (e: any) {
            error = e.message || String(e);
        }
    });

    async function loadEnvironments(token?: string) {
        if (!client) return;
        loading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new DescribeEnvironmentsCommand({ NextToken: token }),
            );
            environments = res.Environments || [];
            currentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
            environmentsLoaded = true;
        }
    }


    async function loadApplications() {
        if (!client) return;
        applicationsLoading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new DescribeApplicationsCommand({}),
            );
            applications = res.Applications || [];
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            applicationsLoading = false;
            applicationsLoaded = true;
        }
    }

    async function loadApplicationVersions(token?: string) {
        if (!client) return;
        appVersionsLoading = true;
        error = "";
        actionMsg = "";
        try {
            const res = await client.send(
                new DescribeApplicationVersionsCommand({ NextToken: token }),
            );
            applicationVersions = res.ApplicationVersions || [];
            appVersionCurrentToken = res.NextToken;
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            appVersionsLoading = false;
            appVersionsLoaded = true;
        }
    }

    const appColumns = [
        { label: "Application Name", key: "ApplicationName", sortable: true },
        { label: "Description", key: "Description", sortable: true },
        { label: "Date Created", key: "DateCreated", sortable: true },
        { label: "Date Updated", key: "DateUpdated", sortable: true },
    ];

    const appVersionColumns = [
        { label: "Version Label", key: "VersionLabel", sortable: true },
        { label: "Application Name", key: "ApplicationName", sortable: true },
        { label: "Description", key: "Description", sortable: true },
        { label: "Status", key: "Status", sortable: true },
        { label: "Date Created", key: "DateCreated", sortable: true },
    ];

    function handleNext() {
        if (currentToken) {
            pushToken(tokenMap, currentToken);
            loadEnvironments(currentToken);
        }
    }

    function handlePrev() {
        const prevToken = popToken(tokenMap);
        loadEnvironments(prevToken);
    }
</script>

<ServiceLayout title="Elastic Beanstalk" {tabs} bind:activeTab>
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-blue-500/30">{actionMsg}</div>{/if}
    {#if activeTab === "environments"}
        {#if selectedEnvironment}
            <div class="h-full flex flex-col {error || actionMsg ? 'pt-8' : ''}">
                <div class="flex items-center gap-4 p-4 border-b border-gray-800 bg-gray-900/50">
                    <button class="text-gray-400 hover:text-white" onclick={() => selectedEnvironment = null}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                    <h2 class="text-lg font-bold text-gray-200">{selectedEnvironment.EnvironmentName}</h2>
                    <span class="px-2 py-0.5 rounded text-xs {selectedEnvironment.Status === 'Ready' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">
                        {selectedEnvironment.Status}
                    </span>
                    <span class="px-2 py-0.5 rounded text-xs {selectedEnvironment.Health === 'Green' ? 'bg-green-500/20 text-green-400' : selectedEnvironment.Health === 'Yellow' ? 'bg-yellow-500/20 text-yellow-400' : selectedEnvironment.Health === 'Red' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}">
                        {selectedEnvironment.Health || "Unknown"}
                    </span>
                </div>

                <div class="flex border-b border-gray-800 bg-black">
                    {#each [
                        { id: 'events', label: 'Events' }
                    ] as tab}
                        <button
                            class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {selectedEnvironmentTab === tab.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'}"
                            onclick={() => selectedEnvironmentTab = tab.id}
                        >
                            {tab.label}
                        </button>
                    {/each}
                </div>

                <div class="flex-1 overflow-auto bg-black p-4">
                    {#if environmentDetailsLoading}
                        <div class="text-gray-400 text-sm animate-pulse">Loading...</div>
                    {:else if selectedEnvironmentTab === 'events'}
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-gray-900 border-b border-gray-700 text-xs text-gray-400">
                                    <th class="px-4 py-2 font-medium">Time</th>
                                    <th class="px-4 py-2 font-medium">Severity</th>
                                    <th class="px-4 py-2 font-medium">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each environmentEvents as event}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                                        <td class="px-4 py-2 text-sm text-gray-300 whitespace-nowrap">{event.EventDate ? new Date(event.EventDate).toLocaleString() : ''}</td>
                                        <td class="px-4 py-2 text-sm">
                                            <span class="px-2 py-0.5 rounded text-xs {event.Severity === 'INFO' ? 'bg-blue-500/20 text-blue-400' : event.Severity === 'WARN' ? 'bg-yellow-500/20 text-yellow-400' : event.Severity === 'ERROR' || event.Severity === 'FATAL' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}">
                                                {event.Severity || 'UNKNOWN'}
                                            </span>
                                        </td>
                                        <td class="px-4 py-2 text-sm text-gray-400">{event.Message}</td>
                                    </tr>
                                {/each}
                                {#if environmentEvents.length === 0}
                                    <tr><td colspan="3" class="px-4 py-4 text-center text-sm text-gray-500">No events found.</td></tr>
                                {/if}
                            </tbody>
                        </table>
                    {/if}
                </div>
            </div>
        {:else}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={environments}
                {loading}
                columns={[
                    {
                        label: "Environment Name",
                        key: "EnvironmentName",
                        sortable: true,
                    },
                    {
                        label: "Application",
                        key: "ApplicationName",
                        sortable: true,
                    },
                    { label: "Version Label", key: "VersionLabel", sortable: true },
                    { label: "Platform", key: "SolutionStackName", sortable: true },
                    { label: "Status", key: "Status", sortable: true },
                    { label: "Health", key: "Health", sortable: true },
                ]}
                hasNext={!!currentToken}
                hasPrev={tokenMap.length > 0}
                onNext={handleNext}
                onPrev={handlePrev}
                onRefresh={() => {
                    tokenMap = [];
                    environmentsLoaded = false;
                    loadEnvironments();
                }}
            >
                {#snippet children(env: any)}
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium"
                    >
                        <button
                            class="text-blue-400 hover:underline focus:outline-none"
                            onclick={() => { selectedEnvironment = env; selectedEnvironmentTab = 'events'; }}
                        >
                            {env.EnvironmentName}
                        </button>
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        {env.ApplicationName}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                        {env.VersionLabel || "-"}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]" title={env.SolutionStackName}>
                        {env.SolutionStackName || "-"}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                            class="px-2 py-0.5 rounded text-xs {env.Status ===
                            'Ready'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-yellow-500/20 text-yellow-400'}"
                        >
                            {env.Status}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                            class="px-2 py-0.5 rounded text-xs {env.Health ===
                            'Green'
                                ? 'bg-green-500/20 text-green-400'
                                : env.Health === 'Yellow'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : env.Health === 'Red'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-gray-500/20 text-gray-400'}"
                        >
                            {env.Health || "Unknown"}
                        </span>
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
        {/if}
    {:else if activeTab === "applications"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={applications}
                loading={applicationsLoading}
                columns={appColumns}
                hasNext={false}
                hasPrev={false}
                onRefresh={() => {
                    applicationsLoaded = false;
                    loadApplications();
                }}
            >
                {#snippet children(app: any)}
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400">{app.ApplicationName}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]">{app.Description || "-"}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                        {app.DateCreated ? new Date(app.DateCreated).toLocaleString() : ""}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                        {app.DateUpdated ? new Date(app.DateUpdated).toLocaleString() : ""}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {:else if activeTab === "application-versions"}
        <div class="h-full {error || actionMsg ? 'pt-8' : ''}">
            <PaginatedTable
                items={applicationVersions}
                loading={appVersionsLoading}
                columns={appVersionColumns}
                hasNext={!!appVersionCurrentToken}
                hasPrev={appVersionTokenMap.length > 0}
                onNext={() => {
                    if (appVersionCurrentToken) {
                        pushToken(appVersionTokenMap, appVersionCurrentToken);
                        loadApplicationVersions(appVersionCurrentToken);
                    }
                }}
                onPrev={() => {
                    const prevToken = popToken(appVersionTokenMap);
                    loadApplicationVersions(prevToken);
                }}
                onRefresh={() => {
                    appVersionTokenMap = [];
                    appVersionsLoaded = false;
                    loadApplicationVersions();
                }}
            >
                {#snippet children(ver: any)}
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400">{ver.VersionLabel}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{ver.ApplicationName}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400 truncate max-w-[200px]">{ver.Description || "-"}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span class="px-2 py-0.5 rounded text-xs {ver.Status === 'PROCESSED' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">
                            {ver.Status}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                        {ver.DateCreated ? new Date(ver.DateCreated).toLocaleString() : ""}
                    </td>
                {/snippet}
            </PaginatedTable>
        </div>
    {/if}
</ServiceLayout>
