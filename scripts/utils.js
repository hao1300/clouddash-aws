import fs from 'fs';

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
