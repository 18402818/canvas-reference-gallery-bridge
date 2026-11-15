// Local static host for POSE & CHARACTER Atlas (ai-pose-gallery-zh compiled SPA).
// - serves the mirrored HTML / JS / CSS / data JSON
// - proxies /img/* and /thumbs/* to the official host (same-origin for the browser,
//   so canvas export is not tainted and every asset path resolves)
// - proxies /api/proxy (x-target-url) and /comfy for the AI generation studio
// No third-party dependency: Node 24 built-ins only.
'use strict';
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const OFFICIAL = 'https://ai-pose-gallery.anhao.app';
const COMFY = process.env.COMFYUI_URL || 'http://127.0.0.1:8000';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(urlPath, res) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const rootAbs = path.resolve(ROOT);
  const full = path.resolve(rootAbs, '.' + rel);
  if (!full.startsWith(rootAbs + path.sep)) {
    return send(res, 403, 'forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      const idx = path.join(rootAbs, 'index.html');
      return fs.readFile(idx, (e2, buf) => {
        if (e2) return send(res, 404, 'not found', { 'Content-Type': 'text/plain; charset=utf-8' });
        send(res, 200, buf, { 'Content-Type': MIME['.html'], 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
      });
    }
    const ext = path.extname(full).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.json' ? 'public, max-age=86400'
        : full.includes(path.sep + 'assets' + path.sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    res.writeHead(200, headers);
    fs.createReadStream(full).on('error', () => res.destroy()).pipe(res);
  });
}

function proxy(target, req, res) {
  let u;
  try { u = new URL(target); } catch {
    return send(res, 400, JSON.stringify({ ok: false, error: 'bad target' }), { 'Content-Type': MIME['.json'] });
  }
  const mod = u.protocol === 'https:' ? https : http;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['x-target-url'];
  delete headers['accept-encoding'];
  delete headers.connection;
  headers.host = u.host;
  const upstream = mod.request(u, { method: req.method, headers }, (up) => {
    const out = { ...up.headers };
    out['access-control-allow-origin'] = '*';
    res.writeHead(up.statusCode || 502, out);
    up.pipe(res);
  });
  upstream.setTimeout(60000, () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', (e) => {
    if (!res.headersSent) send(res, 502, JSON.stringify({ ok: false, error: String(e.message) }), { 'Content-Type': MIME['.json'] });
    else res.destroy();
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || '/';
  const target = String(req.headers['x-target-url'] || '');
  if (urlPath.startsWith('/api/proxy')) {
    if (!target) return send(res, 400, JSON.stringify({ ok: false, error: 'missing x-target-url' }), { 'Content-Type': MIME['.json'] });
    return proxy(target, req, res);
  }
  if (urlPath.startsWith('/comfy')) {
    const qs = urlPath.includes('?') ? urlPath.slice(urlPath.indexOf('?')) : '';
    const rest = urlPath.slice('/comfy'.length, urlPath.includes('?') ? urlPath.indexOf('?') : undefined);
    return proxy(COMFY.replace(/\/$/, '') + (rest || '/') + qs, req, res);
  }
  if (urlPath.startsWith('/img/') || urlPath.startsWith('/thumbs/')) {
    return proxy(OFFICIAL + urlPath, req, res);
  }
  return serveStatic(urlPath, res);
});

server.listen(PORT, HOST, () => {
  console.log(`pose-gallery local host listening on http://${HOST}:${PORT}`);
  console.log(`  static root: ${ROOT}`);
  console.log(`  image proxy: /img/* /thumbs/* -> ${OFFICIAL}`);
  console.log(`  api proxy:   /api/proxy (x-target-url), /comfy -> ${COMFY}`);
});
