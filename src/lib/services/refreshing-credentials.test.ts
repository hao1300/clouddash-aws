import { describe, expect, it, vi } from "vitest";
import type { AwsCreds } from "./aws-creds";
import { createRefreshingCredentialProvider } from "./refreshing-credentials";

function creds(accessKey: string, expiration: string): AwsCreds {
    return {
        access_key_id: accessKey,
        secret_access_key: `${accessKey}-secret`,
        session_token: `${accessKey}-token`,
        region: "us-east-1",
        expiration,
    };
}

describe("createRefreshingCredentialProvider", () => {
    it("reuses assumed-role credentials while they are still valid", async () => {
        const refresh = vi.fn();
        const provider = createRefreshingCredentialProvider(
            creds("initial", "2026-08-11T13:00:00.000Z"),
            refresh,
            () => Date.parse("2026-08-11T12:00:00.000Z"),
        );

        const resolved = await provider();

        expect(resolved.accessKeyId).toBe("initial");
        expect(resolved.expiration).toEqual(
            new Date("2026-08-11T13:00:00.000Z"),
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("gets fresh assumed-role credentials before the token expires", async () => {
        const refresh = vi
            .fn()
            .mockResolvedValue(creds("refreshed", "2026-08-11T14:00:00.000Z"));
        const provider = createRefreshingCredentialProvider(
            creds("expired", "2026-08-11T12:00:30.000Z"),
            refresh,
            () => Date.parse("2026-08-11T12:00:00.000Z"),
        );

        const resolved = await provider();

        expect(refresh).toHaveBeenCalledOnce();
        expect(resolved).toMatchObject({
            accessKeyId: "refreshed",
            secretAccessKey: "refreshed-secret",
            sessionToken: "refreshed-token",
        });
    });

    it("shares one refresh across concurrent service requests", async () => {
        let finishRefresh!: (value: AwsCreds) => void;
        const refresh = vi.fn(
            () =>
                new Promise<AwsCreds>((resolve) => {
                    finishRefresh = resolve;
                }),
        );
        const provider = createRefreshingCredentialProvider(
            creds("expired", "2026-08-11T12:00:30.000Z"),
            refresh,
            () => Date.parse("2026-08-11T12:00:00.000Z"),
        );

        const first = provider();
        const second = provider();
        finishRefresh(creds("refreshed", "2026-08-11T14:00:00.000Z"));

        await expect(Promise.all([first, second])).resolves.toEqual([
            expect.objectContaining({ accessKeyId: "refreshed" }),
            expect.objectContaining({ accessKeyId: "refreshed" }),
        ]);
        expect(refresh).toHaveBeenCalledOnce();
    });

    it("allows a failed refresh to be retried", async () => {
        const refresh = vi
            .fn()
            .mockRejectedValueOnce(new Error("temporary failure"))
            .mockResolvedValueOnce(
                creds("refreshed", "2026-08-11T14:00:00.000Z"),
            );
        const provider = createRefreshingCredentialProvider(
            creds("expired", "2026-08-11T12:00:30.000Z"),
            refresh,
            () => Date.parse("2026-08-11T12:00:00.000Z"),
        );

        await expect(provider()).rejects.toThrow("temporary failure");
        await expect(provider()).resolves.toMatchObject({
            accessKeyId: "refreshed",
        });
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
