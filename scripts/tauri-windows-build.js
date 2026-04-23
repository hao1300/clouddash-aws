import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { updateWebVersion } from './utils.js';

const CONFIG_PATH = 'src-tauri/tauri.conf.json';
const RELEASE_ROOT = 'c:/CS/aws-console-releases';
const RELEASE_DIR = path.join(RELEASE_ROOT, 'downloads/windows');
const NSIS_DIR = 'src-tauri/target/release/bundle/nsis';

function getVersion() {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return config.version;
}

function run(command) {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
}

try {
    const version = getVersion();
    console.log(`Building CloudDash Windows version ${version}...`);

    run('npx tauri build');

    if (!fs.existsSync(RELEASE_DIR)) {
        console.log(`Creating release directory: ${RELEASE_DIR}`);
        fs.mkdirSync(RELEASE_DIR, { recursive: true });
    }

    // Find the setup exe matching the version
    let setupExe = null;
    if (fs.existsSync(NSIS_DIR)) {
        const files = fs.readdirSync(NSIS_DIR);
        setupExe = files.find(f => f.includes(version) && f.endsWith('setup.exe'));
    }

    const dest = path.join(RELEASE_DIR, `clouddash-${version}-setup.exe`);

    if (setupExe) {
        const src = path.join(NSIS_DIR, setupExe);
        console.log(`Copying Windows Setup: ${src} -> ${dest}`);
        fs.copyFileSync(src, dest);
    } else {
        console.warn(`Warning: No setup exe found in ${NSIS_DIR} matching version ${version}, searching in target/release...`);
        const releaseDir = 'src-tauri/target/release';
        if (fs.existsSync(releaseDir)) {
            const files = fs.readdirSync(releaseDir);
            const altExe = files.find(f => f.endsWith('.exe'));
            if (altExe) {
                const src = path.join(releaseDir, altExe);
                console.log(`Copying alternative EXE: ${src} -> ${dest}`);
                fs.copyFileSync(src, dest);
            } else {
                console.error('Error: Could not find any release EXE');
                process.exit(1);
            }
        } else {
            console.error(`Error: Directory not found: ${releaseDir}`);
            process.exit(1);
        }
    }

    updateWebVersion(version);

    console.log('--------------------------------------------------');
    console.log('Build complete!');
} catch (error) {
    console.error('Error during build:', error.message);
    process.exit(1);
}
