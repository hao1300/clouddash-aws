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
    execSync(command, { stdio: 'inherit' });
}

function uploadIfExists(src, destPath) {
    if (fs.existsSync(src)) {
        uploadToR2(src, destPath);
        return src;
    }
    return null;
}

function findAndUpload(searchDir, pattern, destPath) {
    if (!fs.existsSync(searchDir)) return null;
    
    const findFiles = (dir) => {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(findFiles(filePath));
            } else if (file.includes(pattern)) {
                results.push(filePath);
            }
        });
        return results;
    };

    const files = findFiles(searchDir);
    if (files.length > 0) {
        uploadToR2(files[0], destPath);
        return files[0];
    }
    return null;
}

try {
    const version = getVersion();
    console.log(`Building CloudDash Android version ${version}...`);

    run('npx tauri android build');

    // Upload APK
    const apkDestPath = `downloads/android/clouddash-${version}.apk`;
    if (!uploadIfExists(APK_PATH, apkDestPath)) {
        console.warn(`Warning: No APK found at ${APK_PATH}, searching for alternatives...`);
        if (!findAndUpload('src-tauri/gen/android', '-release.apk', apkDestPath)) {
            console.error('Error: Could not find any release APK');
            process.exit(1);
        }
    }

    // Handle AAB
    const aabFileName = `clouddash-${version}.aab`;
    const aabDestPath = `store/${aabFileName}`;
    let foundAab = uploadIfExists(AAB_PATH, aabDestPath);
    if (!foundAab) {
        console.warn(`Warning: No AAB found at ${AAB_PATH}, searching for alternatives...`);
        foundAab = findAndUpload('src-tauri/gen/android', '-release.aab', aabDestPath);
    }

    if (foundAab) {
        fs.copyFileSync(foundAab, aabFileName);
        console.log(`Copied AAB to root: ${aabFileName}`);
    } else {
        console.warn('Warning: Could not find any release AAB');
    }

    updateWebVersion(version);

    console.log('--------------------------------------------------');
    console.log('Build complete!');
} catch (error) {
    console.error('Error during build:', error.message);
    process.exit(1);
}
