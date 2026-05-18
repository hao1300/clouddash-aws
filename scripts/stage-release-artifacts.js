import fs from 'fs';
import path from 'path';

const DIST_DIR = path.resolve(process.env.CLOUDDASH_DIST_DIR || 'release-dist');
const REPOSITORY = process.env.GITHUB_REPOSITORY || 'hao1300/aws-console';

function readVersion() {
    const config = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
    return config.version;
}

const VERSION = readVersion();
const RELEASE_TAG = process.env.RELEASE_TAG || `v${VERSION}`;
const RELEASE_BASE_URL = `https://github.com/${REPOSITORY}/releases/download/${RELEASE_TAG}`;

function assertExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found: ${filePath}`);
    }
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function findFile(dir, predicate, label) {
    assertExists(dir, label);
    const file = fs.readdirSync(dir).find(predicate);
    if (!file) {
        throw new Error(`${label} not found in ${dir}`);
    }
    return path.join(dir, file);
}

function stageFile(src, assetName) {
    assertExists(src, assetName);
    ensureDir(DIST_DIR);
    const dest = path.join(DIST_DIR, assetName);
    fs.copyFileSync(src, dest);
    console.log(`Staged ${assetName}`);
    return dest;
}

function stageMetadata({ platform, arch, signaturePath, payloadAssetName }) {
    assertExists(signaturePath, `${platform}/${arch} signature`);

    const metadataAssetName = `clouddash-${platform}-${arch}.json`;
    const metadata = {
        version: VERSION,
        pub_date: new Date().toISOString(),
        url: `${RELEASE_BASE_URL}/${payloadAssetName}`,
        signature: fs.readFileSync(signaturePath, 'utf8').trim(),
        notes: `Version ${VERSION} release.`
    };

    ensureDir(DIST_DIR);
    const output = path.join(DIST_DIR, metadataAssetName);
    fs.writeFileSync(output, JSON.stringify(metadata, null, 2));
    console.log(`Staged ${metadataAssetName}`);
}

function stageWindows() {
    const nsisDir = path.join('src-tauri', 'target', 'release', 'bundle', 'nsis');
    const setup = findFile(nsisDir, file => file.includes(VERSION) && file.endsWith('setup.exe'), 'Windows setup executable');
    const sig = findFile(nsisDir, file => file.includes(VERSION) && file.endsWith('setup.exe.sig'), 'Windows updater signature');
    const assetName = 'clouddash-windows-x86_64-setup.exe';

    stageFile(setup, assetName);
    stageMetadata({
        platform: 'windows',
        arch: 'x86_64',
        signaturePath: sig,
        payloadAssetName: assetName
    });
}

function stageLinux() {
    const bundleDir = path.join('src-tauri', 'target', 'release', 'bundle');
    const appImageDir = path.join(bundleDir, 'appimage');

    const appImage = findFile(appImageDir, file => file.endsWith('.AppImage'), 'Linux AppImage');
    const sig = findFile(appImageDir, file => file.endsWith('.AppImage.sig'), 'Linux updater signature');
    const appImageAsset = 'clouddash-linux-x86_64.AppImage';

    stageFile(appImage, appImageAsset);
    stageMetadata({
        platform: 'linux',
        arch: 'x86_64',
        signaturePath: sig,
        payloadAssetName: appImageAsset
    });

    const debDir = path.join(bundleDir, 'deb');
    if (fs.existsSync(debDir)) {
        const deb = fs.readdirSync(debDir).find(file => file.endsWith('.deb'));
        if (deb) stageFile(path.join(debDir, deb), 'clouddash-linux-x86_64.deb');
    }

    const rpmDir = path.join(bundleDir, 'rpm');
    if (fs.existsSync(rpmDir)) {
        const rpm = fs.readdirSync(rpmDir).find(file => file.endsWith('.rpm'));
        if (rpm) stageFile(path.join(rpmDir, rpm), 'clouddash-linux-x86_64.rpm');
    }
}

const MAC_TARGETS = {
    'aarch64-apple-darwin': 'aarch64',
    'x86_64-apple-darwin': 'x86_64'
};

function stageMac(target) {
    const arch = MAC_TARGETS[target];
    if (!arch) {
        throw new Error(`Unsupported macOS target: ${target}`);
    }

    const bundleDir = path.join('src-tauri', 'target', target, 'release', 'bundle');
    const dmgDir = path.join(bundleDir, 'dmg');
    const macosDir = path.join(bundleDir, 'macos');

    const dmg = findFile(dmgDir, file => file.endsWith('.dmg'), `macOS ${arch} DMG`);
    const tar = findFile(macosDir, file => file.endsWith('.app.tar.gz'), `macOS ${arch} updater archive`);
    const sig = findFile(macosDir, file => file.endsWith('.app.tar.gz.sig'), `macOS ${arch} updater signature`);

    const dmgAsset = `clouddash-darwin-${arch}.dmg`;
    const tarAsset = `clouddash-darwin-${arch}.app.tar.gz`;

    stageFile(dmg, dmgAsset);
    stageFile(tar, tarAsset);
    stageMetadata({
        platform: 'darwin',
        arch,
        signaturePath: sig,
        payloadAssetName: tarAsset
    });
}

function findFiles(dir, predicate) {
    if (!fs.existsSync(dir)) return [];

    const results = [];
    for (const item of fs.readdirSync(dir)) {
        const filePath = path.join(dir, item);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            results.push(...findFiles(filePath, predicate));
        } else if (predicate(filePath)) {
            results.push(filePath);
        }
    }
    return results;
}

function stageAndroid() {
    const androidRoot = path.join('src-tauri', 'gen', 'android');
    const apk = findFiles(androidRoot, file => file.endsWith('-release.apk'))[0];
    const aab = findFiles(androidRoot, file => file.endsWith('-release.aab'))[0];

    if (!apk) throw new Error('Android release APK not found');
    stageFile(apk, 'clouddash-android.apk');

    if (aab) {
        stageFile(aab, 'clouddash-android.aab');
    } else {
        console.warn('Android release AAB not found');
    }
}

const kind = process.argv[2];

if (kind === 'windows') {
    stageWindows();
} else if (kind === 'linux') {
    stageLinux();
} else if (kind === 'macos') {
    stageMac(process.argv[3]);
} else if (kind === 'android') {
    stageAndroid();
} else {
    throw new Error('Usage: node scripts/stage-release-artifacts.js <windows|linux|macos|android> [mac-target]');
}
