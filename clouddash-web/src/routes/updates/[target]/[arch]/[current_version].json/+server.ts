import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import tauriConf from '../../../../../../../src-tauri/tauri.conf.json';

// Simple semver comparison
function compareVersions(v1: string, v2: string) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n2 > n1) return -1;
    }
    return 0;
}

export async function GET({ params, fetch }: RequestEvent) {
    const { target, arch, current_version } = params;
    const latestVersion = tauriConf.version;

    // Compare version
    if (compareVersions(latestVersion, current_version) > 0) {
        // There is an update
        // Fetch the update metadata
        // On Cloudflare, we can fetch the static asset
        const res = await fetch(`/updates/${target}/${arch}/${latestVersion}.json`);
        
        if (res.ok) {
            const data = await res.json();
            return json(data);
        }
    }

    // No update available
    return new Response(null, { status: 204 });
}
