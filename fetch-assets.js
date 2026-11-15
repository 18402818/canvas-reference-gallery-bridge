#!/usr/bin/env node
/**
 * fetch-assets.js — deployment-time asset fetcher (NOT a redistribution of assets).
 *
 * This repository ships NO third-party gallery data or images. Run this script
 * on YOUR OWN machine to fetch the compiled SPA + data from the upstream site
 * into ./assets and ./data, for private, local, non-commercial study only.
 *
 *   node fetch-assets.js                         # fetch from the official site
 *   node fetch-assets.js --from-local <dir>     # copy from an existing local deploy
 *   node fetch-assets.js --base-url <url>       # override the upstream host
 *
 * The fetched files are listed in .gitignore and must NOT be committed or
 * re-uploaded. See NOTICE.md for ownership and the takedown policy.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DEFAULT_BASE = 'https://ai-pose-gallery.anhao.app';
const CONCURRENCY = 6;
const TIMEOUT_MS = 60000;

function parseArgs(argv) {
  const out = { base: process.env.GALLERY_BASE_URL || DEFAULT_BASE, fromLocal: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from-local' && argv[i + 1]) out.fromLocal = argv[++i];
    else if (argv[i] === '--base-url' && argv[i + 1]) out.base = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').trim());
      process.exit(0);
    } else throw new Error('unknown argument: ' + argv[i]);
  }
  return out;
}

function log(msg) { console.log('[fetch-assets] ' + msg); }

async function download(url, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function mapLimit(items, limit, fn) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

function writeRel(rel, buf) {
  const dest = path.join(ROOT, rel.replace(/^\/+/, '').replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/** Discover the asset list the same way the browser does: index.html -> main bundle -> chunks/data. */
async function discover(base) {
  const htmlBuf = await download(base.replace(/\/$/, '') + '/index.html');
  const html = htmlBuf.toString('utf8');
  const rels = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) rels.add(m[1]);

  const main = html.match(/<script[^>]*type="module"[^>]*src="(\/assets\/index-[^"]+\.js)"/);
  if (!main) throw new Error('could not find the main module bundle in index.html');
  const bundle = (await download(base.replace(/\/$/, '') + main[1])).toString('utf8');
  for (const m of bundle.matchAll(/assets\/[A-Za-z0-9_.-]+\.js/g)) rels.add('/' + m[0]);
  for (const m of bundle.matchAll(/data\/[A-Za-z0-9_-]+-zh\.json/g)) rels.add('/' + m[0]);

  rels.add('/index.html');
  rels.add('/og-cover.jpg');
  return { htmlBuf, rels: [...rels].sort() };
}

async function fetchOnline(base) {
  log('upstream: ' + base);
  log('discovering referenced assets from index.html + main bundle ...');
  const { htmlBuf, rels } = await discover(base);
  log('found ' + rels.length + ' files (SPA shell, chunks, data JSON, cover)');

  let done = 0;
  await mapLimit(rels, CONCURRENCY, async (rel) => {
    const buf = rel === '/index.html' ? htmlBuf : await download(base.replace(/\/$/, '') + rel);
    const size = writeRel(rel, buf);
    done++;
    log('  ' + String(done).padStart(2) + '/' + rels.length + '  ' + rel + '  ' + size + ' B');
    return rel;
  });
  log('done. ' + done + ' files written locally.');
}

function copyTree(srcDir, relDir, out) {
  const abs = path.join(srcDir, relDir);
  if (!fs.existsSync(abs)) return;
  for (const name of fs.readdirSync(abs)) {
    const from = path.join(abs, name);
    if (fs.statSync(from).isDirectory()) continue;
    const rel = '/' + (relDir ? relDir + '/' : '') + name;
    out.push([rel, fs.readFileSync(from)]);
  }
}

async function copyFromLocal(dir) {
  const src = path.resolve(dir);
  if (!fs.existsSync(src)) throw new Error('--from-local directory not found: ' + src);
  log('offline mode: copying from ' + src);
  const pairs = [];
  const idx = path.join(src, 'index.html');
  if (!fs.existsSync(idx)) throw new Error('missing index.html in ' + src);
  pairs.push(['/index.html', fs.readFileSync(idx)]);
  copyTree(src, 'assets', pairs);
  copyTree(src, 'data', pairs);
  const cover = path.join(src, 'og-cover.jpg');
  if (fs.existsSync(cover)) pairs.push(['/og-cover.jpg', fs.readFileSync(cover)]);
  for (const [rel, buf] of pairs) writeRel(rel, buf);
  log('copied ' + pairs.length + ' files.');
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  console.log('');
  console.log('NOTICE: these files are third-party material (see NOTICE.md).');
  console.log('        Personal / local / non-commercial study only; do NOT commit or re-upload.');
  console.log('');
  if (args.fromLocal) await copyFromLocal(args.fromLocal);
  else await fetchOnline(args.base);
  console.log('');
  log('next: node patch.js  →  node server.js (or START.bat)');
})().catch((e) => {
  console.error('[fetch-assets] FAILED: ' + (e && e.message ? e.message : e));
  process.exitCode = 1;
});
