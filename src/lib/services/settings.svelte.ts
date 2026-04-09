import { fetch } from "@tauri-apps/plugin-http";

const STORAGE_KEY = "aws_console_settings";
const POLAR_ORGANIZATION_ID = "bf4ff11b-e298-457f-82d7-23f052478d54";
export const POLAR_API_URL = "https://sandbox-api.polar.sh";
export const POLAR_CHECKOUT_URL = `${POLAR_API_URL}/v1/checkout-links/polar_cl_wSVggwiHdtEY319YwRsbLh8FlwpUbg4pupCIw44mgED/redirect`;

class SettingsService {
    downloadFolder = $state("");
    downloadFolderId = $state("");
    downloadFolderName = $state("");
    downloadConflictMode = $state<"overwrite" | "rename">("rename");
    licenseKey = $state("");
    licenseValid = $state(false);
    licenseEmail = $state("");
    licenseValidating = $state(false);
    licenseError = $state("");

    deviceFingerprint = "";

    isPro = $derived.by(() => {
        return this.licenseValid;
    });

    constructor() {
        this.load();
    }

    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.downloadFolder) this.downloadFolder = parsed.downloadFolder;
                if (parsed.downloadFolderId) this.downloadFolderId = parsed.downloadFolderId;
                if (parsed.downloadFolderName) this.downloadFolderName = parsed.downloadFolderName;
                if (parsed.downloadConflictMode) this.downloadConflictMode = parsed.downloadConflictMode;
                if (parsed.licenseKey) this.licenseKey = parsed.licenseKey;
                if (parsed.licenseValid) this.licenseValid = parsed.licenseValid;
                if (parsed.licenseEmail) this.licenseEmail = parsed.licenseEmail;
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                downloadFolder: this.downloadFolder,
                downloadFolderId: this.downloadFolderId,
                downloadFolderName: this.downloadFolderName,
                downloadConflictMode: this.downloadConflictMode,
                licenseKey: this.licenseKey,
                licenseValid: this.licenseValid,
                licenseEmail: this.licenseEmail
            }));
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    }

    async validateLicense(key?: string): Promise<boolean> {
        const licenseKey = key || this.licenseKey;
        if (!licenseKey || !licenseKey.trim()) {
            this.clearLicense();
            return false;
        }

        this.licenseValidating = true;
        this.licenseError = "";

        try {
            console.log(`[Polar.sh] Validating organization: ${POLAR_ORGANIZATION_ID}`);
            if (!POLAR_ORGANIZATION_ID) {
                console.warn("[Polar.sh] Missing VITE_POLAR_ORGANIZATION_ID. Please add it to your .env and restart the dev server.");
            }

            const res = await fetch(`${POLAR_API_URL}/v1/customer-portal/license-keys/validate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    organization_id: POLAR_ORGANIZATION_ID,
                    key: licenseKey.trim()
                })
            });

            if (res.ok) {
                const data = await res.json();
                
                // Polar successfully validated the key and returned the license key object
                this.licenseKey = licenseKey.trim();
                this.licenseValid = true;
                // Try to extract email if provided in the response
                this.licenseEmail = data.customer?.email || "";
                this.licenseError = "";
                this.save();
                return true;
            } else {
                let errorMsg = "Invalid license key";
                try {
                    const errData = await res.json();
                    if (errData.detail) {
                        if (typeof errData.detail === "string") {
                            errorMsg = errData.detail;
                        } else if (Array.isArray(errData.detail)) {
                            errorMsg = errData.detail.map((d: any) => d.msg || d).join(", ");
                        } else {
                            errorMsg = JSON.stringify(errData.detail);
                        }
                    } else if (errData.error) {
                        errorMsg = errData.error;
                    }
                } catch (e) {
                    // Ignore parse error
                }
                
                this.licenseValid = false;
                this.licenseEmail = "";
                this.licenseError = errorMsg;
                this.save();
                return false;
            }
        } catch (e: any) {
            console.error("License validation failed", e);
            this.licenseError = "Unable to validate. Check your internet connection.";
            // Keep existing valid state on network errors (offline-friendly)
            return this.licenseValid;
        } finally {
            this.licenseValidating = false;
        }
    }

    clearLicense() {
        this.licenseKey = "";
        this.licenseValid = false;
        this.licenseEmail = "";
        this.licenseError = "";
        this.save();
    }
}

export const settings = new SettingsService();
