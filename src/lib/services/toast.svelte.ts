export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
}

class ToastService {
    activeToasts = $state<Toast[]>([]);

    show(message: string, type: Toast['type'] = 'info', duration = 3000) {
        const id = Math.random().toString(36).slice(2);
        const toast: Toast = { id, message, type, duration };
        this.activeToasts.push(toast);

        if (duration > 0) {
            setTimeout(() => {
                this.remove(id);
            }, duration);
        }
    }

    success(message: string, duration?: number) {
        this.show(message, 'success', duration);
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
