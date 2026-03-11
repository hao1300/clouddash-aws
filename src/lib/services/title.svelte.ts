import { SERVICE_MANIFEST } from "./service-manifest";

/**
 * Represents a resource part in the breadcrumb.
 */
export interface BreadcrumbResource {
    name: string;
    href?: string;
    path: string;
}

/**
 * Service to manage the hierarchical breadcrumb title shown in the top bar.
 */
class TitleService {
    service = $state({ label: "", href: "" });
    subservice = $state({ label: "", href: "" });
    currentPath = $state("");
    resources = $state<BreadcrumbResource[]>([]);

    /**
     * Update the base service and subservice based on the current URL.
     */
    updateFromUrl(pathname: string) {
        this.currentPath = pathname;
        const parts = pathname.split("/").filter(Boolean);
        const serviceId = parts[0];
        const subserviceId = parts[1] || "";

        const manifest = SERVICE_MANIFEST[serviceId];
        if (manifest) {
            this.service = { label: manifest.label, href: `/${serviceId}` };
            
            // Look for matching tab or default
            let subLabel = manifest.tabs[subserviceId];
            if (!subLabel && subserviceId) {
                // Try prefix match for sub-routes
                const matchingTab = Object.keys(manifest.tabs).find(t => t && subserviceId.startsWith(t));
                if (matchingTab) {
                    subLabel = manifest.tabs[matchingTab];
                }
            }
            
            if (subLabel) {
                this.subservice = { 
                    label: subLabel, 
                    href: `/${serviceId}${subserviceId ? '/' + subserviceId : ''}` 
                };
            } else if (manifest.tabs[""] !== undefined) {
                // Default to the "" tab if no match and it exists
                this.subservice = {
                    label: manifest.tabs[""],
                    href: `/${serviceId}`
                };
            } else {
                this.subservice = { label: "", href: "" };
            }
        } else {
            this.service = { label: "", href: "" };
            this.subservice = { label: "", href: "" };
        }
    }

    /**
     * Set the primary resource (resets existing resources).
     */
    setResource(name: string, href?: string) {
        this.resources = [{
            name: decodeURIComponent(name),
            href,
            path: this.currentPath
        }];
    }

    /**
     * Add a sub-resource to the existing ones.
     */
    addResource(name: string, href?: string) {
        this.resources.push({
            name: decodeURIComponent(name),
            href,
            path: this.currentPath
        });
    }

    /**
     * Combined parts for convenience.
     */
    get parts() {
        const list = [];
        if (this.service.label) list.push({ label: this.service.label, href: this.service.href });
        if (this.subservice.label && this.subservice.label !== this.service.label) {
            list.push({ label: this.subservice.label, href: this.subservice.href });
        }
        
        // Show resources if current path is a child or match of the resource path
        for (const res of this.resources) {
            if (res.name && this.currentPath.startsWith(res.path)) {
                if (res.name !== this.subservice.label) {
                    list.push({ label: res.name, href: res.href || "" });
                }
            }
        }
        
        return list;
    }
}

export const titleService = new TitleService();
