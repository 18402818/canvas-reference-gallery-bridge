'use strict';
// Full-chain CDP test for the reference-gallery <-> infinite-canvas bridge.
// Drives a real Edge: opens the canvas, opens the gallery iframe, seeds a real
// recipe into the iframe's own localStorage, clicks the real "加入无限画布"
// button via window.parent.postMessage, then checks the canvas DOM for the
// image/text nodes that applyOps() created.
//
//   node tests/_cdp_test.js
// Optional env: TEST_HOST, CANVAS_PORT, GALLERY_PORT, EDGE_PATH,
//               DATA_DIR (defaults to ./data, populated by fetch-assets.js)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = Number(process.env.CDP_PORT || 9333);
const HOST = process.env.TEST_HOST || '127.0.0.1';
const CANVAS_PORT = Number(process.env.CANVAS_PORT || 3000);
const GALLERY_PORT = Number(process.env.GALLERY_PORT || 3001);
const CANVAS_URL = 'http://' + HOST + ':' + CANVAS_PORT + '/canvas?mode=new';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function firstEntry(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))[0];
}

const recipe = {
  portrait: firstEntry('portrait-zh.json'),
  costume: firstEntry('costume-zh.json'),
  pose: firstEntry('pose-zh.json'),
  extraImages: [],
};

// Injected into EVERY frame before navigation. In the gallery iframe it watches
// the bridge bar's status text and forwards it to the top (canvas) window via
// postMessage; the top frame stores it in window.__pgTestReceipts. This survives
// the iframe being torn down when the modal closes, so the receipt can be
// asserted from the stable parent execution context.
const bridgeObserver = `(function(){
  try {
    if (window.self === window.top) {
      window.__pgTestReceipts = [];
      window.addEventListener('message', function(e){
        var d = e.data;
        if (d && d.type === '__pgtest:receipt') window.__pgTestReceipts.push(d.text);
      });
      return;
    }
    var t = setInterval(function(){
      var el = document.getElementById('pg-bridge-count');
      if (!el) return;
      clearInterval(t);
      var send = function(){ try { window.top.postMessage({type:'__pgtest:receipt', text: el.textContent}, '*'); } catch(e){} };
      var mo = new MutationObserver(send);
      mo.observe(el, {childList:true, characterData:true, subtree:true});
      send();
    }, 100);
  } catch(e){}
})();`;

const profile = path.join(os.tmpdir(), 'pg-cdp-' + Date.now());
const edge = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + CDP_PORT,
  '--user-data-dir=' + profile,
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-sandbox',
  '--window-size=1600,1000',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    this.contexts = new Map();
    this.consoleLines = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(JSON.stringify(m.error)));
        else p.resolve(m.result);
        return;
      }
      if (m.method === 'Runtime.executionContextCreated' && m.params && m.params.context) {
        const c = m.params.context;
        this.contexts.set(c.id, c);
      }
      if (m.method === 'Runtime.consoleAPICalled') {
        try { this.consoleLines.push((m.params.args || []).map((a) => a.value || a.description || '').join(' ')); } catch (e) {}
      }
      this.listeners.forEach((fn) => fn(m));
    });
  }
  onEvent(fn) { this.listeners.push(fn); }
  send(method, params, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg = { id, method, params: params || {} };
      if (sessionId) msg.sessionId = sessionId;
      this.ws.send(JSON.stringify(msg));
    });
  }
  async evaluate(expression, opts) {
    const o = opts || {};
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      contextId: o.contextId,
    }, o.sessionId);
    if (r.exceptionDetails) throw new Error('EVAL: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails));
    return r.result && r.result.value;
  }
}

async function waitEval(cdp, expression, check, label, timeoutMs, opts) {
  const deadline = Date.now() + (timeoutMs || 30000);
  let last;
  while (Date.now() < deadline) {
    try {
      last = await cdp.evaluate(expression, opts);
      if (check(last)) return last;
    } catch (e) {
      last = 'ERR ' + e.message;
    }
    await sleep(400);
  }
  throw new Error('TIMEOUT waiting for ' + label + ' (last=' + JSON.stringify(last) + ')');
}

(async () => {
  let ws;
  try {
    let version = null;
    for (let i = 0; i < 60; i++) {
      try { version = await httpJson('http://127.0.0.1:' + CDP_PORT + '/json/version'); break; }
      catch (e) { await sleep(300); }
    }
    if (!version) throw new Error('DevTools endpoint never came up');
    console.log('DEVTOOLS ' + version.Browser);

    const tab = await httpJson('http://127.0.0.1:' + CDP_PORT + '/json/new?about:blank', { method: 'PUT' });
    console.log('TAB ' + tab.id);

    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: bridgeObserver, runImmediately: true });
    await cdp.send('Page.navigate', { url: CANVAS_URL });

    // 1. canvas app with the new bridge button mounted
    await waitEval(cdp,
      "!!document.querySelector('[aria-label=\"打开参考图库\"]')",
      (v) => v === true, 'bridge button', 60000);
    console.log('STEP1 canvas bridge button present: true');

    const before = await cdp.evaluate("document.querySelectorAll('[data-node-id]').length");
    console.log('STEP2 nodes before = ' + before);

    // 2. open modal + iframe
    await cdp.evaluate("document.querySelector('[aria-label=\"打开参考图库\"]').click()");
    const iframeSrc = await waitEval(cdp,
      "(function(){var f=document.querySelector('iframe[title=\"参考图库\"]');return f?f.src:null})()",
      (v) => typeof v === 'string' && v.indexOf(String(GALLERY_PORT)) !== -1, 'gallery iframe', 30000);
    console.log('STEP3 gallery iframe src = ' + iframeSrc);

    // 3. find the iframe's own execution context (same-process iframe)
    let ctx = null;
    {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !ctx) {
        for (const c of cdp.contexts.values()) {
          if (c.origin === 'http://' + HOST + ':' + GALLERY_PORT) { ctx = c; break; }
        }
        if (!ctx) await sleep(400);
      }
    }
    console.log('STEP4 gallery execution contexts = ' + JSON.stringify([...cdp.contexts.values()].map((c) => ({ id: c.id, origin: c.origin, name: c.name }))));
    if (!ctx) throw new Error('gallery iframe execution context not found');

    // 4. Seed a REAL recipe into the iframe's localStorage and immediately
    //    refresh the bridge (so the real button enables), all in ONE evaluation
    //    to avoid the gallery React app's own localStorage writer racing us.
    console.log('STEP5 bridge contexts = ' + JSON.stringify([...cdp.contexts.values()].map((c) => ({ id: c.id, origin: c.origin }))));

    const seedExpr = `(function(){
      var b = window.__poseGalleryBridge;
      if (!b || !b.READY) return 'BRIDGE_NOT_READY';
      try { localStorage.setItem('pose_atlas_recipe_v3', ${JSON.stringify(JSON.stringify(recipe))}); } catch (e) { return 'ERR ' + e.message; }
      var payload = b.buildPayload('realistic');
      if (!payload) return 'NO_PAYLOAD';
      b.refresh();
      return JSON.stringify({bar:!!document.getElementById('pg-bridge-bar'),count:document.getElementById('pg-bridge-count').textContent,disabled:document.getElementById('pg-bridge-apply').disabled,images:payload.images.length,prompt:payload.prompt.slice(0,40)});
    })()`;
    console.log('STEP6 seed+refresh = ' + await cdp.evaluate(seedExpr, { contextId: ctx.id }));

    // Click the REAL button -> window.parent.postMessage -> parent applyOps -> nodes
    const clickResult = await cdp.evaluate(`(function(){
      var btn = document.getElementById('pg-bridge-apply');
      if (!btn) return 'NO_BUTTON';
      if (btn.disabled) return 'DISABLED';
      btn.click();
      return 'CLICKED';
    })()`, { contextId: ctx.id });
    console.log('STEP7 clicked 「加入无限画布 →」: ' + clickResult);

    const after = await waitEval(cdp,
      "document.querySelectorAll('[data-node-id]').length",
      (v) => typeof v === 'number' && v > before, 'nodes created by bridge', 60000);
    console.log('STEP8 nodes after = ' + after + ' (delta=' + (after - before) + ')');

    // 5. APPLIED receipt: the iframe may be destroyed by modal close, so read
    //    the forwarded value from the stable parent window instead.
    const receipt = await waitEval(cdp,
      "JSON.stringify(window.__pgTestReceipts || [])",
      (v) => typeof v === 'string' && v.indexOf('已加入无限画布') !== -1,
      'applied receipt', 15000);
    console.log('STEP9 iframe receipts include applied = ' + receipt);

    const galleryOrigin = 'http://' + HOST + ':' + GALLERY_PORT;
    const detail = await cdp.evaluate(`(function(){
      var imgs = Array.from(document.querySelectorAll('[data-node-id] img')).map(function(i){return i.getAttribute('src')||''});
      var txt = document.body.innerText || '';
      return {
        totalImgs: imgs.length,
        galleryImages: imgs.filter(function(s){return s.indexOf(${JSON.stringify(galleryOrigin)})!==-1||s.indexOf('/thumbs/')!==-1||s.indexOf('/img/')!==-1}).length,
        sample: imgs.slice(-6),
        hasPreset: txt.indexOf('画风预设') !== -1,
        hasPromptNode: txt.indexOf('图库组合提示词') !== -1,
        connections: document.querySelectorAll('[data-connection-id]').length,
        modalClosed: !document.querySelector('.ant-modal-wrap:not([style*="display: none"])')
      };
    })()`);
    console.log('STEP10 canvas DOM = ' + JSON.stringify(detail));

    // Save a real screenshot of the canvas with the imported nodes as evidence.
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(__dirname, 'bridge-proof.png'), Buffer.from(shot.data, 'base64'));
      console.log('STEP11 screenshot saved: tests/bridge-proof.png (' + Buffer.from(shot.data, 'base64').length + ' bytes)');
    } catch (e) { console.log('STEP11 screenshot skipped: ' + e.message); }

    // 6. standalone gallery must be unaffected (no bridge bar)
    await cdp.send('Page.navigate', { url: 'http://' + HOST + ':' + GALLERY_PORT + '/' });
    const standalone = await waitEval(cdp,
      "(function(){return JSON.stringify({bar:!!document.getElementById('pg-bridge-bar'),hook:!!window.__poseGalleryBridge,title:document.title})})()",
      (v) => typeof v === 'string' && v.indexOf('"bar":false') !== -1,
      'standalone unaffected', 30000);
    console.log('STEP12 standalone = ' + standalone);

    const ok = after > before && detail.galleryImages > 0 && detail.hasPreset && detail.hasPromptNode;
    console.log('RESULT ' + (ok ? 'PASS' : 'FAIL'));
    process.exitCode = ok ? 0 : 3;
  } catch (e) {
    console.log('RESULT FAIL ' + e.message);
    process.exitCode = 1;
  } finally {
    if (ws) { try { ws.close(); } catch (e) {} }
    try { edge.kill(); } catch (e) {}
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  }
})();
