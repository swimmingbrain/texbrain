// vite plugin for serving texlive files during development
// intercepts /texlive/ requests and serves from local cache or static dir
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Plugin } from 'vite';

export function texlivePlugin(): Plugin {
  let cacheDir = '';
  let staticTexliveDir = '';

  return {
    name: 'vite-texlive',
    configResolved(config) {
      cacheDir = join(config.root, 'static', 'texlive', 'cache');
      staticTexliveDir = join(config.root, 'static', 'texlive');
      mkdirSync(cacheDir, { recursive: true });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        const m = url.match(/^\/texlive\/pdftex\/(?:pk\/)?[\w]+\/(.+)$/);
        if (!m) return next();

        let filename = decodeURIComponent(m[1]);
        const isPk = url.includes('/pk/');

        // try common extensions if none provided
        if (!filename.includes('.')) {
          const tryExts = ['.tfm', '.pfb', '.vf', '.map', '.enc', '.sty', '.cls', '.fd', '.def', '.cfg', '.clo', '.tex'];
          for (const ext of tryExts) {
            if (existsSync(join(cacheDir, filename + ext))) {
              filename = filename + ext;
              break;
            }
          }
        }

        // serve from static/texlive/pdftex/10/
        const fmtPath = join(staticTexliveDir, 'pdftex', '10', filename);
        if (existsSync(fmtPath)) {
          const data = readFileSync(fmtPath);
          const headers: Record<string, string | number> = {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.length,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
            'fileid': filename
          };
          if (isPk) headers['pkid'] = filename;
          res.writeHead(200, headers);
          res.end(data);
          return;
        }

        // serve from cache
        const cachePath = join(cacheDir, filename);
        if (existsSync(cachePath)) {
          const data = readFileSync(cachePath);
          const headers: Record<string, string | number> = {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.length,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
            'fileid': filename
          };
          if (isPk) headers['pkid'] = filename;
          res.writeHead(200, headers);
          res.end(data);
          return;
        }

        // not found
        console.warn(`[texlive] not found: ${filename}`);
        res.writeHead(404, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain'
        });
        res.end('');
      });
    }
  };
}
