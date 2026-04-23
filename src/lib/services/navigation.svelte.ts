import { goto } from "$app/navigation";

class NavigationHistory {
    stack = $state<string[]>([]);
    isBackNavigation = false;

    push(url: string) {
        this.stack.push(url);
    }

    pop() {
        return this.stack.pop();
    }

    get canGoBack() {
        return this.stack.length > 0;
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
