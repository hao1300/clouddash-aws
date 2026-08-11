import type { AwsCreds } from "./aws-creds";

export interface AwsCredentialIdentity {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
}

export type RefreshAwsCredentials = () => Promise<AwsCreds>;

// Match the AWS SDK's own early-expiration window so the first refresh request
// from any service client replaces the credentials instead of returning the
// same nearly-expired identity.
const REFRESH_WINDOW_MS = 5 * 60_000;

function expirationTime(creds: AwsCreds): number | null {
    if (!creds.expiration) return null;

    const expiresAt = Date.parse(creds.expiration);
    return Number.isNaN(expiresAt) ? null : expiresAt;
}

function toCredentialIdentity(creds: AwsCreds): AwsCredentialIdentity {
    const identity: AwsCredentialIdentity = {
        accessKeyId: creds.access_key_id,
        secretAccessKey: creds.secret_access_key,
        sessionToken: creds.session_token || undefined,
    };
    const expiresAt = expirationTime(creds);
    if (expiresAt !== null) identity.expiration = new Date(expiresAt);
    return identity;
}

/**
 * Builds one credential provider shared by every AWS service client.
 *
 * STS credentials include an expiration time. Shortly before that time this
 * provider calls the supplied refresh function once, even when several clients
 * make requests concurrently, and all clients then use the new credentials.
 */
export function createRefreshingCredentialProvider(
    initial: AwsCreds,
    refresh?: RefreshAwsCredentials,
    now: () => number = Date.now,
): () => Promise<AwsCredentialIdentity> {
    let current = initial;
    let pendingRefresh: Promise<AwsCreds> | null = null;

    return async () => {
        const expiresAt = expirationTime(current);
        const needsRefresh =
            refresh !== undefined &&
            expiresAt !== null &&
            expiresAt <= now() + REFRESH_WINDOW_MS;

        if (needsRefresh) {
            if (!pendingRefresh) {
                pendingRefresh = refresh().then((creds) => {
                    current = creds;
                    return creds;
                });
            }

            try {
                await pendingRefresh;
            } finally {
                pendingRefresh = null;
            }
        }

        return toCredentialIdentity(current);
    };
}
