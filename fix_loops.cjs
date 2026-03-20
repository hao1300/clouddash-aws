const fs = require("fs");
const path = require("path");

function getFiles(dir, files = []) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            getFiles(fullPath, files);
        } else if (fullPath.endsWith(".svelte")) {
            files.push(fullPath);
        }
    }
    return files;
}

const allSvelteFiles = getFiles("src/routes");

let changedFiles = 0;

for (const file of allSvelteFiles) {
    let content = fs.readFileSync(file, "utf8");

    // Match $effect that has length === 0 check
    // e.g. 
    // $effect(() => {
    //     if (aws.sns && topics.length === 0) {
    //         loadTopics();
    //     }
    // });
    
    // We use a regex that matches the block
    const regex = /\$effect\(\(\) => \{\s*if \((.+?) && ([a-zA-Z0-9_]+)\.length === 0\) \{\s*([a-zA-Z0-9_]+\([^)]*\);)\s*\}\s*\}\);/g;

    let modified = false;
    let newContent = content.replace(regex, (match, condition1, arrName, funcCall) => {
        modified = true;
        // Check if there is already a let __initLoaded nearby, if so skip? 
        // We will just add a unique variable name to avoid conflicts, or standard __initLoaded
        return `let __initLoaded = false;\n    $effect(() => {\n        if (${condition1.trim()} && !__initLoaded) {\n            __initLoaded = true;\n            ${funcCall.trim()}\n        }\n    });`;
    });

    if (modified) {
        fs.writeFileSync(file, newContent, "utf8");
        changedFiles++;
        console.log("Modified", file);
    }
}

console.log("Total files changed:", changedFiles);
