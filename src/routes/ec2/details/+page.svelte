<script lang="ts">
    import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
    import { aws } from "$lib/services/aws.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    let instanceId = $derived($page.url.searchParams.get("id") || "");

    let instance = $state<any | null>(null);
    let loading = $state(false);
    let error = $state("");

    $effect(() => {
        if (aws.ec2 && instanceId) {
            loadInstance();
        }
    });

    async function loadInstance() {
        if (!aws.ec2 || !instanceId) return;
        try {
            loading = true;
            const res = await aws.ec2.send(
                new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
            );
            const inst = res.Reservations?.[0]?.Instances?.[0];
            if (inst) {
                const nameTag = inst.Tags?.find((t) => t.Key === "Name");
                instance = {
                    id: inst.InstanceId,
                    name: nameTag?.Value ?? "Unnamed",
                    state: inst.State?.Name ?? "unknown",
                    type: inst.InstanceType,
                    publicIp: inst.PublicIpAddress ?? "-",
                    privateIp: inst.PrivateIpAddress ?? "-",
                    vpcId: inst.VpcId ?? "-",
                    subnetId: inst.SubnetId ?? "-",
                    keyName: inst.KeyName ?? "-",
                    launchTime: inst.LaunchTime?.toLocaleString() ?? "-",
                    arch: inst.Architecture ?? "-",
                    platform: inst.PlatformDetails ?? "-",
                    monitoring: inst.Monitoring?.State ?? "-",
                    securityGroups:
                        inst.SecurityGroups?.map((sg) => sg.GroupName).join(
                            ", ",
                        ) ?? "-",
                };
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    function handleBack() {
        goto("/ec2");
    }
</script>

<div class="h-full flex flex-col bg-gray-950 overflow-auto p-6 relative">
    {#if error}<div
            class="bg-red-500/20 text-red-300 p-2 text-xs absolute top-0 left-0 right-0 z-50 border-b border-red-500/30"
        >
            {error}
        </div>{/if}

    <div class="flex items-center gap-3 mb-8 shrink-0">
        <button
            onclick={handleBack}
            class="text-xs text-blue-400 hover:text-blue-300 transition"
            >← Back to Instances</button
        >
        <h2 class="text-sm font-bold text-gray-200">
            {instance?.name}
            <span class="text-gray-500 font-normal ml-2">{instanceId}</span>
        </h2>
    </div>

    {#if !instanceId}
        <div
            class="p-8 text-gray-500 italic text-xs uppercase tracking-widest bg-gray-900/20 border border-gray-800 rounded-lg text-center"
        >
            No Instance Selected
        </div>
    {:else if loading}
        <div
            class="flex-1 flex items-center justify-center text-blue-400 animate-pulse text-xs font-bold uppercase tracking-widest"
        >
            Loading Instance Details...
        </div>
    {:else if instance}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {#each [{ label: "Instance State", value: instance.state, color: instance.state === "running" ? "text-green-400" : "text-red-400" }, { label: "Instance Type", value: instance.type }, { label: "Public IP", value: instance.publicIp }, { label: "Private IP", value: instance.privateIp }, { label: "VPC ID", value: instance.vpcId }, { label: "Subnet ID", value: instance.subnetId }, { label: "Key Pair", value: instance.keyName }, { label: "Launch Time", value: instance.launchTime }] as item}
                <div
                    class="bg-gray-900/50 border border-gray-800 p-4 rounded-xl shadow-inner"
                >
                    <div
                        class="text-[10px] font-bold text-gray-600 uppercase tracking-tighter mb-1"
                    >
                        {item.label}
                    </div>
                    <div
                        class="text-xs font-bold {item.color ||
                            'text-gray-200'} truncate"
                        title={item.value}
                    >
                        {item.value}
                    </div>
                </div>
            {/each}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <h3
                    class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6 border-b border-gray-800 pb-2"
                >
                    Configuration
                </h3>
                <div class="space-y-4">
                    <div
                        class="flex justify-between text-xs border-b border-gray-800/30 pb-2"
                    >
                        <span class="text-gray-500">Architecture</span>
                        <span class="text-gray-300 font-mono"
                            >{instance.arch}</span
                        >
                    </div>
                    <div
                        class="flex justify-between text-xs border-b border-gray-800/30 pb-2"
                    >
                        <span class="text-gray-500">Platform</span>
                        <span class="text-gray-300">{instance.platform}</span>
                    </div>
                    <div
                        class="flex justify-between text-xs border-b border-gray-800/30 pb-2"
                    >
                        <span class="text-gray-500">Monitoring</span>
                        <span class="text-gray-300">{instance.monitoring}</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span class="text-gray-500">Launch Time</span>
                        <span class="text-gray-300">{instance.launchTime}</span>
                    </div>
                </div>
            </div>

            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <h3
                    class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6 border-b border-gray-800 pb-2"
                >
                    Security
                </h3>
                <div class="space-y-4">
                    <div
                        class="text-[10px] font-bold text-gray-600 uppercase mb-1"
                    >
                        Security Groups
                    </div>
                    <div
                        class="text-xs text-blue-400 font-medium bg-blue-400/5 p-3 rounded border border-blue-400/10"
                    >
                        {instance.securityGroups}
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>
