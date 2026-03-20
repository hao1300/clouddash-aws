const fs = require("fs");
const glob = require("glob");

const files = glob.sync("src/routes/**/*.svelte");

let changedFiles = 0;

for (const file of files) {
    let content = fs.readFileSync(file, "utf8");

    const regex = /\$effect\(\(\) => \{\s*if \((.+?) && ([a-zA-Z0-9_]+)\.length === 0\) \{\s*([a-zA-Z0-9_]+\(\);)\s*\}\s*\}\);/g;

    let modified = false;
    let newContent = content.replace(regex, (match, condition1, arrName, funcCall) => {
        modified = true;
        return `let __initLoaded = false;\n    $effect(() => {\n        if (${condition1} && !__initLoaded) {\n            __initLoaded = true;\n            ${funcCall}\n        }\n    });`;
    });

    if (modified) {
        fs.writeFileSync(file, newContent, "utf8");
        changedFiles++;
        console.log("Modified", file);
    }
}

console.log("Total files changed:", changedFiles);
