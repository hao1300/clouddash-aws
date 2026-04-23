import fs from 'fs';
import { execSync } from 'child_process';

export function updateWebVersion(version) {
    const webPath = 'clouddash-web/src/routes/download/+page.svelte';
    if (!fs.existsSync(webPath)) {
        console.warn(`Warning: Web download page not found at ${webPath}`);
        return;
    }

    let content = fs.readFileSync(webPath, 'utf8');
    
    // Update versions in links
    content = content.replace(/downloads\/windows\/clouddash-[\d.]+-setup\.exe/g, `downloads/windows/clouddash-${version}-setup.exe`);
    content = content.replace(/downloads\/android\/clouddash-[\d.]+\.apk/g, `downloads/android/clouddash-${version}.apk`);
    content = content.replace(/downloads\/linux\/clouddash-[\d.]+\.AppImage/g, `downloads/linux/clouddash-${version}.AppImage`);
    
    fs.writeFileSync(webPath, content);
    console.log(`Updated ${webPath} to version ${version}`);
}

export function uploadToR2(src, destPath) {
    const bucket = "static-clouddash-dev";
    const endpoint = "https://9e5d25b88e77c04686ef4f03124ee940.r2.cloudflarestorage.com";
    const profile = "chromestatsr2";
    
    const command = `aws --profile ${profile} --region=auto s3 cp "${src}" "s3://${bucket}/${destPath}" --checksum-algorithm CRC32 --endpoint-url=${endpoint}`;
    
    console.log(`Uploading to R2: ${command}`);
    try {
        execSync(command, { stdio: 'inherit' });
    } catch (error) {
        console.error(`Failed to upload to R2: ${error.message}`);
        process.exit(1);
    }
}

