import { compile } from 'svelte/compiler';
import fs from 'fs';

const code = fs.readFileSync('c:/CS/aws-console/src/routes/ec2/elastic-ips/+page.svelte', 'utf-8');
try {
    compile(code);
    console.log('SUCCESS: Svelte compilation successful');
} catch (err) {
    console.error('ERROR: Svelte compilation failed');
    console.error(err.message);
    process.exit(1);
}
