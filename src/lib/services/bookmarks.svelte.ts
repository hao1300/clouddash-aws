import { page } from "$app/stores";
import { get } from "svelte/store";

export interface Bookmark {
    id: string;
    url: string;
    label: string;
}

class BookmarksService {
    #bookmarks = $state<Bookmark[]>([]);
    #storageKey = "cw_bookmarks";

    currentUrl = $state("");

    constructor() {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem(this.#storageKey);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    this.#bookmarks = parsed.map((b: any) => ({
                        id: b.id || crypto.randomUUID(),
                        url: b.url || "/",
                        label: b.label || "Unknown",
                    }));
                } catch (e) {
                    console.error("Failed to parse bookmarks:", e);
                }
            }
        }
    }

    get all() {
        return this.#bookmarks;
    }

    get isBookmarked() {
        let urlTarget = this.currentUrl;
        if (!urlTarget) {
            const p = get(page);
            urlTarget = p.url.pathname + p.url.search;
        }
        return !!this.#bookmarks.find((b) => b.url === urlTarget);
    }

    toggle(label?: string) {
        let urlTarget = this.currentUrl;
        if (!urlTarget) {
            const p = get(page);
            urlTarget = p.url.pathname + p.url.search;
        }
        const existingIndex = this.#bookmarks.findIndex((b) => b.url === urlTarget);

        if (existingIndex >= 0) {
            this.#bookmarks = this.#bookmarks.filter((_, i) => i !== existingIndex);
        } else {
            this.#bookmarks = [
                ...this.#bookmarks,
                {
                    id: crypto.randomUUID(),
                    url: urlTarget,
                    label: label || urlTarget,
                },
            ];
        }
        this.save();
    }

    save() {
        if (typeof window !== "undefined") {
            localStorage.setItem(this.#storageKey, JSON.stringify(this.#bookmarks));
        }
    }

    rename(id: string, newLabel: string) {
        this.#bookmarks = this.#bookmarks.map((b) =>
            b.id === id ? { ...b, label: newLabel } : b
        );
        this.save();
    }

    remove(id: string) {
        this.#bookmarks = this.#bookmarks.filter((b) => b.id !== id);
        this.save();
    }
}

export const bookmarks = new BookmarksService();
