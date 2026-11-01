#!/usr/bin/env node
// Usage: node scripts/handoff.mjs <map.html>
// Prints the three-part handoff from the map's own JSON, in the map's language, so the message cannot drift from the file.
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/handoff.mjs <map.html>');
  process.exit(2);
}
const html = readFileSync(path, 'utf8');
const block = (id) => {
  const m = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`));
  if (!m) {
    console.error(`Missing block ${id}.`);
    process.exit(1);
  }
  return JSON.parse(m[1]);
};
const ui = block('ui-data');
const sys = block('system-data');
const label = Object.fromEntries(sys.nodes.map((n) => [n.id, n.label]));
for (const st of ['fact', 'inferred', 'unknown']) {
  if (st === 'unknown') {
    // Items that share a basis are one open question
    const groups = new Map();
    for (const o of [...sys.nodes, ...sys.edges]) {
      if (o.status !== 'unknown') continue;
      if (!groups.has(o.basis)) groups.set(o.basis, { nodes: [], edges: [] });
      (o.id ? groups.get(o.basis).nodes : groups.get(o.basis).edges).push(o);
    }
    console.log(`## ${ui.handoffCols[st]} (${groups.size})`);
    for (const [basis, g] of groups) {
      const names = g.nodes.length ? g.nodes.map((n) => n.label) : g.edges.map((e) => `${label[e.from]} -> ${label[e.to]}`);
      console.log(`- ${names.join(', ')}${ui.colon}${basis}`);
    }
    console.log('');
    continue;
  }
  const ns = sys.nodes.filter((n) => (n.status || 'fact') === st);
  const es = sys.edges.filter((e) => (e.status || 'fact') === st);
  console.log(`## ${ui.handoffCols[st]} (${ns.length + es.length})`);
  for (const n of ns) console.log(`- ${n.label}${(st === 'fact' ? n.note : n.basis) ? `${ui.colon}${st === 'fact' ? n.note : n.basis}` : ''}`);
  for (const e of es) {
    const d = st === 'fact' ? e.label : e.basis;
    console.log(`- ${label[e.from]} -> ${label[e.to]}${d ? `${ui.colon}${d}` : ''}`);
  }
  console.log('');
}
const roles = (sys.lines || []).filter((l) => l.role).sort((a, b) => a.no - b.no);
if (roles.length) {
  console.log(`## ${ui.handoffLines}`);
  for (const l of roles) console.log(`- ${l.no} ${l.name}${ui.colon}${l.role}`);
}
