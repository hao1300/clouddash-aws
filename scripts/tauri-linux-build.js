import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { updateWebVersion, uploadToR2, generateUpdateMetadata } from './utils.js';

const CONFIG_PATH = 'src-tauri/tauri.conf.json';
const BUNDLE_DIR = 'src-tauri/target/release/bundle';

function getVersion() {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config.version;
}

function run(command) {
    console.log(`Running: ${command}`);
    execSync(command, { 
        stdio: 'inherit',
        env: process.env
    });
}

async function copyBundle(ext, subdir, version) {
    const dir = path.join(BUNDLE_DIR, subdir);
    if (!fs.existsSync(dir)) {
        console.warn(`Warning: Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);
    const targetFile = files.find(f => f.endsWith(`.${ext}`));

    if (targetFile) {
        const src = path.join(dir, targetFile);
        const destPath = `downloads/linux/clouddash-${version}.${ext}`;
        await uploadToR2(src, destPath);
    } else {
        console.warn(`Warning: No ${ext} bundle found in ${dir}`);
    }
}

async function main() {
    try {
        const version = getVersion();
        console.log(`Building CloudDash version ${version}...`);

        const skipBuild = process.argv.includes('--skip-build');
        if (!skipBuild) {
            run('npm run tauri-build');
        } else {
            console.log('Skipping build step...');
        }

        await copyBundle('AppImage', 'appimage', version);
        await copyBundle('deb', 'deb', version);
        await copyBundle('rpm', 'rpm', version);

        updateWebVersion(version, 'linux');

        // Generate update metadata for Linux (AppImage)
        const appImageDir = path.join(BUNDLE_DIR, 'appimage');
        if (fs.existsSync(appImageDir)) {
            const files = fs.readdirSync(appImageDir);
            const sigFile = files.find(f => f.endsWith('.AppImage.sig'));
            if (sigFile) {
                const signaturePath = path.join(appImageDir, sigFile);
                generateUpdateMetadata('linux', version, signaturePath, `https://static.clouddash.dev/downloads/linux/clouddash-${version}.AppImage`);
            }
        }

        console.log('--------------------------------------------------');
        console.log('Build complete!');
    } catch (error) {
        console.error('Error during build:', error.message);
        process.exit(1);
    }
}

main();
