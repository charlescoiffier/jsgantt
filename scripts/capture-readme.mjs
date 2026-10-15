/**
 * Régénère les images du README dans docs/images/ : captures de la démo et GIF d'un glissement.
 *
 * Usage : npm run capture:readme                    (tout régénérer)
 *         npm run capture:readme -- --only=apercu   (une seule image : voir SHOTS plus bas, ou « animation »)
 * Prérequis : Google Chrome (ou CHROME_PATH=/chemin/vers/chrome), ffmpeg pour le GIF, Node 22+ (WebSocket intégré).
 *
 * Sans dépendance : le script sert la démo en local, lance Chrome sans interface et le pilote par le protocole
 * Chrome DevTools. La date du jour est figée au 14 octobre 2026 et l'interface est en français : les images
 * sont reproductibles.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'images');
const PORT = 8123;
const DEBUG_PORT = 9333;
const URL_DEMO = `http://localhost:${PORT}/demo/index.html`;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const SCALE = 2; // images nettes sur écran haute densité
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (f) => `${Math.round(statSync(f).size / 1024)} Ko`;

// Date figée et langue française, injectées avant le code de la page.
const PRELUDE = `(() => {
  const FIXED = Date.UTC(2026, 9, 14, 9, 0, 0);
  const Real = Date;
  class Fixed extends Real { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } }
  globalThis.Date = Fixed;
  Object.defineProperty(navigator, 'language', { get: () => 'fr-FR' });
  Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr'] });
  try { localStorage.clear(); } catch { /* chaque image part de la vue par défaut */ }
})();`;

// Préparation commune : thème, puis réglages propres à chaque image (dans la page, avec `gantt` et `$`).
const theme = (name) => `{ const s = document.getElementById('theme'); s.value = '${name}'; s.dispatchEvent(new Event('change')); }`;
const SHOTS = {
  apercu: { width: 1280, height: 640, setup: '' },
  critique: {
    width: 1280, height: 560,
    setup: `gantt.alignEarliest(); gantt.setShowCritical(true); gantt.setScale('day'); gantt.scroller.scrollLeft = 120;`,
  },
  sombre: { width: 1100, height: 560, setup: `${theme('dark')} gantt.setView({ barLabel: 'owner' });` },
  epure: { width: 1100, height: 560, setup: `${theme('epure')} gantt.setColumns(['start', 'owner']);` },
  proprietes: {
    width: 1280, height: 640,
    setup: `gantt.select('t5'); gantt.editTask('t5');`,
  },
  filtres: {
    width: 1280, height: 600,
    setup: `gantt.setColumns(['start', 'end', 'owner', 'progress']); gantt.setColumnFilter('owner', { in: ['alice', 'chloe'] });
      gantt.setColumnFilter('start', { after: '2026-10-01' }); await new Promise((r) => setTimeout(r, 100)); gantt.editColumnFilter('start');`,
  },
  aide: { width: 1100, height: 820, setup: `document.getElementById('open-help').click();` },
  parametres: {
    width: 1100, height: 900,
    setup: `document.getElementById('open-settings').click();`,
  },
  responsables: {
    width: 1280, height: 640,
    setup: `gantt.setColumns(['wbs', 'start', 'end', 'owner', 'slack']); gantt.setShowCritical(true); gantt.setSort({ column: 'owner', dir: 'asc' });`,
  },
};

class Chrome {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) for (const l of this.listeners) l(msg);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method) {
    return new Promise((resolve) => {
      const l = (msg) => {
        if (msg.method === method) {
          this.listeners = this.listeners.filter((x) => x !== l);
          resolve(msg.params);
        }
      };
      this.listeners.push(l);
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result.value;
  }
}

async function waitFor(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch { /* pas encore prêt */ }
    await sleep(150);
  }
  throw new Error(`Pas de réponse : ${url}`);
}

async function open(chrome, { width, height }) {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: SCALE, mobile: false });
  const loaded = chrome.once('Page.loadEventFired');
  await chrome.send('Page.navigate', { url: URL_DEMO });
  await loaded;
  await chrome.eval(`await new Promise((r) => { const t = () => (window.gantt ? r() : setTimeout(t, 50)); t(); });`);
  await sleep(300);
}

async function shoot(chrome, name, shot) {
  await open(chrome, shot);
  if (shot.setup) await chrome.eval(shot.setup);
  await sleep(500);
  const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`${name}.png (${kb(file)})`);
}

// GIF : glissement de « Noyau » d'une semaine ; ses successeurs suivent, puis retour en arrière avec Annuler.
async function animation(chrome) {
  const shot = { width: 1280, height: 600 };
  await open(chrome, shot);
  await chrome.eval(`gantt.alignEarliest(); gantt.setShowCritical(true);`);
  await sleep(300);
  const box = await chrome.eval(`const r = document.querySelector('.gantt-task[data-id="t3"] .gantt-bar').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  const dir = mkdtempSync(join(tmpdir(), 'jsgantt-gif-'));
  let n = 0;
  const frame = async (repeat = 1) => {
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    for (let i = 0; i < repeat; i++) writeFileSync(join(dir, `f${String(n++).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
  };
  const mouse = (type, x, y) => chrome.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  await frame(8);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await mouse('mousePressed', box.x, box.y);
  const distance = 84; // une semaine à l'échelle « semaine »
  for (let i = 1; i <= 24; i++) {
    await mouse('mouseMoved', box.x + (distance * i) / 24, box.y);
    await sleep(30);
    await frame();
  }
  await mouse('mouseReleased', box.x + distance, box.y);
  await sleep(200);
  await frame(14);
  await chrome.eval('gantt.undo();');
  await sleep(200);
  await frame(10);
  const gif = join(OUT, 'animation.gif');
  const palette = join(dir, 'palette.png');
  const filters = 'fps=12,scale=960:-1:flags=lanczos';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', join(dir, 'f%04d.png'), '-vf', `${filters},palettegen=stats_mode=diff`, palette]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', join(dir, 'f%04d.png'), '-i', palette,
    '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`, gif]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`animation.gif (${kb(gif)})`);
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`Chrome introuvable (${CHROME}). Définir CHROME_PATH.`);
  mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'jsgantt-chrome-'));
  const browser = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=fr-FR', 'about:blank'], { stdio: 'ignore' });
  try {
    await waitFor(URL_DEMO);
    await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const chrome = new Chrome(ws);
    await chrome.send('Page.enable');
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELUDE });
    for (const [name, shot] of Object.entries(SHOTS)) if (!ONLY || ONLY === name) await shoot(chrome, name, shot);
    if (!ONLY || ONLY === 'animation') await animation(chrome);
    ws.close();
  } finally {
    browser.kill();
    server.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
