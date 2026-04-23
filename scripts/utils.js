import fs from 'fs';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-provider-ini';

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

export async function uploadToR2(src, destPath) {
    const bucket = "static-clouddash-dev";
    const endpoint = "https://9e5d25b88e77c04686ef4f03124ee940.r2.cloudflarestorage.com";
    const profile = "chromestatsr2";
    
    console.log(`Uploading to R2: ${src} -> s3://${bucket}/${destPath}`);
    
    const client = new S3Client({
        region: "auto",
        endpoint: endpoint,
        credentials: fromIni({ profile: profile }),
    });

    try {
        // Check if file already exists
        try {
            await client.send(new HeadObjectCommand({
                Bucket: bucket,
                Key: destPath,
            }));
            console.error(`Error: File already exists at s3://${bucket}/${destPath}`);
            process.exit(1);
        } catch (error) {
            if (error.name !== 'NotFound' && error.$metadata?.httpStatusCode !== 404) {
                throw error;
            }
            // File does not exist, proceed with upload
        }

        const fileStream = fs.createReadStream(src);
        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: destPath,
            Body: fileStream,
            ChecksumAlgorithm: "CRC32",
        }));
        
        console.log(`Successfully uploaded to R2: s3://${bucket}/${destPath}`);
    } catch (error) {
        console.error(`Failed to upload to R2: ${error.message}`);
        process.exit(1);
    }
}

