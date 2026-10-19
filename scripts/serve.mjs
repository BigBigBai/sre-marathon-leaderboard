import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server.mjs';

if (!process.argv.includes('--dist')) await import('./build.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const portIndex = process.argv.indexOf('--port');
const port = portIndex < 0 ? 5173 : Number(process.argv[portIndex + 1]);
const server = createStaticServer(root);
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${server.address().port}/`));
