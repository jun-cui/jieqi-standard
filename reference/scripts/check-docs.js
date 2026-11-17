#!/usr/bin/env node
// Check the documentation: every relative link and #anchor in every Markdown
// file must resolve, and every position string (JPS) quoted in the documents
// must parse and be valid.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Position } from '../src/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JPS_SHAPE = /^[GAEHRCSXgaehrcsx1-9]+(\/[GAEHRCSXgaehrcsx1-9]+){9} [rb] \S+ \S+ \d+ \d+( [AEHRCSaehrcs]+)?$/;

function markdownFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (name.endsWith('.md')) out.push(path);
  }
  return out;
}

/** GitHub-style heading anchors. */
function anchorsOf(text) {
  const seen = new Map();
  const anchors = new Set();
  for (const line of withoutFences(text).split('\n')) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (!m) continue;
    let slug = m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    if (n) slug += `-${n}`;
    anchors.add(slug);
  }
  return anchors;
}

function withoutFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, '');
}

const problems = [];
let links = 0;
let positions = 0;
const files = markdownFiles(ROOT);
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const where = relative(ROOT, file);
  for (const m of withoutFences(text).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    links++;
    const [path, anchor] = target.split('#');
    const dest = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
    if (!existsSync(dest)) {
      problems.push(`${where}: broken link ${target}`);
      continue;
    }
    if (anchor && dest.endsWith('.md') && !anchorsOf(readFileSync(dest, 'utf8')).has(anchor)) {
      problems.push(`${where}: no heading for #${anchor} in ${relative(ROOT, dest)}`);
    }
  }
  const candidates = [
    ...[...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]),
    ...text.split('\n').map((l) => l.trim()),
  ];
  for (const c of new Set(candidates)) {
    if (!JPS_SHAPE.test(c)) continue;
    positions++;
    try {
      Position.parse(c);
    } catch (e) {
      problems.push(`${where}: invalid position "${c}": ${e.message}`);
    }
  }
}

console.log(`${files.length} documents: ${links} links and ${positions} positions checked, ${problems.length} problems`);
for (const p of problems) console.log(`  FAIL ${p}`);
process.exitCode = problems.length ? 1 : 0;
