#!/usr/bin/env node
// Usage: node scripts/check.mjs <map.html>
// Dependency-free. Exits non-zero on any failure.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/check.mjs <map.html>');
  process.exit(2);
}
const html = readFileSync(path, 'utf8');
const tpl = readFileSync(join(here, '..', 'assets', 'template.html'), 'utf8');
const fails = [];
const warns = [];
const fail = (m) => fails.push(m);

const TOKENS = {
  '--paper': '#F5ECD6', '--paper-sheet': '#FBF4E2', '--river': '#CFE3DC',
  '--ink': '#14161B', '--ink-soft': '#55534B', '--rule': '#14161B', '--unknown': '#FFD60A',
  '--line-1': '#D0241D', '--line-2': '#0B4EA2', '--line-3': '#087A41', '--line-4': '#EE6C00', '--line-4-text': '#B04F00',
  '--line-5': '#6B2C9E', '--line-6': '#007686', '--line-7': '#CB196F', '--line-8': '#7A4A1E',
  '--t-quick': '160ms', '--t-move': '380ms', '--panel-w': '296px', '--dossier-w': '384px',
};
const NODE_TYPES = ['actor', 'process', 'store', 'queue', 'decision', 'document', 'external'];
const EDGE_TYPES = ['flow', 'sends', 'reads', 'writes', 'triggers', 'depends', 'returns'];
const STATUSES = ['fact', 'inferred', 'unknown'];
const CJK = /[⺀-鿿豈-﫿＀-￯]/;

const between = (src, re) => { const m = src.match(re); return m ? m[1] : null; };
const blockRe = (tag, id) => new RegExp(`<${tag}[^>]*id="${id}"[^>]*>([\\s\\S]*?)</${tag}>`);

// 1. Tokens and fixed code
const style = between(html, blockRe('style', 'atlas-style'));
if (!style) fail('The atlas-style block is missing.');
else {
  for (const [k, v] of Object.entries(TOKENS)) {
    if (!style.includes(`${k}:${v}`)) fail(`Token changed or missing: ${k} must be ${v}.`);
  }
  if (!style.includes('--font:"Helvetica Neue"')) fail('The font stack token was changed.');
}
for (const [tag, id] of [['style', 'atlas-style'], ['script', 'atlas-layout'], ['script', 'atlas-app']]) {
  const a = between(html, blockRe(tag, id));
  const b = between(tpl, blockRe(tag, id));
  if (a === null) fail(`The ${id} block is missing.`);
  else if (a !== b) fail(`The ${id} block differs from assets/template.html. Rebuild with scripts/build.mjs; do not edit CSS or code.`);
}

// 2. Structure
for (const id of ['map', 'vp', 'side', 'plate', 'legend', 'legend-body', 'tools', 'q', 'results', 'handoffbtn', 'unk-n', 'zoom', 'zin', 'zout', 'zfit', 'dossier', 'd-body', 'handoff', 'h-cols', 'ui-data', 'system-data']) {
  if (!html.includes(`id="${id}"`)) fail(`Required element #${id} is missing.`);
}
for (const slot of ['title', 'noscript', 'ui', 'system']) {
  if (!html.includes(`data-slot="${slot}"`)) fail(`Slot ${slot} is missing.`);
}

// 3. No placeholders
if (/\{\{[A-Z_]+\}\}/.test(html)) fail('An unfilled {{SLOT}} remains.');
const copyOnly = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script id="atlas-[\s\S]*?<\/script>/g, '');
if (/\b(TODO|TBD|FIXME|REPLACE_ME)\b|lorem ipsum/i.test(copyOnly)) fail('Placeholder text remains (TODO, TBD, REPLACE_ME, lorem ipsum).');

// 4. No external requests
const scan = html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
if (/https?:\/\//i.test(scan) || /["'(]\/\/[a-z0-9]/i.test(scan)) fail('An external URL is present.');
if (/<link\b|@import|<iframe|<img\b|<script[^>]+\ssrc=/i.test(scan)) fail('A tag that loads an outside file is present.');
if (/url\((?!#)/i.test(scan.replace(/'url\(#'/g, ''))) fail('A CSS url() that is not a local reference is present.');
if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.connection/.test(scan)) fail('Network code is present.');

// 5. JSON validation
let sys = null; let ui = null;
try { sys = JSON.parse(between(html, blockRe('script', 'system-data'))); } catch (e) { fail(`The system JSON does not parse: ${e.message}`); }
try { ui = JSON.parse(between(html, blockRe('script', 'ui-data'))); } catch (e) { fail(`The interface JSON does not parse: ${e.message}`); }
const stat = {};
if (sys) {
  const m = sys.meta || {};
  const lang = m.lang;
  const zh = lang === 'zh';
  const cap = (s, en, cn) => { const n = [...String(s)].length; return n <= (CJK.test(String(s)) ? cn : en); };
  if (lang !== 'en' && lang !== 'zh') fail('meta.lang must be "en" or "zh".');
  if (!m.title) fail('meta.title is required.');
  else if (!cap(m.title, 60, 28)) fail('meta.title is too long (60, or 28 for Chinese).');
  if (m.subtitle && !cap(m.subtitle, 110, 50)) fail('meta.subtitle is too long (110, or 50 for Chinese).');
  if (typeof m.fictional !== 'boolean') fail('meta.fictional must be true or false.');
  if (!Array.isArray(sys.nodes) || !sys.nodes.length) fail('nodes must be a non-empty array.');
  if (!Array.isArray(sys.edges)) fail('edges must be an array.');
  if (!Array.isArray(sys.lines)) fail('lines must be an array (it may be empty).');
  const nodes = sys.nodes || []; const edges = sys.edges || []; const lines = sys.lines || [];
  if (nodes.length > 60) fail('Too many nodes: the limit is 60. Split the system into several maps.');
  if (lines.length > 8) fail('Too many lines: the limit is 8.');
  if (edges.length > 120) fail('Too many edges: the limit is 120.');
  const ids = new Set();
  const certain = (o, what) => {
    const s = o.status || 'fact';
    if (!STATUSES.includes(s)) fail(`${what}: status must be one of ${STATUSES.join(', ')}.`);
    if (s !== 'fact' && !String(o.basis || '').trim()) fail(`${what}: status "${s}" needs a basis (why inferred, or the open question).`);
    if (o.basis && !cap(o.basis, 200, 90)) fail(`${what}: basis is too long (200, or 90 for Chinese).`);
  };
  for (const n of nodes) {
    if (!n.id || typeof n.id !== 'string' || !/^[a-z0-9-]+$/.test(n.id)) fail(`Node id must be lower-case letters, digits or hyphens: ${JSON.stringify(n.id)}.`);
    if (ids.has(n.id)) fail(`Duplicate node id: ${n.id}.`);
    ids.add(n.id);
    if (!n.label) fail(`Node ${n.id}: label is required.`);
    else if (!cap(n.label, 34, 16)) fail(`Node ${n.id}: label is too long (34, or 16 for Chinese).`);
    if (!NODE_TYPES.includes(n.type)) fail(`Node ${n.id}: type must be one of ${NODE_TYPES.join(', ')}.`);
    if (n.note && !cap(n.note, 240, 110)) fail(`Node ${n.id}: note is too long (240, or 110 for Chinese).`);
    certain(n, `Node ${n.id}`);
  }
  const nos = new Set();
  for (const l of lines) {
    if (!Number.isInteger(l.no) || l.no < 1 || l.no > 8) fail(`Line number must be a whole number from 1 to 8: ${JSON.stringify(l.no)}.`);
    if (nos.has(l.no)) fail(`Duplicate line number: ${l.no}.`);
    nos.add(l.no);
    if (!l.name) fail(`Line ${l.no}: name is required.`);
    else if (!cap(l.name, 24, 10)) fail(`Line ${l.no}: name is too long (24, or 10 for Chinese).`);
  }
  const seenEdge = new Set();
  const touched = new Set();
  edges.forEach((e, i) => {
    const what = `Edge ${i + 1} (${e.from} to ${e.to})`;
    if (!ids.has(e.from)) fail(`${what}: from is not a node id.`);
    if (!ids.has(e.to)) fail(`${what}: to is not a node id.`);
    if (e.from === e.to) fail(`${what}: a station cannot link to itself.`);
    if (!EDGE_TYPES.includes(e.type)) fail(`${what}: type must be one of ${EDGE_TYPES.join(', ')}.`);
    if (e.line !== undefined && !nos.has(e.line)) fail(`${what}: line ${e.line} is not declared.`);
    if (e.label && !cap(e.label, 40, 18)) fail(`${what}: label is too long (40, or 18 for Chinese).`);
    const key = `${e.from}>${e.to}>${e.line || 0}`;
    if (seenEdge.has(key)) fail(`${what}: duplicate edge on the same line.`);
    seenEdge.add(key);
    certain(e, what);
    touched.add(e.from); touched.add(e.to);
  });
  for (const l of lines) {
    const own = edges.filter((e) => e.line === l.no);
    if (own.length < 1) { fail(`Line ${l.no} has no edges.`); continue; }
    const outs = {}; const ins = {};
    let branch = false;
    for (const e of own) {
      if (outs[e.from]) branch = true; if (ins[e.to]) branch = true;
      outs[e.from] = e.to; ins[e.to] = e.from;
    }
    if (branch) { fail(`Line ${l.no} branches. A line is one unbroken route: give the branch its own line, or make it an unlined edge.`); continue; }
    const starts = Object.keys(outs).filter((id) => !ins[id]);
    const start = starts[0] ?? Object.keys(outs).sort()[0];
    if (starts.length > 1) { fail(`Line ${l.no} is broken into separate pieces. Its edges must chain head to tail.`); continue; }
    let cur = start; let n = 0; const seen = new Set([cur]);
    while (outs[cur] && n <= own.length) { cur = outs[cur]; n++; if (seen.has(cur)) break; seen.add(cur); }
    if (n !== own.length) fail(`Line ${l.no} is broken into separate pieces. Its edges must chain head to tail.`);
  }
  for (const e of edges) {
    const ends = nodes.filter((n) => n.id === e.from || n.id === e.to);
    if ((e.status || 'fact') === 'fact' && ends.some((n) => n.status === 'unknown')) warns.push(`Edge ${e.from} to ${e.to} is a fact but touches an unknown station. If the link itself is in question, mark it unknown with the same basis.`);
  }
  for (const n of nodes) {
    if (!touched.has(n.id) && (n.status || 'fact') !== 'unknown') fail(`Node ${n.id} has no edges. Connect it, or mark it unknown and say what is missing.`);
  }

  // Language: one language per version
  const visible = [m.title, m.subtitle, ...lines.flatMap((l) => [l.name, l.role]),
    ...nodes.flatMap((n) => [n.label, n.note, n.basis, n.owner]),
    ...edges.flatMap((e) => [e.label, e.basis])].filter(Boolean);
  const uiText = [];
  (function walk(o, key) {
    if (typeof o === 'string') { if (key !== 'lang') uiText.push(o); return; }
    if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], k);
  })(ui || {});
  if (lang === 'en') {
    if (CJK.test(html)) {
      const at = html.search(CJK);
      fail(`Chinese text in an English map, near: ${html.slice(Math.max(0, at - 20), at + 20).replace(/\s+/g, ' ')}`);
    }
    if (ui && ui.lang !== 'en') fail('The interface strings are not English.');
  }
  if (lang === 'zh') {
    if (ui && ui.lang !== 'zh-CN') fail('The interface strings are not Chinese.');
    const keep = (m.keepLatin || []).slice().sort((a, b) => b.length - a.length);
    for (const s of [...visible, ...uiText]) {
      let t = String(s);
      for (const k of keep) t = t.split(k).join('');
      t = t.replace(/\{n\}/g, '');
      if (/[A-Za-z]/.test(t)) fail(`English in a Chinese map: "${s}". Translate it, or list a name that must stay in meta.keepLatin.`);
    }
    if (keep.length) warns.push(`Latin terms allowed by meta.keepLatin: ${keep.join(', ')}.`);
  }
  if (m.fictional && ui && !html.includes(ui.fictional)) fail('A fictional map must carry its fictional label.');

  // 6. Layout: runs here too, so the geometry itself is tested
  const code = between(html, blockRe('script', 'atlas-layout'));
  if (code && !fails.length) {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx, { timeout: 30000 });
    const run = (s) => JSON.stringify(ctx.computeTransitLayout(JSON.parse(JSON.stringify(s))));
    const t0 = Date.now();
    const a = run(sys);
    stat.layoutMs = Date.now() - t0;
    if (a !== run(sys)) fail('The layout is not deterministic: two runs differ.');
    const shuffled = { ...sys, nodes: [...nodes].reverse(), edges: [...edges].reverse(), lines: [...lines].reverse() };
    if (a !== run(shuffled)) fail('The layout depends on JSON order: a reversed copy differs.');
    const L = JSON.parse(a);
    let bad = 0;
    for (const s of L.segs) {
      for (let i = 0; i < s.pts.length - 1; i++) {
        const dx = Math.abs(s.pts[i + 1].x - s.pts[i].x); const dy = Math.abs(s.pts[i + 1].y - s.pts[i].y);
        if (!(dx < 0.1 || dy < 0.1 || Math.abs(dx - dy) < 0.1)) bad++;
      }
    }
    if (bad) fail(`${bad} track segments are not at 0, 45 or 90 degrees.`);
    const pts = Object.values(L.nodes);
    const hit = (p, q) => p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
    let overlap = 0; let onStation = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 40) fail(`Stations ${pts[i].id} and ${pts[j].id} are on top of each other.`);
        if (hit(pts[i].label.rect, pts[j].label.rect)) overlap++;
      }
      for (const q of pts) {
        if (q !== pts[i]) {
          const g = q.interchange ? 17 : 13;
          if (hit(pts[i].label.rect, { x: q.x - g, y: q.y - g, w: g * 2, h: g * 2 })) onStation++;
        }
      }
    }
    if (overlap) fail(`${overlap} label pairs overlap. Shorten the labels concerned.`);
    // Labels that read as one caption: stacked or end to end with no clear gap
    const clashes = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (ctx.transitReadsAsOne(pts[i].label.rect, pts[j].label.rect)) clashes.push(`"${pts[i].label.lines.join(' ')}" and "${pts[j].label.lines.join(' ')}"`);
      }
    }
    if (clashes.length) fail(`These labels sit so close they read as one caption: ${clashes.join('; ')}. Shorten them or change which journeys are lines.`);
    // A label must not cover any track, link or plate
    const covered = [];
    for (const q of pts) {
      const r0 = q.label.rect;
      const r = { x: r0.x - 5, y: r0.y - 2, w: r0.w + 10, h: r0.h + 5 };
      let length = 0;
      for (const s of L.segs) {
        for (let i = 0; i < s.pts.length - 1; i++) {
          const a0 = s.pts[i]; const b0 = s.pts[i + 1]; const ll = Math.hypot(b0.x - a0.x, b0.y - a0.y);
          for (let d = 0; d <= ll; d += 2) {
            const x = a0.x + (b0.x - a0.x) * d / (ll || 1); const y = a0.y + (b0.y - a0.y) * d / (ll || 1);
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) length += 2;
          }
        }
        if (s.plate && hit(r, { x: s.plate.x - 9, y: s.plate.y - 9, w: 18, h: 18 })) length += 18;
      }
      if (length) covered.push(`"${q.label.lines.join(' ')}" (${length} units)`);
    }
    if (covered.length) fail(`These labels cover track or a plate: ${covered.join('; ')}. Shorten them or change which journeys are lines.`);
    const unplated = L.segs.filter((s) => s.status !== 'fact' && !s.plate).length;
    if (unplated) fail(`${unplated} inferred or unknown edges have no plate.`);
    // Reading size at Fit on a 1280x800 screen
    if (L.fitLabelPx < 11) fail(`Labels would open at ${L.fitLabelPx} px at Fit on a 1280x800 screen; the minimum is 11. Split this map, or use fewer stations and lines.`);
    if (onStation) fail(`${onStation} labels sit on a station. Shorten the labels concerned.`);
    let through = 0;
    for (const s of L.segs) {
      for (const q of pts) {
        if (q.id === s.from || q.id === s.to) continue;
        for (let i = 0; i < s.pts.length - 1; i++) {
          const a0 = s.pts[i]; const b0 = s.pts[i + 1];
          const vx = b0.x - a0.x; const vy = b0.y - a0.y; const ll = vx * vx + vy * vy;
          const t = ll ? Math.max(0, Math.min(1, ((q.x - a0.x) * vx + (q.y - a0.y) * vy) / ll)) : 0;
          if (Math.hypot(a0.x + t * vx - q.x, a0.y + t * vy - q.y) < 14) { through++; break; }
        }
      }
    }
    if (through) warns.push(`${through} tracks pass close to a station they do not serve. Look at the map; try a different line order.`);
    const unk = new Set([...nodes, ...edges].filter((o) => o.status === 'unknown').map((o) => o.basis)).size;
    const inf = nodes.filter((n) => n.status === 'inferred').length + edges.filter((e) => e.status === 'inferred').length;
    Object.assign(stat, { nodes: nodes.length, edges: edges.length, lines: lines.length, inferred: inf, openQuestions: unk, fitLabelPx: L.fitLabelPx, interchanges: pts.filter((p) => p.interchange).length, sheet: `${Math.round(L.box.w)}x${Math.round(L.box.h)}` });
  }
}

for (const w of warns) console.warn(`warn: ${w}`);
if (fails.length) {
  for (const f of [...new Set(fails)]) console.error(`FAIL: ${f}`);
  console.error(`check.mjs: ${new Set(fails).size} problem(s) in ${path}`);
  process.exit(1);
}
console.log(`check.mjs: OK ${path} ${JSON.stringify(stat)}`);
