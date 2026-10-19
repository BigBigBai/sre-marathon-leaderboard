import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const config = JSON.parse(await fs.readFile(path.join(root, 'src/site.config.json'), 'utf8'));
await fs.mkdir(output, { recursive: true });
await fs.cp(path.join(root, 'vendor/site'), output, { recursive: true });
await fs.cp(path.join(root, 'data'), path.join(output, 'data'), { recursive: true });
await fs.mkdir(path.join(output, 'src'), { recursive: true });
for (const file of ['bootstrap.js', 'replica.css', 'site.config.json']) {
  await fs.copyFile(path.join(root, 'src', file), path.join(output, 'src', file));
}

const escapeHTML = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
html = html.replace(/<title>.*?<\/title>/, `<title>${escapeHTML(config.title)}</title>`)
  .replace(/content="SWE-Marathon v1\.1:[^"]*"/, `content="${escapeHTML(config.description)}"`)
  .replace(/(href|src)="\/(?!\/)/g, '$1="./')
  .replace('src="./assets/index-BMEz9I0h.js"', 'src="./src/bootstrap.js"')
  .replace('</head>', '    <link rel="stylesheet" href="./src/replica.css">\n  </head>');
if (config.publicUrl) {
  const publicUrl = new URL(config.publicUrl).href.replace(/\/?$/, '/');
  html = html.replaceAll('https://www.swe-marathon.org/', escapeHTML(publicUrl));
} else {
  // A mirror must not declare the original domain as its canonical URL.
  html = html.replace(/\s*<link rel="canonical"[^>]+>/, '')
    .replace(/\s*<meta property="og:url"[^>]+>/, '');
}
await fs.writeFile(path.join(output, 'index.html'), html);

const appPath = path.join(output, 'assets/index-BMEz9I0h.js');
let app = await fs.readFile(appPath, 'utf8');
const mount = '(0,v.createRoot)(document.getElementById(`root`))';
if (!app.includes(mount)) throw new Error('Snapshot mount marker changed');
app = app.replace(mount, `Object.assign(Ot,window.SWEMarathonReplica.benchmarks);ze=Ot['v1.0'].leaderboard;Be=Ot['v1.0'].modelColors;${mount}`);
// Resolve image references used outside benchmark data against this deployment.
app = app.replace(/([\x60"'])\/(assets\/logos\/[^\x60"']+|benchmark-horizons\.svg)\1/g,
  (_, quote, asset) => `new URL(${JSON.stringify('../' + asset)},import.meta.url).href`);
// The Vite preload helper used an origin-root base; Pages project sites use a subdirectory.
app = app.replace(/e=>`\/`\+e/g, 'e=>new URL("../"+e,import.meta.url).href');
app = app.replace('Mt=function(e){return`/`+e}', 'Mt=function(e){return new URL("../"+e,import.meta.url).href}');
const formStart = 'async function o(n){n.preventDefault();let i=e.trim();';
if (!app.includes(formStart)) throw new Error('Snapshot subscription marker changed');
app = app.replace(formStart, 'async function o(n){n.preventDefault();if(!window.SWEMarathonReplica.config.subscriptionEndpoint){a(`Subscriptions are not configured for this replica.`);return}let i=e.trim();')
  .replace('fetch(`https://formspree.io/f/xovnyyod`,', 'fetch(window.SWEMarathonReplica.config.subscriptionEndpoint,');
if (config.contactEmail) {
  app = app.replaceAll('mailto:jesse@abundant.ai', 'mailto:' + config.contactEmail);
}
await fs.writeFile(appPath, app);
const manifestPath = path.join(output, 'site.webmanifest');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
manifest.start_url = './';
manifest.name = config.title;
manifest.short_name = config.title;
for (const icon of manifest.icons) icon.src = '.' + icon.src;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(output, '.nojekyll'), '');
console.log('Built dist/ — relative URLs support both github.io/repository/ and custom domains.');
