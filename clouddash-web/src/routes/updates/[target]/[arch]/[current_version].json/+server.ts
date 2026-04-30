import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import tauriConf from '../../../../../../../src-tauri/tauri.conf.json';

export const prerender = false;

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

export async function GET({ params }: RequestEvent) {
    const { target, arch, current_version } = params;
    const latestVersion = tauriConf.version;

    // Compare version
    if (compareVersions(latestVersion, current_version) > 0) {
        // There is an update
        // We use import.meta.glob to embed the JSON files into the worker
        const allMetadata = import.meta.glob('../../../../../../static/versions/*/*/*.json', { eager: true });

        // Find the matching metadata
        const metadataPath = `../../../../../../static/versions/${target}/${arch}/${latestVersion}.json`;
        const data = allMetadata[metadataPath];

        if (data) {
            // The imported JSON might have a default export or just be the object itself
            return json(data.default || data);
        } else {
            return json({
                error: "Metadata not found"
            }, { status: 404 });
        }
    }

    // No update available
    return new Response(null, { status: 204 });
}
