import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-provider-ini';

export function updateWebVersion(version, platform = null) {
    const webPath = 'clouddash-web/src/routes/download/+page.svelte';
    if (!fs.existsSync(webPath)) {
        console.warn(`Warning: Web download page not found at ${webPath}`);
        return;
    }

    let content = fs.readFileSync(webPath, 'utf8');
    
    // Update versions in links
    if (!platform || platform === 'windows') {
        content = content.replace(/downloads\/windows\/clouddash-[\d.]+-setup\.exe/g, `downloads/windows/clouddash-${version}-setup.exe`);
    }
    if (!platform || platform === 'android') {
        content = content.replace(/downloads\/android\/clouddash-[\d.]+\.apk/g, `downloads/android/clouddash-${version}.apk`);
    }
    if (!platform || platform === 'linux') {
        content = content.replace(/downloads\/linux\/clouddash-[\d.]+\.AppImage/g, `downloads/linux/clouddash-${version}.AppImage`);
    }
    
    fs.writeFileSync(webPath, content);
    console.log(`Updated ${webPath} (${platform || 'all platforms'}) to version ${version}`);
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.apk': 'application/vnd.android.package-archive',
        '.exe': 'application/x-msdownload',
        '.appimage': 'application/x-executable',
        '.deb': 'application/vnd.debian.binary-package',
        '.rpm': 'application/x-rpm',
        '.zip': 'application/zip',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

export async function uploadToR2(src, destPath, contentType = null) {
    const bucket = "static-clouddash-dev";
    const endpoint = "https://9e5d25b88e77c04686ef4f03124ee940.r2.cloudflarestorage.com";
    const profile = "chromestatsr2";
    
    const finalContentType = contentType || getMimeType(src);
    
    console.log(`Uploading to R2: ${src} -> s3://${bucket}/${destPath} (${finalContentType})`);
    
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
            ContentType: finalContentType,
            ChecksumAlgorithm: "CRC32",
        }));
        
        console.log(`Successfully uploaded to R2: s3://${bucket}/${destPath}`);
    } catch (error) {
        console.error(`Failed to upload to R2: ${error.message}`);
        process.exit(1);
    }
}

