import { describe, expect, it } from "vitest";
import {
    detectValueFormat,
    parseProperties,
    parseSimpleKeyValue,
} from "./value-format";
import { highlightStructuredValue } from "./json-highlight";

describe("detectValueFormat", () => {
    it("detects valid JSON values", () => {
        expect(detectValueFormat('{"host":"localhost"}')).toBe("json");
        expect(detectValueFormat("[1, 2, 3]")).toBe("json");
    });

    it("detects key=value properties files", () => {
        const value = "# database settings\nhost=localhost\nport=5432";
        expect(detectValueFormat(value)).toBe("properties");
    });

    it("leaves arbitrary and partially malformed content as text", () => {
        expect(detectValueFormat("plain text")).toBe("text");
        expect(detectValueFormat("host=localhost\nmissing separator")).toBe(
            "text",
        );
    });
});

describe("parseProperties", () => {
    it("ignores blank lines and comments and splits on the first equals sign", () => {
        expect(
            parseProperties(
                "# comment\n\nendpoint = https://example.com?a=b\n! disabled",
            ),
        ).toEqual([["endpoint", "https://example.com?a=b"]]);
    });

    it("does not treat an escaped equals sign as the separator", () => {
        expect(parseProperties("escaped\\=key=value")).toEqual([
            ["escaped\\=key", "value"],
        ]);
    });
});

describe("parseSimpleKeyValue", () => {
    it("returns scalar JSON object entries", () => {
        expect(parseSimpleKeyValue('{"enabled":true,"retries":3}')).toEqual([
            ["enabled", true],
            ["retries", 3],
        ]);
    });

    it("returns properties entries", () => {
        expect(parseSimpleKeyValue("user=admin\npassword=secret")).toEqual([
            ["user", "admin"],
            ["password", "secret"],
        ]);
    });

    it("rejects nested JSON values", () => {
        expect(parseSimpleKeyValue('{"database":{"host":"localhost"}}')).toBe(
            null,
        );
    });
});

describe("highlightStructuredValue", () => {
    it("highlights properties keys and values", () => {
        const highlighted = highlightStructuredValue("host=localhost");

        expect(highlighted).toContain("hljs-attr");
        expect(highlighted).toContain("hljs-string");
    });

    it("HTML-escapes plain-text values", () => {
        expect(highlightStructuredValue("<script>alert(1)</script>")).not.toContain(
            "<script>",
        );
    });
});
