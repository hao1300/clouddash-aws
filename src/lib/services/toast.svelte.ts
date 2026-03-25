export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
    onClick?: () => void;
}

class ToastService {
    activeToasts = $state<Toast[]>([]);

    show(message: string, type: Toast['type'] = 'info', duration = 3000, onClick?: () => void) {
        console.log(`Showing toast: ${message} (${type})`);
        const id = Math.random().toString(36).slice(2);
        const toast: Toast = { id, message, type, duration, onClick };
        this.activeToasts = [...this.activeToasts, toast];

        if (duration > 0) {
            setTimeout(() => {
                this.remove(id);
            }, duration);
        }
    }

    success(message: string, duration?: number, onClick?: () => void) {
        this.show(message, 'success', duration, onClick);
    }

    error(message: string, duration?: number) {
        this.show(message, 'error', duration);
    }

    info(message: string, duration?: number) {
        this.show(message, 'info', duration);
    }

    remove(id: string) {
        this.activeToasts = this.activeToasts.filter((t) => t.id !== id);
    }
}

export const toastService = new ToastService();
