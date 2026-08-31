// cap_scene.template.js — demo-scene capture skeleton (battle-tested original).
// Usage: copy per scene and replace ONLY the "SEQUENCE" block. Overlay + helpers stay.
//   SCR=<scratch> APP=http://localhost:3000 node cap_scene.js  ->  stdout: {"waitMs":..., "webm":"...\.webm"}
// Prereqs: `npm i playwright-core` in SCR, plus a Chrome/Chromium/Edge on the machine
//          (auto-detected across macOS/Linux/Windows; override with CHROME_PATH).
const SCR = process.env.SCR || __dirname;
const { chromium } = require(SCR + '/node_modules/playwright-core');
const fs = require('fs');
const OUT = SCR + '/clips_raw';
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'http://localhost:3000';
const LABEL = process.env.LABEL || '1. Feature name';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Cross-platform Chrome/Chromium resolver ──────────────────────────────
// Real Chrome is preferred (fonts/emoji render correctly). Override with CHROME_PATH.
// Returns null -> Playwright launches its own bundled Chromium (run `npx playwright install chromium`).
function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = ({
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
      '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  })[process.platform] || [];
  for (const p of candidates) { try { if (p && fs.existsSync(p)) return p; } catch (_) {} }
  return null;
}

(async () => {
  const executablePath = resolveChrome();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}), // null -> Playwright's bundled Chromium
    headless: true, args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
  });
  const page = await ctx.newPage();
  await page.goto(APP + (process.env.PATHNAME || '/'), { waitUntil: 'networkidle', timeout: 60000 });

  // ── Overlay (subtitle bar · label · fake cursor · zoom) — injected on <html>
  //    directly so body-level zoom does NOT scale them ──
  await page.evaluate((label) => {
    const html = document.documentElement;
    const mk = (id) => { const d = document.createElement('div'); d.id = id; html.appendChild(d); return d; };
    mk('__cap'); const lbl = mk('__lbl'); lbl.textContent = label; mk('__cur');
    const st = document.createElement('style');
    st.textContent = `
      #__cap{position:fixed;left:50%;bottom:54px;transform:translateX(-50%);background:rgba(15,18,28,.85);color:#fff;font:600 30px/1.45 -apple-system,'Apple SD Gothic Neo',Segoe UI,Roboto,sans-serif;padding:16px 34px;border-radius:12px;z-index:2147483646;max-width:80%;text-align:center;opacity:0;transition:opacity .35s;box-shadow:0 8px 28px rgba(0,0,0,.35)}
      #__cap.on{opacity:1}
      #__lbl{position:fixed;left:36px;bottom:36px;background:rgba(37,99,235,.95);color:#fff;font:700 24px -apple-system,Segoe UI,Roboto,sans-serif;padding:9px 18px;border-radius:9px;z-index:2147483646}
      #__cur{position:fixed;left:960px;top:540px;width:28px;height:28px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1);background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M5 2l15 9-7 1 4 8-3 1-4-8-5 5z' fill='black' stroke='white' stroke-width='1.4'/></svg>") no-repeat;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
      body{transition:transform .8s cubic-bezier(.4,0,.2,1)}
    `;
    html.appendChild(st);
    window.__cap = (t) => { const c = document.getElementById('__cap'); c.textContent = t; c.classList.add('on'); };
    window.__capOff = () => document.getElementById('__cap').classList.remove('on');
    window.__cur = (x, y) => { const c = document.getElementById('__cur'); c.style.left = (x - 4) + 'px'; c.style.top = (y - 2) + 'px'; };
    window.__zoom = (s, ox, oy) => { document.body.style.transformOrigin = ox + 'px ' + oy + 'px'; document.body.style.transform = 'scale(' + s + ')'; };
    window.__unzoom = () => { document.body.style.transform = 'none'; };
  }, LABEL);

  // ── Helpers: center coords by text / move cursor (0.8s settle) then click ──
  const box = async (sel, txt) => page.evaluate(({ sel, txt }) => {
    const el = txt ? [...document.querySelectorAll(sel)].find(x => (x.textContent || '').includes(txt)) : document.querySelector(sel);
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { sel, txt });
  const moveClick = async (p) => { if (!p) return; await page.evaluate(({ x, y }) => window.__cur(x, y), p); await sleep(800); await page.mouse.click(p.x, p.y); await sleep(350); };

  // ════════ SEQUENCE (replace only this block per scene) — skeleton below ════════
  let waitMs = 0;
  await page.evaluate(() => window.__cap('The value of this feature in one sentence')); await sleep(2600);

  // Interact: await moveClick(await box('button', 'Button text'));
  // Type:     const ta = await box('textarea');
  //           if (ta) { await page.evaluate(({x,y}) => window.__cur(x,y), ta); await sleep(700); await page.mouse.click(ta.x, ta.y); }
  //           await page.type('textarea', 'real input value', { delay: 55 }); await sleep(800);

  // LLM/loading wait (only scenes that need it): NO fixed sleep — detect the result
  // and record waitMs (basis for the post-process speed-up window).
  // const tSubmit = Date.now();
  // await page.evaluate(() => window.__cap('AI is analyzing…'));
  // await page.waitForFunction(() => /pattern_only_in_the_result/.test(document.body.innerText), { timeout: 120000 });
  // waitMs = Date.now() - tSubmit;

  // Emphasize result: await page.mouse.wheel(0, 350); await sleep(1600);
  //                   await page.evaluate(() => window.__zoom(1.35, document.body.clientWidth * 0.72, 360)); await sleep(2200);
  //                   await page.evaluate(() => window.__unzoom()); await sleep(900);

  await page.evaluate(() => window.__capOff()); await sleep(700);
  // ════════ END SEQUENCE ════════

  await ctx.close(); // ★ BEFORE browser.close() — otherwise the webm is never flushed
  await browser.close();
  const webm = fs.readdirSync(OUT).filter(f => f.endsWith('.webm')).map(f => OUT + '/' + f).sort();
  console.log(JSON.stringify({ waitMs, webm: webm[webm.length - 1] }));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
