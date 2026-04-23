import { goto } from "$app/navigation";

class NavigationHistory {
    stack = $state<string[]>([]);
    isBackNavigation = false;
    lastUrl = $state(typeof localStorage !== 'undefined' ? localStorage.getItem("aws_console_last_url") || "" : "");

    push(url: string) {
        this.stack.push(url);
    }

    pop() {
        return this.stack.pop();
    }

    get canGoBack() {
        return this.stack.length > 0;
    }

    setLastUrl(url: string) {
        if (url === "/") return;
        this.lastUrl = url;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem("aws_console_last_url", url);
        }
    }

    async goBack() {
        if (this.canGoBack) {
            this.isBackNavigation = true;
            const prev = this.pop()!;
            await goto(prev);
            return true;
        }
        return false;
    }
}

export const navigationHistory = new NavigationHistory();
