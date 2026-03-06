// Helper to manage token history for "Previous" page navigation
export function pushToken(history: string[], currentNextToken?: string) {
    if (!currentNextToken) return;
    if (history[history.length - 1] !== currentNextToken) {
        history.push(currentNextToken);
    }
}

export function popToken(history: string[]) {
    history.pop(); // discard current page token
    return history.length > 0 ? history[history.length - 1] : undefined;
}

export function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
