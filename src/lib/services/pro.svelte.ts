import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";

export const proEnabled = import.meta.env.VITE_CLOUDDASH_PRO === "true";
const microsoftStoreBuild = import.meta.env.VITE_CLOUDDASH_MICROSOFT_STORE === "true";
const origin = "https://clouddash.dev";
const sessionKey = "clouddash:pro-session";

interface Entitlement {
    state: "free" | "trial" | "expired" | "pro";
    accountId: string;
    trialEndsAt: number | null;
    playProductId: string | null;
    windowsCheckout: boolean;
}

interface PlayPurchase {
    token: string;
    pending: boolean;
    products: string[];
}

const hex = (input: ArrayBuffer | Uint8Array) => Array.from(
    input instanceof Uint8Array ? input : new Uint8Array(input),
    byte => byte.toString(16).padStart(2, "0"),
).join("");

class ProService {
    entitlement = $state<Entitlement | null>(null);
    pendingSignIn = $state(false);
    signedIn = $state(false);
    os = $state("");
    private verifier = "";
    private session = "";

    async load() {
        if (!proEnabled) return;
        this.os ||= await invoke<string>("get_os");
        if (!this.session) this.session = localStorage.getItem(sessionKey) || "";
        this.signedIn = Boolean(this.session);
        if (this.signedIn) await this.refresh();
    }

    private async request<T>(action: string, method: "GET" | "POST", payload?: object): Promise<T> {
        const response = await fetch(`${origin}/api/pro/${action}`, {
            method,
            redirect: "error",
            headers: {
                ...(this.session ? { authorization: `Bearer ${this.session}` } : {}),
                ...(payload ? { "content-type": "application/json" } : {}),
            },
            body: payload ? JSON.stringify(payload) : undefined,
        });
        if (response.status === 401) this.clearSession();
        if (response.status === 409 && action === "sign-in") throw new Error("Finish Google sign-in in your browser, then try again.");
        if (response.status === 409 && action === "play-purchase") throw new Error("Google Play is still processing your payment.");
        if (response.status === 422 && action === "play-purchase") throw new Error("This purchase belongs to another CloudDash account or is no longer active.");
        if (!response.ok) throw new Error("CloudDash Pro is unavailable. Try again shortly.");
        if (response.status === 204) return undefined as T;
        return response.json();
    }

    async beginSignIn() {
        this.verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.verifier)));
        await openUrl(`${origin}/pro/sign-in?challenge=${challenge}`);
        this.pendingSignIn = true;
    }

    async finishSignIn() {
        const { session } = await this.request<{ session: string }>("sign-in", "POST", { verifier: this.verifier });
        this.verifier = "";
        this.pendingSignIn = false;
        this.session = session;
        localStorage.setItem(sessionKey, session);
        this.signedIn = true;
        await this.refresh();
    }

    private clearSession() {
        this.session = "";
        this.entitlement = null;
        this.signedIn = false;
        localStorage.removeItem(sessionKey);
    }

    async signOut() {
        try {
            await this.request("sign-out", "POST");
        } finally {
            this.clearSession();
        }
    }

    deleteAccount() {
        return openUrl(`${origin}/pro/delete-account`);
    }

    async refresh() {
        if (!this.session) return null;
        this.entitlement = await this.request<Entitlement>("entitlement", "GET");
        return this.entitlement;
    }

    async startTrial() {
        this.entitlement = await this.request<Entitlement>("trial", "POST");
    }

    async getPlayPrice() {
        const productId = this.entitlement?.playProductId;
        if (this.os !== "android" || !productId) return null;
        const offer = await invoke<{ price: string }>("play_billing", { action: "price", productId });
        return offer.price;
    }

    async buyOnWindows() {
        if (!microsoftStoreBuild || !this.entitlement?.windowsCheckout) return;
        const { url } = await this.request<{ url: string }>("windows-checkout", "POST");
        if (new URL(url).origin !== "https://checkout.stripe.com") throw new Error("CloudDash could not open checkout.");
        await openUrl(url);
    }

    get canBuyOnWindows() {
        return microsoftStoreBuild && Boolean(this.entitlement?.windowsCheckout);
    }

    async playPurchase(action: "purchase" | "restore") {
        const current = await this.refresh();
        const productId = current?.playProductId;
        if (!current || !productId || current.state === "pro") return;
        const { purchases } = await invoke<{ purchases: PlayPurchase[] }>("play_billing", {
            action, productId, accountId: current.accountId,
        });
        const matching = purchases.filter(purchase => purchase.products.includes(productId));
        for (const purchase of matching) {
            if (purchase.pending) continue;
            this.entitlement = await this.request<Entitlement>("play-purchase", "POST", { token: purchase.token });
            return;
        }
        if (matching.some(purchase => purchase.pending)) throw new Error("Google Play is still processing your payment.");
        if (action === "restore") throw new Error("No CloudDash Pro purchase was found on this Google Play account.");
    }
}

export const pro = new ProService();
