<script lang="ts">
    import { onMount } from "svelte";
    import {
        ElasticBeanstalkClient,
        DescribeEnvironmentsCommand,
        DescribeApplicationsCommand,
        DescribeApplicationVersionsCommand,
        type ApplicationDescription,
        type ApplicationVersionDescription,
        type EnvironmentDescription,
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
    let environmentsLoaded = $state(false);

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
                        class="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400"
                    >
                        {env.EnvironmentName}
                    </td>
                    <td
                        class="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                    >
                        {env.ApplicationName}
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
