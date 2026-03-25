const STORAGE_KEY = "aws_console_settings";

class SettingsService {
    downloadFolder = $state("");
    downloadConflictMode = $state<"overwrite" | "rename">("rename");

    constructor() {
        this.load();
    }

    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.downloadFolder) this.downloadFolder = parsed.downloadFolder;
                if (parsed.downloadConflictMode) this.downloadConflictMode = parsed.downloadConflictMode;
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                downloadFolder: this.downloadFolder,
                downloadConflictMode: this.downloadConflictMode
            }));
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    }
}

export const settings = new SettingsService();
