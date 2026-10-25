// node tools/package.mjs  ->  dist/ with only the files the site needs
import { cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
['index.html', 'favicon.svg', 'events.json', 'css', 'js', 'audio', 'data'].forEach(f => cpSync(join(root, f), join(out, f), { recursive: true }));
writeFileSync(join(out, '.nojekyll'), '');
console.log('dist ready');
