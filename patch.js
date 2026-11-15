#!/usr/bin/env node
/**
 * patch.js — one-time, IDEMPOTENT patch of the fetched SPA for local hosting.
 *
 * Two changes, both purely local:
 *  1. Rewrite the upstream image-URL resolver `lr(e)` so relative asset paths
 *     become same-origin `/img/...` and `/thumbs/...` requests. server.js
 *     proxies those to the upstream host. Without this, a localhost load sends
 *     image requests to several *.pages.dev sub-CDNs whose costume/portrait
 *     paths are stale (they return text/html instead of images).
 *  2. Inject `<script src="/embed-bridge.js"></script>` into index.html and
 *     remove the third-party analytics beacon. The bridge script is inert
 *     unless opened in an iframe or with ?embed=1, so standalone use is intact.
 *
 * The original main bundle is backed up once as *.orig.js (gitignored).
 * Safe to re-run: already-patched files are detected and left alone.
 *
 *   node patch.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const idxFile = path.join(ROOT, 'index.html');
const assetsDir = path.join(ROOT, 'assets');

if (!fs.existsSync(idxFile)) {
  console.error('index.html not found — run  node fetch-assets.js  first.');
  process.exit(1);
}

// ---- 1. discover the main module bundle (hash changes with upstream builds) ----
let html = fs.readFileSync(idxFile, 'utf8');
const mainMatch = html.match(/<script[^>]*type="module"[^>]*src="(\/assets\/index-[^"]+\.js)"/);
if (!mainMatch) throw new Error('main module bundle not found in index.html; aborting patch');
const mainRel = mainMatch[1].replace(/^\/+/, '');
const mainFile = path.join(ROOT, mainRel.replace(/\//g, path.sep));
if (!fs.existsSync(mainFile)) throw new Error('main bundle missing: ' + mainFile);
const backup = mainFile.replace(/\.js$/, '.orig.js');

let src = fs.readFileSync(mainFile, 'utf8');
const NEW_RESOLVER = 'function lr(e){return /^(data:|https?:\\/\\/)/i.test(e)?e:"/"+String(e).replace(/^\\/+/,"")}';

if (src.indexOf(NEW_RESOLVER) !== -1) {
  console.log('[patch] main bundle already patched (lr(e) = same-origin); skipping.');
} else {
  const start = src.indexOf('function lr(e){');
  const endMark = 'async function ur(e){';
  const end = start < 0 ? -1 : src.indexOf(endMark, start);
  if (start < 0 || end < 0) {
    throw new Error('resolver function lr(e) / end marker not found — upstream bundle changed. Aborting (no partial write).');
  }
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, 'utf8');
  src = src.slice(0, start) + NEW_RESOLVER + src.slice(end);
  fs.writeFileSync(mainFile, src, 'utf8');
  console.log('[patch] rewrote lr(e) in ' + mainRel + ' (' + Buffer.byteLength(src) + ' bytes)');
  console.log('[patch] original saved as ' + path.basename(backup));
}

// ---- 2. index.html: inject bridge script, drop analytics beacon ----
let changed = false;
const beacon = /<script defer src="https:\/\/u\.authbox\.cn\/script\.js"[^>]*><\/script>/;
if (beacon.test(html)) {
  html = html.replace(beacon, '<!-- local deployment: upstream analytics beacon removed -->');
  changed = true;
  console.log('[patch] removed third-party analytics beacon.');
}
if (html.indexOf('/embed-bridge.js') === -1) {
  if (html.indexOf('</body>') === -1) throw new Error('no </body> in index.html; aborting patch');
  html = html.replace('</body>', '  <script src="/embed-bridge.js"></script>\n  </body>');
  changed = true;
  console.log('[patch] injected <script src="/embed-bridge.js">.');
} else {
  console.log('[patch] embed-bridge.js already referenced; skipping injection.');
}
if (changed) fs.writeFileSync(idxFile, html, 'utf8');

console.log('[patch] done. Now run:  node server.js');
