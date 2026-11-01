#!/usr/bin/env node
// Usage: node scripts/drive.mjs <map.html> <folder-for-screenshots>
// Needs Playwright (npm install playwright; set NODE_PATH if it is installed elsewhere).
// Drives search, zoom, pan, focus, dossier, type filter and handoff with motion on and reduced,
// on the map's own data at 1280 and 1440 wide and on a phone, then writes screenshots to look at. 15 to 40 seconds.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('Usage: node scripts/drive.mjs <map.html> <folder-for-screenshots>');
  process.exit(2);
}
const require = createRequire(join(process.cwd(), 'x.js'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright not found. Run: npm install playwright (and npx playwright install chromium), or set NODE_PATH.');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const url = pathToFileURL(resolve(file)).href;
const sys = JSON.parse(readFileSync(file, 'utf8').match(/id="system-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
const norm = (s) => String(s || '').toLowerCase();
let failures = 0;
const ok = (cond, msg, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${extra ? ` (${extra})` : ''}`);
};
const cam = (p) => p.$eval('#map', (m) => ({ k: +m.dataset.k, x: +m.dataset.x, y: +m.dataset.y }));
const centre = (p, id) => p.$eval(`.st[data-id="${id}"] .hit`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const degree = (id) => sys.edges.filter((e) => e.from === id || e.to === id).length;
const busiest = [...sys.nodes].sort((a, b) => degree(b.id) - degree(a.id) || (a.id < b.id ? -1 : 1))[0];
const presentTypes = [...new Set(sys.nodes.map((n) => n.type))].sort();

const browser = await chromium.launch();
try {
  for (const [motion, width, height] of [['no-preference', 1280, 800], ['reduce', 1280, 800], ['reduce', 1440, 900]]) {
    const tag = `${motion === 'reduce' ? 'reduced' : 'motion'}-${width}`;
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: motion });
    const p = await ctx.newPage();
    const errors = []; const external = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('request', (r) => { if (!r.url().startsWith('file:')) external.push(r.url()); });
    await p.goto(url);
    await p.waitForSelector('body[data-ready]');
    await p.waitForTimeout(motion === 'reduce' ? 100 : 1900);
    const shown = await p.$$eval('#vp .st', (els) => els.filter((e) => +getComputedStyle(e).opacity > 0.95).length);
    ok(shown === sys.nodes.length, `${tag}: every station is visible`, `${shown}/${sys.nodes.length}`);
    await p.screenshot({ path: join(outDir, `desktop-${tag}.png`) });

    const px = await p.$eval('#vp .lab', (e) => parseFloat(getComputedStyle(e).fontSize) * +document.getElementById('map').dataset.k);
    ok(px >= 11, `${tag}: labels open at 11 px or larger`, `${px.toFixed(1)} px`);
    const caption = await p.evaluate(() => {
      const labs = [...document.querySelectorAll('#vp .lab')].map((e) => ({ t: e.textContent, b: e.getBoundingClientRect() }));
      const out = [];
      for (let i = 0; i < labs.length; i++) {
        for (let j = i + 1; j < labs.length; j++) {
          const a = labs[i].b; const c = labs[j].b;
          const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
          const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if ((ox > 0.3 * Math.min(a.width, c.width) && oy > -4) || (oy > 0.4 * Math.min(a.height, c.height) && ox > -4)) out.push(`${labs[i].t} / ${labs[j].t}`);
        }
      }
      return out;
    });
    ok(caption.length === 0, `${tag}: no two labels read as one caption`, caption.join('; '));
    const over = await p.evaluate(() => {
      const boxes = [...document.querySelectorAll('#vp .st')].map((g) => { const b = (g.querySelector('.mark-bg') || g.querySelector('.lab')).getBBox(); return { t: g.querySelector('.lab').textContent, b }; });
      const out = {};
      for (const path of document.querySelectorAll('#vp .seg,#vp .link')) {
        const len = path.getTotalLength();
        for (let d = 0; d < len; d += 2) {
          const pt = path.getPointAtLength(d);
          for (const { t, b } of boxes) if (pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height) out[t] = (out[t] || 0) + 2;
        }
      }
      return Object.entries(out).map(([t, n]) => `${t} ${n}`);
    });
    ok(over.length === 0, `${tag}: no label covers track, by sampling the drawn paths`, over.join('; '));
    const wantPlates = [...sys.nodes, ...sys.edges].filter((o) => o.status === 'inferred').length;
    ok((await p.$$eval('#vp .plate.p-inferred', (e) => e.length)) === wantPlates, `${tag}: every inference has a plate`, `${wantPlates}`);

    const c0 = await cam(p);
    await p.mouse.move(width * 0.6, height / 2); await p.mouse.wheel(0, -400); await p.waitForTimeout(80);
    const c1 = await cam(p);
    ok(c1.k > c0.k, `${tag}: wheel zooms`);
    await p.mouse.move(width * 0.6, height - 20); await p.mouse.down(); await p.mouse.move(width * 0.6 - 100, height - 100, { steps: 5 }); await p.mouse.up();
    const c2 = await cam(p);
    ok(Math.abs(c2.x - c1.x + 100) < 2, `${tag}: drag pans`);
    await p.click('#zfit'); await p.waitForTimeout(520);

    const at = await centre(p, busiest.id);
    await p.mouse.click(at.x, at.y); await p.waitForTimeout(520);
    ok(await p.$eval('#dossier', (d) => d.classList.contains('open')), `${tag}: clicking a station opens the dossier`);
    const rows = await p.$$eval('#d-body .rel', (e) => e.length);
    ok(rows === degree(busiest.id), `${tag}: dossier lists every relationship`, `${rows}`);
    await p.screenshot({ path: join(outDir, `focus-${tag}.png`) });
    await p.keyboard.press('Escape'); await p.waitForTimeout(450);

    // The longest edge: focusing either end must show both
    const layout = await p.evaluate(() => window.__atlasLayout);
    const longest = [...layout.segs].sort((a, b) => Math.hypot(layout.nodes[b.from].x - layout.nodes[b.to].x, layout.nodes[b.from].y - layout.nodes[b.to].y) - Math.hypot(layout.nodes[a.from].x - layout.nodes[a.to].x, layout.nodes[a.from].y - layout.nodes[a.to].y))[0];
    if (longest) {
      await p.click('#zfit'); await p.waitForTimeout(450);
      const from = await centre(p, longest.from);
      await p.mouse.click(from.x, from.y); await p.waitForTimeout(520);
      const both = await p.evaluate(([a, b]) => {
        const left = document.getElementById('side').getBoundingClientRect().right;
        const right = document.getElementById('dossier').getBoundingClientRect().left;
        return [a, b].every((id) => { const r = document.querySelector(`.st[data-id="${id}"] .hit`).getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2; return x > left && x < right && y > 60 && y < innerHeight; });
      }, [longest.from, longest.to]);
      ok(both, `${tag}: focus shows both ends of the longest edge`, `${longest.from} to ${longest.to}`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(450);
      await p.click('#zfit'); await p.waitForTimeout(450);
    }

    const word = norm(busiest.label).slice(0, 4);
    await p.fill('#q', word); await p.waitForTimeout(120);
    ok((await p.$$eval('#results li[data-id]', (e) => e.length)) > 0, `${tag}: search finds "${word}"`);
    await p.keyboard.press('Enter'); await p.waitForTimeout(520);
    ok(await p.$eval('#dossier', (d) => d.classList.contains('open')), `${tag}: Enter opens the first result`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(450);

    const t = presentTypes[0];
    const count = sys.nodes.filter((n) => n.type === t).length;
    await p.click(`.row[data-kind=type][data-key=${t}]`); await p.waitForTimeout(220);
    ok((await p.$$eval('.st.off', (e) => e.length)) === count, `${tag}: type filter hides ${t}`, `${count}`);
    for (const type of presentTypes) {
      if (type !== t) await p.click(`.row[data-kind=type][data-key=${type}]`);
    }
    await p.waitForTimeout(220);
    const bare = await p.$$eval('#vp .plate', (els) => els.filter((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || getComputedStyle(e).display === 'none') return false;
      const st = e.closest('.st');
      if (st) { const l = st.querySelector('.lab'); return getComputedStyle(l).display === 'none'; }
      return false;
    }).length);
    ok(bare === 0, `${tag}: no plate is left without its name when all types are hidden`, `${bare}`);
    const edgePlates = await p.$$eval('#vp .edge-q', (els) => els.filter((e) => e.getBoundingClientRect().width > 0).length);
    ok(edgePlates === 0, `${tag}: a track's plate hides with its track`, `${edgePlates}`);
    await p.click('#reset'); await p.waitForTimeout(160);

    await p.click('#handoffbtn'); await p.waitForTimeout(100);
    const unknowns = new Set([...sys.nodes, ...sys.edges].filter((o) => o.status === 'unknown').map((o) => o.basis)).size;
    ok((await p.$$eval('#h-cols section[data-status=unknown] .hitem', (e) => e.length)) === unknowns, `${tag}: handoff lists every open question once`, `${unknowns}`);
    await p.screenshot({ path: join(outDir, `handoff-${tag}.png`) });
    ok(errors.length === 0, `${tag}: no console errors`, errors.join('; '));
    ok(external.length === 0, `${tag}: no external requests`, external.join('; '));
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForSelector('body[data-ready]');
  await p.screenshot({ path: join(outDir, 'phone-map.png') });
  const blocked = await p.evaluate(() => {
    const parts = [...document.querySelectorAll('#zoom button,#tools button,#tools input')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const footer = innerHeight - 62;
    return [...document.querySelectorAll('#vp .lab,#vp .ltag')].filter((e) => {
      const b = e.getBoundingClientRect();
      if (b.right < 0 || b.left > innerWidth) return false;
      return b.bottom > footer || parts.some((r) => b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top);
    }).map((e) => e.textContent);
  });
  ok(blocked.length === 0, 'phone: controls cover no label at the opening view', blocked.join('; '));
  if ([...sys.nodes, ...sys.edges].some((o) => o.status === 'unknown')) {
    const seen = await p.$$eval('#vp .plate.p-unknown', (els) => {
      const top = document.getElementById('side').getBoundingClientRect().bottom;
      const bottom = document.getElementById('tools').getBoundingClientRect().top;
      return els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= top && r.bottom <= bottom; }).length;
    });
    ok(seen > 0, 'phone: an unknown marker is on the opening screen', `${seen}`);
    await p.tap('#handoffbtn'); await p.waitForTimeout(120);
    const first = await p.$$eval('#h-cols section', (els) => els.map((e) => ({ s: e.dataset.status, y: e.getBoundingClientRect().top })).sort((a, b) => a.y - b.y)[0].s);
    ok(first === 'unknown', 'phone: the button opens on the unknowns, one tap away', first);
    await p.screenshot({ path: join(outDir, 'phone-handoff.png') });
    await p.tap('#hclose'); await p.waitForTimeout(120);
  }
  await p.tap('#legendbtn'); await p.waitForTimeout(120);
  await p.screenshot({ path: join(outDir, 'phone-legend.png') });
  await p.tap('#legendbtn'); await p.waitForTimeout(120);
  await p.fill('#q', norm(busiest.label).slice(0, 4)); await p.waitForTimeout(120);
  await p.tap('#results li[data-id]'); await p.waitForTimeout(250);
  ok(await p.$eval('#dossier', (d) => d.classList.contains('open')), 'phone: a search result opens the dossier');
  await p.screenshot({ path: join(outDir, 'phone-dossier.png') });
  await ctx.close();
} finally {
  await browser.close();
}
console.log(failures ? `drive.mjs: ${failures} failed` : 'drive.mjs: all passed. Now look at every screenshot.');
process.exit(failures ? 1 : 0);
