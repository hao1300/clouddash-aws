import { untrack } from "svelte";
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
        if (this.currentPath === pathname) return; // No change, skip
        this.currentPath = pathname;

        const parts = pathname.split("/").filter(Boolean);
        const serviceId = parts[0];
        const subserviceId = parts[1] || "";

        const manifest = SERVICE_MANIFEST[serviceId];
        if (manifest) {
            const newServiceLabel = manifest.label;
            const newServiceHref = `/${serviceId}`;
            if (this.service.label !== newServiceLabel || this.service.href !== newServiceHref) {
                this.service = { label: newServiceLabel, href: newServiceHref };
            }

            // Look for matching tab or default
            let subLabel = manifest.tabs[subserviceId];
            if (!subLabel && subserviceId) {
                const matchingTab = Object.keys(manifest.tabs).find(t => t && subserviceId.startsWith(t));
                if (matchingTab) {
                    subLabel = manifest.tabs[matchingTab];
                }
            }

            let newSub = { label: "", href: "" };
            if (subLabel) {
                newSub = {
                    label: subLabel,
                    href: `/${serviceId}${subserviceId ? '/' + subserviceId : ''}`
                };
            } else if (manifest.tabs[""] !== undefined) {
                newSub = { label: manifest.tabs[""], href: `/${serviceId}` };
            }
            if (this.subservice.label !== newSub.label || this.subservice.href !== newSub.href) {
                this.subservice = newSub;
            }
        } else {
            if (this.service.label) this.service = { label: "", href: "" };
            if (this.subservice.label) this.subservice = { label: "", href: "" };
        }

        // Clear resources that don't belong to the current path
        const basePath = `/${serviceId}${subserviceId ? '/' + subserviceId : ''}`;
        untrack(() => {
            const filtered = this.resources.filter(r => pathname.startsWith(r.path) || r.path.startsWith(basePath));
            if (filtered.length !== this.resources.length) {
                this.resources = filtered;
            }
        });
    }

    /**
     * Set the primary resource (resets existing resources).
     */
    setResource(name: string, href?: string, path?: string) {
        this.resources = [{
            name: decodeURIComponent(name),
            href,
            path: path || this.currentPath
        }];
    }

    /**
     * Set multiple resources at once.
     */
    setResources(resources: { name: string, href?: string, path?: string }[]) {
        this.resources = resources.map(res => ({
            name: decodeURIComponent(res.name),
            href: res.href,
            path: res.path || this.currentPath
        }));
    }

    /**
     * Add a sub-resource to the existing ones.
     */
    addResource(name: string, href?: string, path?: string) {
        untrack(() => {
            this.resources = [...this.resources, {
                name: decodeURIComponent(name),
                href,
                path: path || this.currentPath
            }];
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

        for (const res of this.resources) {
            if (res.name && res.name !== this.subservice.label) {
                list.push({ label: res.name, href: res.href || "" });
            }
        }

        return list;
    }
}

export const titleService = new TitleService();
