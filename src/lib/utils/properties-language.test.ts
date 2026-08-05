import { classHighlighter, highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { propertiesLanguage } from "./properties-language";

function highlightedTokens(value: string) {
    const tokens: Array<{ text: string; classes: string }> = [];
    const tree = propertiesLanguage.parser.parse(value);

    highlightTree(tree, classHighlighter, (from, to, classes) => {
        tokens.push({ text: value.slice(from, to), classes });
    });

    return tokens;
}

describe("propertiesLanguage", () => {
    it("highlights properties keys, values, and comments", () => {
        expect(highlightedTokens("# database\nhost=localhost")).toEqual([
            { text: "# database", classes: "tok-comment" },
            { text: "host", classes: "tok-propertyName" },
            { text: "localhost", classes: "tok-string" },
        ]);
    });

    it("keeps escaped equals signs in keys", () => {
        expect(highlightedTokens("escaped\\=key=value")).toEqual([
            { text: "escaped\\=key", classes: "tok-propertyName" },
            { text: "value", classes: "tok-string" },
        ]);
    });
});
