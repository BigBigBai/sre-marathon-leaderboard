import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const config = JSON.parse(await fs.readFile(path.join(root, 'src/site.config.json'), 'utf8'));
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.cp(path.join(root, 'public'), output, { recursive: true });
await fs.cp(path.join(root, 'data'), path.join(output, 'data'), { recursive: true });
await fs.cp(path.join(root, 'src'), path.join(output, 'src'), { recursive: true });
const escapeHTML = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let html = await fs.readFile(path.join(root, 'src/index.html'), 'utf8');
html = html.replaceAll('__DESCRIPTION__', escapeHTML(config.description)).replaceAll('__PUBLIC_URL__', escapeHTML(config.publicUrl));
await fs.writeFile(path.join(output, 'index.html'), html);
await fs.rm(path.join(output, 'src/index.html'));
await fs.writeFile(path.join(output, '.nojekyll'), '');
console.log('Built SRE-Marathon paper site in dist/ (no external runtime dependencies).');
