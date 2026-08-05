export type ValueFormat = "json" | "properties" | "text";

export type KeyValueEntry = [
    key: string,
    value: string | number | boolean | null,
];

function findUnescapedEquals(line: string): number {
    for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "=") continue;

        let precedingBackslashes = 0;
        for (
            let backslashIndex = index - 1;
            backslashIndex >= 0 && line[backslashIndex] === "\\";
            backslashIndex -= 1
        ) {
            precedingBackslashes += 1;
        }

        if (precedingBackslashes % 2 === 0) return index;
    }

    return -1;
}

/**
 * Parses the simple `key=value` properties format supported by resource value
 * editors. Blank lines and Java-properties-style comments are ignored.
 */
export function parseProperties(value: string): KeyValueEntry[] | null {
    const entries: KeyValueEntry[] = [];

    for (const rawLine of value.replace(/^\uFEFF/, "").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || line.startsWith("!")) continue;

        const separatorIndex = findUnescapedEquals(rawLine);
        if (separatorIndex < 0) return null;

        const key = rawLine.slice(0, separatorIndex).trim();
        if (!key) return null;

        entries.push([key, rawLine.slice(separatorIndex + 1).trim()]);
    }

    return entries.length > 0 ? entries : null;
}

export function detectValueFormat(value: string): ValueFormat {
    if (!value.trim()) return "text";

    try {
        JSON.parse(value);
        return "json";
    } catch {
        return parseProperties(value) ? "properties" : "text";
    }
}

/** Returns entries when a JSON object or properties file has scalar values. */
export function parseSimpleKeyValue(value: string): KeyValueEntry[] | null {
    if (detectValueFormat(value) === "properties") {
        return parseProperties(value);
    }

    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null;
        }

        const entries = Object.entries(parsed);
        if (
            entries.every(
                ([, entryValue]) =>
                    typeof entryValue === "string" ||
                    typeof entryValue === "number" ||
                    typeof entryValue === "boolean" ||
                    entryValue === null,
            )
        ) {
            return entries as KeyValueEntry[];
        }
    } catch {
        // Not JSON.
    }

    return null;
}
