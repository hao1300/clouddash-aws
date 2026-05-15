export interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
}

interface ActiveConfirm extends ConfirmOptions {
    resolve: (value: boolean) => void;
}

class ConfirmService {
    active = $state<ActiveConfirm | null>(null);

    ask(opts: ConfirmOptions | string): Promise<boolean> {
        const options: ConfirmOptions =
            typeof opts === "string" ? { message: opts } : opts;
        return new Promise((resolve) => {
            // Resolve any previously active confirm as cancelled so the
            // newer one takes its place.
            if (this.active) {
                this.active.resolve(false);
            }
            this.active = { ...options, resolve };
        });
    }

    confirm() {
        if (this.active) {
            this.active.resolve(true);
            this.active = null;
        }
    }

    cancel() {
        if (this.active) {
            this.active.resolve(false);
            this.active = null;
        }
    }
}

export const confirmService = new ConfirmService();

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
    return confirmService.ask(opts);
}