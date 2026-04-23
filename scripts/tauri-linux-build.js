import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { updateWebVersion } from './utils.js';

const CONFIG_PATH = 'src-tauri/tauri.conf.json';
const RELEASE_ROOT = '/mnt/c/CS/aws-console-releases';
const RELEASE_DIR = path.join(RELEASE_ROOT, 'downloads/linux');
const BUNDLE_DIR = 'src-tauri/target/release/bundle';

function getVersion() {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config.version;
}

function run(command) {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
}

function copyBundle(ext, subdir, version) {
    const dir = path.join(BUNDLE_DIR, subdir);
    if (!fs.existsSync(dir)) {
        console.warn(`Warning: Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);
    const targetFile = files.find(f => f.endsWith(`.${ext}`));

    if (targetFile) {
        const src = path.join(dir, targetFile);
        const dest = path.join(RELEASE_DIR, `clouddash-${version}.${ext}`);
        console.log(`Copying ${ext} bundle: ${src} -> ${dest}`);
        fs.copyFileSync(src, dest);
    } else {
        console.warn(`Warning: No ${ext} bundle found in ${dir}`);
    }
}

try {
    const version = getVersion();
    console.log(`Building CloudDash version ${version}...`);

    run('npm run tauri-build');

    if (!fs.existsSync(RELEASE_DIR)) {
        console.log(`Creating release directory: ${RELEASE_DIR}`);
        fs.mkdirSync(RELEASE_DIR, { recursive: true });
    }

    copyBundle('AppImage', 'appimage', version);
    copyBundle('deb', 'deb', version);
    copyBundle('rpm', 'rpm', version);

    updateWebVersion(version);

    console.log('--------------------------------------------------');
    console.log('Build complete!');
    console.log(`Packages available in ${RELEASE_DIR}`);
} catch (error) {
    console.error('Error during build:', error.message);
    process.exit(1);
}
