import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { updateWebVersion, uploadToR2 } from './utils.js';

const CONFIG_PATH = 'src-tauri/tauri.conf.json';
const APK_PATH = 'src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk';
const AAB_PATH = 'src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab';

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

async function uploadIfExists(src, destPath) {
    if (fs.existsSync(src)) {
        await uploadToR2(src, destPath);
        return src;
    }
    return null;
}

function findFiles(dir, pattern) {
    if (!fs.existsSync(dir)) return [];
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(findFiles(filePath, pattern));
        } else if (file.includes(pattern)) {
            results.push(filePath);
        }
    });
    return results;
}

async function findAndUpload(searchDir, pattern, destPath) {
    const files = findFiles(searchDir, pattern);
    if (files.length > 0) {
        await uploadToR2(files[0], destPath);
        return files[0];
    }
    return null;
}

async function main() {
    try {
        const version = getVersion();
        console.log(`Building CloudDash Android version ${version}...`);

        const skipBuild = process.argv.includes('--skip-build');
        if (!skipBuild) {
            run('npx tauri android build');
        } else {
            console.log('Skipping build step...');
        }

        // Upload APK
        const apkDestPath = `downloads/android/clouddash-${version}.apk`;
        if (!await uploadIfExists(APK_PATH, apkDestPath)) {
            console.warn(`Warning: No APK found at ${APK_PATH}, searching for alternatives...`);
            if (!await findAndUpload('src-tauri/gen/android', '-release.apk', apkDestPath)) {
                console.error('Error: Could not find any release APK');
                process.exit(1);
            }
        }

        // Handle AAB (Skip upload to R2, just copy to root)
        const aabFileName = `clouddash-${version}.aab`;
        let foundAab = fs.existsSync(AAB_PATH) ? AAB_PATH : null;
        if (!foundAab) {
            console.warn(`Warning: No AAB found at ${AAB_PATH}, searching for alternatives...`);
            const files = findFiles('src-tauri/gen/android', '-release.aab');
            if (files.length > 0) foundAab = files[0];
        }

        if (foundAab) {
            fs.copyFileSync(foundAab, aabFileName);
            console.log(`Copied AAB to root: ${aabFileName} (Skipped R2 upload)`);
        } else {
            console.warn('Warning: Could not find any release AAB');
        }

        updateWebVersion(version, 'android');

        console.log('--------------------------------------------------');
        console.log('Build complete!');
    } catch (error) {
        console.error('Error during build:', error.message);
        process.exit(1);
    }
}

main();
