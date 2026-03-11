import { SERVICE_MANIFEST } from "./service-manifest";

/**
 * Service to manage the hierarchical breadcrumb title shown in the top bar.
 */
class TitleService {
    service = $state({ label: "", href: "" });
    subservice = $state({ label: "", href: "" });
    resource = $state("");

    /**
     * Update the base service and subservice based on the current URL.
     */
    updateFromUrl(pathname: string) {
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
        // Reset resource on URL change, page will set it back if needed
        this.resource = "";
    }

    /**
     * Set the resource name (the most specific part of the title).
     */
    setResource(name: string) {
        this.resource = decodeURIComponent(name);
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
        if (this.resource && this.resource !== this.subservice.label) {
            list.push({ label: this.resource, href: "" });
        }
        return list;
    }
}

export const titleService = new TitleService();
