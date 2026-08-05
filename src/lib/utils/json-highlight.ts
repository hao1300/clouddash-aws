/**
 * Shared structured-value syntax highlighting utility using highlight.js.
 */
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import properties from "highlight.js/lib/languages/properties";
import { detectValueFormat } from "./value-format";

hljs.registerLanguage("json", json);
hljs.registerLanguage("properties", properties);

/**
 * Highlights a raw JSON string using highlight.js.
 * Returns an HTML string with hljs spans for syntax coloring.
 */
export function highlightJson(jsonStr: string): string {
    return hljs.highlight(jsonStr, { language: "json" }).value;
}

export function highlightStructuredValue(value: string): string {
    const format = detectValueFormat(value);
    if (format === "json") {
        return highlightJson(JSON.stringify(JSON.parse(value), null, 2));
    }
    if (format === "properties") {
        return hljs.highlight(value, { language: "properties" }).value;
    }

    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Attempts to parse and highlight a message as JSON.
 * If the message is valid JSON object/array, returns formatted + highlighted HTML.
 * Otherwise, returns HTML-escaped plain text.
 */
export function formatJsonMessage(msg: string): string {
    if (!msg) return "";
    try {
        const obj = JSON.parse(msg);
        if (typeof obj === "object" && obj !== null) {
            const formatted = JSON.stringify(obj, null, 2);
            return highlightJson(formatted);
        }
    } catch {
        // Not JSON
    }
    return msg
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
