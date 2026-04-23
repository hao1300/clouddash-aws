import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { updateWebVersion } from './utils.js';

const CONFIG_PATH = 'src-tauri/tauri.conf.json';
const RELEASE_ROOT = 'c:/CS/aws-console-releases';
const RELEASE_DIR = path.join(RELEASE_ROOT, 'downloads/android');
const STORE_DIR = path.join(RELEASE_ROOT, 'store');
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

function copyFile(src, dest) {
    if (fs.existsSync(src)) {
        console.log(`Copying: ${src} -> ${dest}`);
        fs.copyFileSync(src, dest);
        return true;
    }
    return false;
}

function findAndCopy(searchDir, pattern, dest) {
    if (!fs.existsSync(searchDir)) return false;
    
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
        console.log(`Copying alternative file: ${files[0]} -> ${dest}`);
        fs.copyFileSync(files[0], dest);
        return true;
    }
    return false;
}

try {
    const version = getVersion();
    console.log(`Building CloudDash Android version ${version}...`);

    run('npx tauri android build');

    [RELEASE_DIR, STORE_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            console.log(`Creating directory: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Copy APK
    const apkDest = path.join(RELEASE_DIR, `clouddash-${version}.apk`);
    if (!copyFile(APK_PATH, apkDest)) {
        console.warn(`Warning: No APK found at ${APK_PATH}, searching for alternatives...`);
        if (!findAndCopy('src-tauri/gen/android', '-release.apk', apkDest)) {
            console.error('Error: Could not find any release APK');
            process.exit(1);
        }
    }

    // Copy AAB
    const aabDest = path.join(STORE_DIR, `clouddash-${version}.aab`);
    if (!copyFile(AAB_PATH, aabDest)) {
        console.warn(`Warning: No AAB found at ${AAB_PATH}, searching for alternatives...`);
        findAndCopy('src-tauri/gen/android', '-release.aab', aabDest);
    }

    updateWebVersion(version);

    console.log('--------------------------------------------------');
    console.log('Build complete!');
} catch (error) {
    console.error('Error during build:', error.message);
    process.exit(1);
}
