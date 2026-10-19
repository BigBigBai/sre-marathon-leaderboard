import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf', '.png': 'image/png', '.svg': 'image/svg+xml',
};

// The optional mount also lets checks emulate a GitHub Pages project subdirectory.
export function createStaticServer(directory, mount = '/') {
  const base = path.resolve(directory);
  return http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(mount)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const relative = pathname.slice(mount.length) || 'index.html';
      const file = path.resolve(base, relative);
      if (!file.startsWith(base + path.sep)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Content-Length': stat.size, 'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : await fs.readFile(file));
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : error.code === 'ENOENT' ? 404 : 500);
      response.end('Not found');
    }
  });
}
