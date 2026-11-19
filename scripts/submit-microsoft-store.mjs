import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const productId = '9NTQGXWN04TD';
const applicationUrl = `https://manage.devcenter.microsoft.com/v1.0/my/applications/${productId}`;
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const storePrice = /^(?:Free|Tier\d+)$/;
const acceptedStatuses = new Set(['PreProcessing', 'Certification', 'PendingPublication', 'Release', 'Publishing', 'Published']);
const failedStatuses = new Set(['CommitFailed', 'PreProcessingFailed', 'CertificationFailed', 'ReleaseFailed', 'PublishFailed', 'Canceled']);

function parseVersion(version) {
    if (!/^\d{1,5}(\.\d{1,5}){3}$/.test(version)) {
        throw new Error(`Invalid MSIX version: ${version}.`);
    }
    const components = version.split('.').map(Number);
    if (components.some(component => component > 65535)) {
        throw new Error(`Invalid MSIX version: ${version}.`);
    }
    return components;
}

function compareVersions(candidate, current) {
    const currentVersion = parseVersion(current);
    return candidate.reduce((difference, value, index) => difference || (value - currentVersion[index]), 0);
}

function x64Packages(submission) {
    const packages = submission.applicationPackages?.filter(pkg => pkg.architecture?.toLowerCase() === 'x64');
    if (!packages?.length || packages.some(pkg => pkg.fileStatus !== 'Uploaded')) {
        throw new Error('Expected an existing, uploaded x64 package in Partner Center.');
    }
    return packages;
}

export async function submitStore(
    { tenant, client, secret, zipPath, fileName, version },
    { fetchImpl = fetch, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {},
) {
    if (!tenant || !client || !secret) {
        throw new Error('Configure MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, and MSSTORE_CLIENT_SECRET in the microsoft-store GitHub environment.');
    }
    if (!guid.test(tenant) || !guid.test(client)) {
        throw new Error('Expected valid Microsoft Entra tenant and client IDs.');
    }
    const packageVersion = parseVersion(version);
    if (!zipPath || packageVersion[0] === 0 || packageVersion[3] !== 0 || fileName !== `clouddash-windows-${version}-x64.msix`) {
        throw new Error('Invalid Microsoft Store package details.');
    }
    const archive = await readFile(zipPath);

    const auth = await fetchImpl(`https://login.microsoftonline.com/${tenant}/oauth2/token`, {
        method: 'POST',
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: client,
            client_secret: secret,
            resource: 'https://manage.devcenter.microsoft.com',
        }),
        signal: AbortSignal.timeout(60_000),
    });
    if (!auth.ok) throw new Error(`Entra authentication failed (HTTP ${auth.status}).`);
    const { access_token: accessToken } = await auth.json();
    if (!accessToken) throw new Error('Entra did not return an access token.');

    async function request(path = '', method = 'GET', body) {
        const headers = { Authorization: `Bearer ${accessToken}` };
        if (body) headers['Content-Type'] = 'application/json';
        const response = await fetchImpl(`${applicationUrl}${path}`, {
            method,
            headers,
            body: body && JSON.stringify(body),
            signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`Microsoft Store request ${method} ${path || '/'} failed (HTTP ${response.status}).`);
        if (path.endsWith('/commit')) return;
        return response.json();
    }

    const app = await request();
    const publishedId = app.lastPublishedApplicationSubmission?.id;
    if (!/^\d+$/.test(publishedId)) {
        throw new Error('Wait for the first CloudDash submission to publish in Partner Center before submitting updates.');
    }
    if (app.pendingApplicationSubmission) {
        throw new Error('CloudDash already has a pending Store submission. Inspect it in Partner Center before submitting another update.');
    }

    const published = await request(`/submissions/${publishedId}`);
    const comparisons = x64Packages(published).map(pkg => compareVersions(packageVersion, pkg.version));
    if (comparisons.some(result => result < 0)) throw new Error(`Windows x64 version ${version} is older than the published Store package.`);
    if (comparisons.includes(0)) {
        console.log(`Windows x64 version ${version} is already published in Microsoft Store.`);
        return;
    }
    if (!storePrice.test(published.pricing?.priceId)) {
        throw new Error('The Store API did not return a usable base price. Inspect pricing in Partner Center before uploading this update.');
    }

    const draft = await request('/submissions', 'POST');
    const submissionId = draft.id;
    if (!/^\d+$/.test(submissionId) || submissionId === publishedId) {
        throw new Error('Microsoft Store did not return a new submission ID. Inspect Partner Center before retrying.');
    }
    const submissionPath = `/submissions/${submissionId}`;
    try {
        if (!isDeepStrictEqual(draft.pricing, published.pricing)) {
            throw new Error('The new draft did not inherit the published pricing.');
        }
        const replacements = new Set(x64Packages(draft));
        if ([...replacements].some(pkg => compareVersions(packageVersion, pkg.version) <= 0)) {
            throw new Error('The new draft contains an x64 package at the same or a newer version.');
        }

        const packageList = draft.applicationPackages.map(pkg => replacements.has(pkg) ? { ...pkg, fileStatus: 'PendingDelete' } : pkg);
        packageList.push({ fileName, fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' });
        const metadata = { ...draft, targetPublishMode: 'Immediate', applicationPackages: packageList };
        delete metadata.targetPublishDate;
        delete metadata.fileUploadUrl;

        const uploadUrl = URL.parse(draft.fileUploadUrl);
        if (!uploadUrl || uploadUrl.protocol !== 'https:' || !uploadUrl.hostname.endsWith('.blob.core.windows.net')) {
            throw new Error('Microsoft Store did not return a valid package upload destination.');
        }
        const updated = await request(submissionPath, 'PUT', metadata);
        if (updated.targetPublishMode !== 'Immediate' || !isDeepStrictEqual(updated.pricing, published.pricing)) {
            throw new Error('Microsoft Store did not confirm the existing pricing and automatic publishing.');
        }

        let upload;
        try {
            upload = await fetchImpl(uploadUrl, {
                method: 'PUT',
                headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/zip' },
                body: archive,
                redirect: 'error',
                signal: AbortSignal.timeout(120_000),
            });
        } catch {
            throw new Error('The package upload failed.');
        }
        if (!upload.ok) throw new Error(`The package upload failed (HTTP ${upload.status}).`);

        await request(`${submissionPath}/commit`, 'POST');
        for (let attempt = 0; attempt < 60; attempt++) {
            const { status } = await request(`${submissionPath}/status`);
            if (failedStatuses.has(status)) throw new Error(`Microsoft Store reported ${status}.`);
            if (acceptedStatuses.has(status)) {
                console.log(`Microsoft Store submission ${submissionId}: ${status}. Store publishing will start after certification passes.`);
                return;
            }
            await delay(10_000);
        }
        throw new Error('Timed out waiting for Microsoft Store to accept the submission.');
    } catch (error) {
        throw new Error(`Microsoft Store draft ${submissionId} may require attention in Partner Center: ${error.message}`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await submitStore({
            tenant: process.env.MSSTORE_TENANT_ID,
            client: process.env.MSSTORE_CLIENT_ID,
            secret: process.env.MSSTORE_CLIENT_SECRET,
            zipPath: process.env.MSSTORE_ZIP_PATH,
            fileName: process.env.MSSTORE_PACKAGE_NAME,
            version: process.env.MSSTORE_PACKAGE_VERSION,
        });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
