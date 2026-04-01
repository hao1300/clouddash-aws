const STORAGE_KEY = "aws_console_settings";

class SettingsService {
    downloadFolder = $state("");
    downloadFolderId = $state("");
    downloadFolderName = $state("");
    downloadConflictMode = $state<"overwrite" | "rename">("rename");
    licenseKey = $state("");

    isPro = $derived.by(() => {
        // Basic validation: must be a string and have some length.
        // In a real app, this might involve a checksum or API call.
        return typeof this.licenseKey === "string" && this.licenseKey.trim().length > 0;
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
                licenseKey: this.licenseKey
            }));
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    }
}

export const settings = new SettingsService();
