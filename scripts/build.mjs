#!/usr/bin/env node
// Usage: node scripts/build.mjs <system.json> <output.html>
// Pours one system JSON and the matching interface strings into the locked template.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [dataPath, outPath] = process.argv.slice(2);
if (!dataPath || !outPath) {
  console.error('Usage: node scripts/build.mjs <system.json> <output.html>');
  process.exit(2);
}
let sys;
try {
  sys = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch (err) {
  console.error(`Cannot read ${dataPath} as JSON: ${err.message}`);
  process.exit(1);
}
const lang = sys.meta && sys.meta.lang;
if (lang !== 'en' && lang !== 'zh') {
  console.error('meta.lang must be "en" or "zh".');
  process.exit(1);
}
const ui = JSON.parse(readFileSync(join(here, '..', 'assets', `ui.${lang}.json`), 'utf8'));
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const swap = {
  '{{LANG}}': ui.lang,
  '{{TITLE}}': esc(sys.meta.title || ''),
  '{{NOSCRIPT}}': esc(ui.noscript),
  '{{UI_JSON}}': safeJson(ui),
  '{{SYSTEM_JSON}}': safeJson(sys),
};
let html = readFileSync(join(here, '..', 'assets', 'template.html'), 'utf8');
for (const [k, v] of Object.entries(swap)) html = html.split(k).join(v);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(`Wrote ${outPath}. Now run: node ${join(here, 'check.mjs')} ${outPath}`);
