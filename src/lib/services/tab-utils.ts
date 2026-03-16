import type { Page } from "@sveltejs/kit";
import type { ServiceTab, ServiceEntry } from "./service-manifest";

/**
 * Transforms and filters service tabs based on the manifest's declarative configuration.
 */
export function transformTabsGeneric(tabs: ServiceTab[], page: Page, manifest: ServiceEntry): ServiceTab[] {
    const { resourcePrefix, contextualTabs } = manifest;
    
    // If no resource selection logic is defined, return tabs as is
    if (!resourcePrefix || !contextualTabs) return tabs;

    const isPathBased = resourcePrefix.startsWith("/");
    let resourceId: string | null = null;

    if (isPathBased) {
        // Path-based resource detection (e.g., /table/my-table)
        const match = page.url.pathname.match(new RegExp(`${resourcePrefix}/([^/]+)`));
        resourceId = match?.[1] || null;
    } else {
        // Search param-based resource detection (e.g., ?id=my-resource)
        resourceId = page.url.searchParams.get(resourcePrefix);
    }

    // If no resource is active, hide contextual tabs
    if (!resourceId) {
        return tabs.filter(t => !contextualTabs.includes(t.id));
    }

    // If resource is active, handle rewriting for path-based routes
    if (isPathBased) {
        const prefix = resourcePrefix.slice(1); // remove leading /
        return tabs.map(t => {
            if (contextualTabs.includes(t.id)) {
                // Rewriting logic: 
                // DynamoDB: table/[name]/[id] -> explore, details
                // S3: bucket/[name] -> objects (landing), details
                let suffix = "";
                // S3 'objects' is the landing page for a bucket (no suffix)
                if (prefix === "bucket" && t.id === "objects") {
                    suffix = "";
                } else if (t.id) {
                    suffix = `/${t.id}`;
                }
                
                return { ...t, id: `${prefix}/${resourceId}${suffix}` };
            }
            return t;
        });
    }

    // For param-based services (EC2, etc.), contextual tabs like "details" 
    // stay as is because handleServiceTabChange preserves the search params.
    return tabs;
}
