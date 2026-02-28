/**
 * Shared helper to get an AWS JS SDK credential object from the Rust backend.
 * Rust resolves the full credential chain (profiles, SSO, assumed roles, etc.)
 * and hands back raw keys for the JS SDK to use.
 */
import { invoke } from "@tauri-apps/api/core";

export interface AwsCreds {
    access_key_id: string;
    secret_access_key: string;
    session_token: string | null;
    region: string;
}

export async function getAwsCredentials(): Promise<AwsCreds> {
    return await invoke("get_credentials");
}
