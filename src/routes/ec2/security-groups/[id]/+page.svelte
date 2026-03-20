<script lang="ts">
    import {
        DescribeSecurityGroupsCommand,
        AuthorizeSecurityGroupIngressCommand,
        RevokeSecurityGroupIngressCommand,
        AuthorizeSecurityGroupEgressCommand,
        RevokeSecurityGroupEgressCommand,
    } from "@aws-sdk/client-ec2";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { titleService } from "$lib/services/title.svelte";
    import PaginatedTable from "$lib/components/PaginatedTable.svelte";
    import Modal from "$lib/components/Modal.svelte";

    let sgId = $derived($page.params.id);

    $effect(() => {
        const name =
            sg?.name && sg.name !== "Unnamed"
                ? `${sg.name} (${sgId})`
                : sgId;
        titleService.setResource(name, undefined, $page.url.pathname);
    });

    let sg = $state<any | null>(null);
    let inboundRules = $state<any[]>([]);
    let outboundRules = $state<any[]>([]);
    
    let loading = $state(false);
    let error = $state("");
    let actionMsg = $state("");

    // Modal state
    let showAddModal = $state(false);
    let isIngress = $state(true); // true = Inbound, false = Outbound
    let formProtocol = $state("tcp");
    let formPortRange = $state("");
    let formSourceDest = $state("0.0.0.0/0");
    let formDescription = $state("");
    let saving = $state(false);

    $effect(() => {
        if (aws.ec2 && sgId) {
            loadSg();
        }
    });

    function extractRules(permissions: any[], type: "Ingress" | "Egress") {
        const rules: any[] = [];
        for (const perm of permissions) {
            const protocol = perm.IpProtocol === "-1" ? "All" : (perm.IpProtocol || "All").toUpperCase();
            let portRange = "All";
            if (perm.FromPort !== undefined && perm.ToPort !== undefined) {
                if (perm.FromPort === perm.ToPort) portRange = String(perm.FromPort);
                else portRange = `${perm.FromPort}-${perm.ToPort}`;
            }

            const pushRule = (sourceDest: string, desc: string, singlePerm: any) => {
                rules.push({
                    type,
                    protocol,
                    portRange,
                    sourceDest,
                    description: desc || "-",
                    rawPermission: singlePerm,
                });
            };

            for (const range of perm.IpRanges || []) {
                pushRule(range.CidrIp, range.Description, {
                    ...perm, IpRanges: [range], Ipv6Ranges: [], UserIdGroupPairs: [], PrefixListIds: []
                });
            }
            for (const range of perm.Ipv6Ranges || []) {
                pushRule(range.CidrIpv6, range.Description, {
                    ...perm, IpRanges: [], Ipv6Ranges: [range], UserIdGroupPairs: [], PrefixListIds: []
                });
            }
            for (const pair of perm.UserIdGroupPairs || []) {
                pushRule(pair.GroupId, pair.Description, {
                    ...perm, IpRanges: [], Ipv6Ranges: [], UserIdGroupPairs: [pair], PrefixListIds: []
                });
            }
            for (const prefix of perm.PrefixListIds || []) {
                pushRule(prefix.PrefixListId, prefix.Description, {
                    ...perm, IpRanges: [], Ipv6Ranges: [], UserIdGroupPairs: [], PrefixListIds: [prefix]
                });
            }
        }
        return rules;
    }

    async function loadSg() {
        if (!aws.ec2 || !sgId) return;
        try {
            loading = true;
            error = "";
            const res = await aws.ec2.send(
                new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }),
            );
            const rawSg = res.SecurityGroups?.[0];
            if (rawSg) {
                sg = {
                    id: rawSg.GroupId,
                    name: rawSg.GroupName,
                    description: rawSg.Description,
                    vpc: rawSg.VpcId || "-",
                    owner: rawSg.OwnerId,
                };
                inboundRules = extractRules(rawSg.IpPermissions || [], "Ingress");
                outboundRules = extractRules(rawSg.IpPermissionsEgress || [], "Egress");
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    async function handleDeleteRule(rule: any) {
        if (!aws.ec2) return;
        const msg = `Delete ${rule.type} rule: ${rule.protocol} ${rule.portRange} from/to ${rule.sourceDest}?`;
        if (!confirm(msg)) return;

        try {
            loading = true;
            if (rule.type === "Ingress") {
                await aws.ec2.send(
                    new RevokeSecurityGroupIngressCommand({
                        GroupId: sgId,
                        IpPermissions: [rule.rawPermission]
                    })
                );
            } else {
                await aws.ec2.send(
                    new RevokeSecurityGroupEgressCommand({
                        GroupId: sgId,
                        IpPermissions: [rule.rawPermission]
                    })
                );
            }
            actionMsg = `Rule deleted successfully.`;
            loadSg();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function openAddModal(ingress: boolean) {
        isIngress = ingress;
        formProtocol = "tcp";
        formPortRange = "80";
        formSourceDest = "0.0.0.0/0";
        formDescription = "";
        showAddModal = true;
    }

    async function handleAddRule() {
        if (!aws.ec2) return;
        try {
            saving = true;
            error = "";
            
            let FromPort: number | undefined;
            let ToPort: number | undefined;

            if (formProtocol !== "-1" && formPortRange && formPortRange.toLowerCase() !== "all") {
                if (formPortRange.includes("-")) {
                    const [f, t] = formPortRange.split("-");
                    FromPort = parseInt(f, 10);
                    ToPort = parseInt(t, 10);
                } else {
                    FromPort = parseInt(formPortRange, 10);
                    ToPort = FromPort;
                }
            }

            const isSg = formSourceDest.startsWith("sg-");
            const isIpv6 = formSourceDest.includes(":");
            
            const IpRanges = !isSg && !isIpv6 ? [{ CidrIp: formSourceDest, Description: formDescription || undefined }] : undefined;
            const Ipv6Ranges = !isSg && isIpv6 ? [{ CidrIpv6: formSourceDest, Description: formDescription || undefined }] : undefined;
            const UserIdGroupPairs = isSg ? [{ GroupId: formSourceDest, Description: formDescription || undefined }] : undefined;

            const permission = {
                IpProtocol: formProtocol,
                FromPort,
                ToPort,
                IpRanges,
                Ipv6Ranges,
                UserIdGroupPairs
            };

            if (isIngress) {
                await aws.ec2.send(new AuthorizeSecurityGroupIngressCommand({
                    GroupId: sgId,
                    IpPermissions: [permission]
                }));
            } else {
                await aws.ec2.send(new AuthorizeSecurityGroupEgressCommand({
                    GroupId: sgId,
                    IpPermissions: [permission]
                }));
            }
            actionMsg = `${isIngress ? "Inbound" : "Outbound"} rule added successfully.`;
            showAddModal = false;
            loadSg();
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            saving = false;
        }
    }
</script>

<div class="h-full relative overflow-auto flex flex-col bg-gray-950 p-2 gap-4">
    {#if error}<div class="bg-red-500/20 text-red-300 p-2 text-xs border border-red-500/30 rounded">{error}</div>{/if}
    {#if actionMsg}<div class="bg-blue-500/20 text-blue-300 p-2 text-xs border border-blue-500/30 rounded">{actionMsg}</div>{/if}

    {#if loading && !sg}
        <div class="flex-1 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest">
            Loading Security Group...
        </div>
    {:else if !sg}
        <div class="p-8 text-gray-500 italic text-xs uppercase tracking-widest bg-gray-900/20 border border-gray-800 rounded-lg text-center">
            Security Group Not Found
        </div>
    {:else}
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner">
                <div class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1">Name</div>
                <div class="text-xs font-bold text-gray-200 truncate" title={sg.name}>{sg.name}</div>
            </div>
            <div class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner">
                <div class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1">Group ID</div>
                <div class="text-xs font-bold text-gray-400 truncate" title={sg.id}>{sg.id}</div>
            </div>
            <div class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner">
                <div class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1">VPC ID</div>
                <div class="text-xs font-bold text-blue-400 truncate" title={sg.vpc}>{sg.vpc}</div>
            </div>
            <div class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner">
                <div class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1">Description</div>
                <div class="text-xs font-bold text-gray-300 truncate" title={sg.description}>{sg.description}</div>
            </div>
        </div>

        <!-- Inbound Rules -->
        <div class="bg-gray-900/50 border border-gray-800 rounded-xl flex flex-col min-h-[300px]">
            <div class="flex items-center justify-between p-4 border-b border-gray-800">
                <h3 class="text-sm font-bold text-gray-300 uppercase tracking-widest">Inbound Rules</h3>
                <button
                    onclick={() => openAddModal(true)}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition shadow"
                >Add Inbound Rule</button>
            </div>
            <div class="flex-1 overflow-hidden relative">
                <div class="absolute inset-0">
                    <PaginatedTable
                        items={inboundRules}
                        loading={loading}
                        onRefresh={loadSg}
                        columns={[
                            { label: "Protocol", key: "protocol" },
                            { label: "Port Range", key: "portRange" },
                            { label: "Source", key: "sourceDest" },
                            { label: "Description", key: "description" },
                        ]}
                    >
                        {#snippet actionsSnippet(item)}
                            <div class="flex gap-2 justify-end">
                                <button
                                    onclick={() => handleDeleteRule(item)}
                                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                                >Delete</button>
                            </div>
                        {/snippet}
                    </PaginatedTable>
                </div>
            </div>
        </div>

        <!-- Outbound Rules -->
        <div class="bg-gray-900/50 border border-gray-800 rounded-xl flex flex-col min-h-[300px]">
            <div class="flex items-center justify-between p-4 border-b border-gray-800">
                <h3 class="text-sm font-bold text-gray-300 uppercase tracking-widest">Outbound Rules</h3>
                <button
                    onclick={() => openAddModal(false)}
                    class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition shadow"
                >Add Outbound Rule</button>
            </div>
            <div class="flex-1 overflow-hidden relative">
                <div class="absolute inset-0">
                    <PaginatedTable
                        items={outboundRules}
                        loading={loading}
                        onRefresh={loadSg}
                        columns={[
                            { label: "Protocol", key: "protocol" },
                            { label: "Port Range", key: "portRange" },
                            { label: "Destination", key: "sourceDest" },
                            { label: "Description", key: "description" },
                        ]}
                    >
                        {#snippet actionsSnippet(item)}
                            <div class="flex gap-2 justify-end">
                                <button
                                    onclick={() => handleDeleteRule(item)}
                                    class="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded border border-red-500/30 transition shadow"
                                >Delete</button>
                            </div>
                        {/snippet}
                    </PaginatedTable>
                </div>
            </div>
        </div>
    {/if}
</div>

<Modal bind:open={showAddModal} title={isIngress ? "Add Inbound Rule" : "Add Outbound Rule"}>
    <div class="space-y-4 p-4 text-gray-300">
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Protocol</label>
            <select
                bind:value={formProtocol}
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white uppercase tracking-wider focus:border-blue-500 focus:outline-none"
            >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp">ICMP</option>
                <option value="-1">All Traffic</option>
            </select>
        </div>
        {#if formProtocol !== "-1"}
            <div>
                <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Port Range</label>
                <input
                    type="text"
                    bind:value={formPortRange}
                    placeholder="e.g. 80, or 80-8080"
                    class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
            </div>
        {/if}
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">{isIngress ? "Source" : "Destination"}</label>
            <input
                type="text"
                bind:value={formSourceDest}
                placeholder="CIDR (0.0.0.0/0) or SG ID (sg-1234)"
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            />
        </div>
        <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Description (Optional)</label>
            <input
                type="text"
                bind:value={formDescription}
                placeholder="Rule description"
                class="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            />
        </div>
        <div class="flex justify-end pt-2">
            <button
                onclick={handleAddRule}
                disabled={saving}
                class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition flex items-center gap-2 uppercase tracking-widest shadow"
            >
                {#if saving}<span class="animate-spin">⟳</span>{/if} Add Rule
            </button>
        </div>
    </div>
</Modal>
