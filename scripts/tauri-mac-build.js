import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { updateWebVersion, uploadToR2, generateUpdateMetadata } from './utils.js';

const CONFIG_PATH = 'src-tauri/tauri.conf.json';
const TARGET = 'universal-apple-darwin';
const BUNDLE_DIR = `src-tauri/target/${TARGET}/release/bundle`;
const DMG_DIR = path.join(BUNDLE_DIR, 'dmg');
const MACOS_DIR = path.join(BUNDLE_DIR, 'macos');

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

async function main() {
    try {
        const version = getVersion();
        console.log(`Building CloudDash macOS (universal) version ${version}...`);

        const skipBuild = process.argv.includes('--skip-build');
        if (!skipBuild) {
            run(`npx tauri build --target ${TARGET}`);
        } else {
            console.log('Skipping build step...');
        }

        // Upload the .dmg (user-facing download)
        if (!fs.existsSync(DMG_DIR)) {
            console.error(`Error: Directory not found: ${DMG_DIR}`);
            process.exit(1);
        }
        const dmgFile = fs.readdirSync(DMG_DIR).find(f => f.endsWith('.dmg'));
        if (!dmgFile) {
            console.error(`Error: No .dmg found in ${DMG_DIR}`);
            process.exit(1);
        }
        const dmgDest = `downloads/macos/clouddash-${version}.dmg`;
        await uploadToR2(path.join(DMG_DIR, dmgFile), dmgDest);

        // Upload the .app.tar.gz (updater payload)
        if (!fs.existsSync(MACOS_DIR)) {
            console.warn(`Warning: Directory not found: ${MACOS_DIR}, skipping updater artifacts`);
        } else {
            const macFiles = fs.readdirSync(MACOS_DIR);
            const tarFile = macFiles.find(f => f.endsWith('.app.tar.gz'));
            const sigFile = macFiles.find(f => f.endsWith('.app.tar.gz.sig'));

            if (tarFile) {
                const tarDest = `downloads/macos/clouddash-${version}.app.tar.gz`;
                await uploadToR2(path.join(MACOS_DIR, tarFile), tarDest);

                if (sigFile) {
                    const sigPath = path.join(MACOS_DIR, sigFile);
                    const tarUrl = `https://static.clouddash.dev/${tarDest}`;
                    // Tauri's updater queries with the host arch — serve the same
                    // universal artifact for both aarch64 and x86_64.
                    generateUpdateMetadata('darwin', version, sigPath, tarUrl, 'aarch64');
                    generateUpdateMetadata('darwin', version, sigPath, tarUrl, 'x86_64');
                } else {
                    console.warn('Warning: No .app.tar.gz.sig found; skipping updater metadata.');
                }
            } else {
                console.warn(`Warning: No .app.tar.gz found in ${MACOS_DIR}; skipping updater artifacts.`);
            }
        }

        updateWebVersion(version, 'macos');

        console.log('--------------------------------------------------');
        console.log('Build complete!');
    } catch (error) {
        console.error('Error during build:', error.message);
        process.exit(1);
    }
}

main();
